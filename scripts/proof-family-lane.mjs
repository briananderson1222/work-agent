import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePolicyPack, loadPolicyPack } from '@kontourai/veritas';

const rootDir = resolve(fileURLToPath(new URL('../', import.meta.url)));
const manifestPath = resolve(
  rootDir,
  '.veritas/proof-families/repo-guardrails.families.json',
);
const policyPackPath = resolve(
  rootDir,
  '.veritas/policy-packs/default.policy-pack.json',
);
const evidenceRoot = resolve(rootDir, '.veritas/evidence/proof-families');

function parseArgs(argv) {
  const args = {
    lane: 'repo-governance',
    runId: process.env.VERITAS_RUN_ID || 'local',
  };
  for (const arg of argv) {
    if (arg.startsWith('--lane=')) {
      args.lane = arg.slice('--lane='.length);
    } else if (arg.startsWith('--run-id=')) {
      args.runId = arg.slice('--run-id='.length);
    }
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeSidecar(record) {
  mkdirSync(evidenceRoot, { recursive: true });
  const safeRunId = record.runId.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const path = join(evidenceRoot, `${safeRunId}-${record.laneId}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

function workflowFiles() {
  const workflowDir = resolve(rootDir, '.github/workflows');
  if (!existsSync(workflowDir)) {
    return [];
  }
  return readdirSync(workflowDir)
    .filter((fileName) => fileName.endsWith('.yml'))
    .map((fileName) => join(workflowDir, fileName));
}

function runRepoGovernanceChecks() {
  const findings = [];

  if (!existsSync(policyPackPath)) {
    findings.push({
      id: 'missing-policy-pack',
      message: 'Missing .veritas/policy-packs/default.policy-pack.json',
      severity: 'block',
    });
  } else {
    const policyPack = loadPolicyPack(policyPackPath);
    for (const ruleId of [
      'required-work-agent-governance-artifacts',
      'ai-instruction-files-synced',
      'brownfield-gap-log-present',
    ]) {
      const [result] = evaluatePolicyPack(
        policyPack,
        { rootDir },
        { ruleIds: [ruleId] },
      );
      if (!result?.implemented) {
        findings.push({
          id: `${ruleId}-not-implemented`,
          message: `${ruleId} is not executable through Veritas policy evaluation.`,
          severity: 'block',
        });
        continue;
      }
      for (const finding of result.findings) {
        findings.push({
          id: ruleId,
          message: finding.message || `Policy finding in ${ruleId}`,
          artifact: finding.artifact,
          severity: result.stage === 'warn' ? 'warn' : 'block',
        });
      }
    }
  }

  const packageJson = readJson(resolve(rootDir, 'package.json'));
  for (const scriptName of [
    'proof:repo-governance',
    'proof:repo-guardrails',
    'ci:fast',
    'ci:extended',
    'veritas:report',
    'veritas:shadow',
  ]) {
    if (typeof packageJson.scripts?.[scriptName] !== 'string') {
      findings.push({
        id: 'missing-package-script',
        message: `package.json is missing required script: ${scriptName}`,
        severity: 'block',
      });
    }
  }

  const ciWorkflowPath = resolve(rootDir, '.github/workflows/ci.yml');
  if (!existsSync(ciWorkflowPath)) {
    findings.push({
      id: 'missing-ci-workflow',
      message: 'Missing .github/workflows/ci.yml',
      severity: 'block',
    });
  } else {
    const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
    if (ciWorkflow.includes('continue-on-error')) {
      findings.push({
        id: 'ci-continue-on-error',
        message: 'Primary PR CI workflow must not use continue-on-error.',
        severity: 'block',
      });
    }
    if (!ciWorkflow.includes('npm run ci:fast')) {
      findings.push({
        id: 'ci-fast-missing',
        message: 'Primary PR CI workflow must execute npm run ci:fast.',
        severity: 'block',
      });
    }
    if (!ciWorkflow.includes('npm run test:connected-agents')) {
      findings.push({
        id: 'connected-agents-ci-missing',
        message: 'Primary CI workflow must execute the connected-agents suite.',
        severity: 'block',
      });
    }
    if (!ciWorkflow.includes('npm exec -- veritas report')) {
      findings.push({
        id: 'veritas-report-ci-missing',
        message: 'Primary CI workflow must emit a Veritas report.',
        severity: 'block',
      });
    }
  }

  const externalActionPattern =
    /^\s*-\s+uses:\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)\s*$/gm;
  const fullCommitShaPattern = /^[0-9a-f]{40}$/;
  for (const path of workflowFiles()) {
    const relativePath = path.slice(rootDir.length + 1);
    const contents = readFileSync(path, 'utf8');
    for (
      let match = externalActionPattern.exec(contents);
      match !== null;
      match = externalActionPattern.exec(contents)
    ) {
      const [, actionName, ref] = match;
      if (!fullCommitShaPattern.test(ref)) {
        findings.push({
          id: 'unpinned-github-action',
          message: `${relativePath} uses unpinned action ${actionName}@${ref}. Pin to a full commit SHA.`,
          severity: 'block',
        });
      }
    }
  }

  return findings;
}

function runCandidateChecks(family) {
  return [
    {
      id: `${family.id}-candidate-not-required`,
      message: `${family.id} is classified as ${family.defaultDisposition}; it is reported as a family-level candidate and is not a required blocker in this lane.`,
      severity: 'info',
    },
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJson(manifestPath);
  const families = manifest.families.filter(
    (family) => family.laneId === args.lane,
  );

  if (families.length === 0) {
    console.error(`Unknown proof family lane: ${args.lane}`);
    process.exit(1);
  }

  const familyResults = families.map((family) => {
    const findings =
      family.id === 'repo-governance'
        ? runRepoGovernanceChecks()
        : runCandidateChecks(family);
    const blockingFindings = findings.filter(
      (finding) => finding.severity === 'block',
    );
    return {
      id: family.id,
      laneId: family.laneId,
      destination: family.destination,
      owner: family.owner,
      defaultDisposition: family.defaultDisposition,
      currentBlockingStatus: family.currentBlockingStatus,
      regressionSeverity: family.regressionSeverity,
      falsePositiveRisk: family.falsePositiveRisk,
      expiryOrReviewTrigger: family.expiryOrReviewTrigger,
      status: blockingFindings.length > 0 ? 'fail' : 'pass',
      findings,
    };
  });

  const record = {
    schemaVersion: 1,
    runId: args.runId,
    laneId: args.lane,
    sourceProofLaneId: manifest.sourceProofLaneId,
    generatedAt: new Date().toISOString(),
    familyResults,
  };
  const sidecarPath = writeSidecar(record);

  const failed = familyResults.filter((result) => result.status === 'fail');
  if (failed.length > 0) {
    console.error(`Proof family lane failed: ${args.lane}\n`);
    for (const result of failed) {
      for (const finding of result.findings.filter(
        (item) => item.severity === 'block',
      )) {
        console.error(`- ${result.id}: ${finding.message}`);
      }
    }
    console.error(`\nproof-family sidecar: ${sidecarPath}`);
    process.exit(1);
  }

  console.log(`Proof family lane passed: ${args.lane}`);
  console.log(`proof-family sidecar: ${sidecarPath}`);
}

main();
