import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigPath = resolve(rootDir, '.omx/plans/ai-guidance-pilot.config.json');

export function loadPilotConfig(configPath = defaultConfigPath) {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function normalizeRepoPath(filePath, cwd = rootDir) {
  const absolutePath = resolve(cwd, filePath);
  return relative(rootDir, absolutePath).replaceAll('\\', '/');
}

export function matchesPatterns(filePath, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? filePath.startsWith(pattern) : filePath === pattern,
  );
}

export function classifyNodes(files, config, cwd = rootDir) {
  const matchedNodeIds = new Set();
  const matchedLaneLabels = new Set();
  const unmatchedFiles = [];

  for (const file of files) {
    const normalized = normalizeRepoPath(file, cwd);
    let matched = false;
    for (const node of config.graph.nodes) {
      if (matchesPatterns(normalized, node.patterns)) {
        matchedNodeIds.add(node.id);
        matchedLaneLabels.add(node.label);
        matched = true;
      }
    }
    if (!matched) {
      unmatchedFiles.push(normalized);
    }
  }

  return {
    affectedNodes: [...matchedNodeIds].sort(),
    affectedLanes: [...matchedLaneLabels].sort(),
    unmatchedFiles,
  };
}

export function resolveWorkstream(options, config, normalizedFiles = []) {
  if (options.workstream) {
    return {
      resolvedPhase: options.phase ?? config.graph.activePhase,
      resolvedWorkstream: options.workstream,
      matchedArtifacts: ['explicit-workstream'],
      promotionAllowed: options.workstream !== 'multi-workstream',
    };
  }

  for (const rule of config.graph.resolutionRules ?? []) {
    if (matchesPatternsForAnyFile(normalizedFiles, rule.match.patterns)) {
      return {
        resolvedPhase: rule.resolution.phase,
        resolvedWorkstream: rule.resolution.workstream,
        matchedArtifacts: rule.resolution.matchedArtifacts,
        promotionAllowed: true,
      };
    }
  }

  const defaultResolution = config.graph.defaultResolution;
  return {
    resolvedPhase: defaultResolution.phase,
    resolvedWorkstream: defaultResolution.workstream,
    matchedArtifacts: defaultResolution.matchedArtifacts,
    promotionAllowed: true,
  };
}

export function matchesPatternsForAnyFile(files, patterns) {
  return files.some((file) => matchesPatterns(file, patterns));
}

export function parseBaselineCiFastStatus(status) {
  if (status === 'success') {
    return true;
  }
  if (status === 'failed') {
    return false;
  }
  return null;
}

export function formatTriState(value) {
  if (value === true) {
    return 'yes';
  }
  if (value === false) {
    return 'no';
  }
  return 'unknown';
}

export function buildEvidenceRecord({
  files,
  options = {},
  config,
  cwd = rootDir,
}) {
  const runId = options.runId ?? `guidance-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const normalizedFiles = files.map((file) => normalizeRepoPath(file, cwd));
  const { affectedNodes, affectedLanes, unmatchedFiles } = classifyNodes(files, config, cwd);
  const resolution = resolveWorkstream(options, config, normalizedFiles);
  const baselineCiFastPassed = parseBaselineCiFastStatus(options.baselineCiFastStatus);

  return {
    framework_version: config.frameworkVersion,
    run_id: runId,
    timestamp,
    source_ref: options.sourceRef ?? 'local-dry-run',
    resolved_phase: resolution.resolvedPhase,
    resolved_workstream: resolution.resolvedWorkstream,
    matched_artifacts: resolution.matchedArtifacts,
    affected_nodes: affectedNodes,
    affected_lanes: affectedLanes,
    baseline_ci_fast_passed: baselineCiFastPassed,
    recommendations: unmatchedFiles.length
      ? [
          {
            kind: 'unmatched-files',
            message: 'Some files do not match a configured lane and need manual review.',
            files: unmatchedFiles,
          },
        ]
      : [],
    false_positive_review: config.policy.defaultFalsePositiveReview,
    promotion_candidate: config.policy.defaultPromotionCandidate,
    override_or_bypass: config.policy.defaultOverrideOrBypass,
    owner: options.owner ?? null,
    files: normalizedFiles,
    unresolved_files: unmatchedFiles,
    promotion_allowed: resolution.promotionAllowed,
    framework: {
      version: config.frameworkVersion,
      resolver_precedence: config.graph.resolverPrecedence,
      policy_defaults: {
        false_positive_review: config.policy.defaultFalsePositiveReview,
        promotion_candidate: config.policy.defaultPromotionCandidate,
        override_or_bypass: config.policy.defaultOverrideOrBypass,
      },
    },
    adapter: {
      name: config.adapter.name,
      kind: config.adapter.kind,
      report_transport: config.evidence.reportTransport,
      default_resolution: config.graph.defaultResolution,
      non_sliceable_invariants: config.graph.nonSliceableInvariants,
      required_proof_lanes: config.evidence.requiredProofLanes,
    },
  };
}

export function writeEvidenceArtifact(record, config) {
  const artifactDir = resolve(rootDir, config.evidence.artifactDir);
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, `${record.run_id}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return artifactPath;
}

export function listChangedFiles(fromRef, toRef, cwd = rootDir) {
  if (!fromRef || !toRef) {
    return [];
  }

  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', fromRef, toRef],
    {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildMarkdownSummary(record, artifactPath) {
  const lines = [
    '## Guidance Report',
    '',
    `- **Adapter:** ${record.adapter.name} (${record.adapter.kind})`,
    `- **Phase:** ${record.resolved_phase}`,
    `- **Workstream:** ${record.resolved_workstream}`,
    `- **Affected nodes:** ${record.affected_nodes.length ? record.affected_nodes.join(', ') : 'none'}`,
    `- **Affected lanes:** ${record.affected_lanes.length ? record.affected_lanes.join(', ') : 'none'}`,
    `- **Required proof lane:** \`${record.adapter.required_proof_lanes.join(', ')}\``,
    `- **Baseline \`ci:fast\` passed:** ${formatTriState(record.baseline_ci_fast_passed)}`,
    `- **Report transport:** ${record.adapter.report_transport}`,
    `- **Artifact:** \`${artifactPath}\``,
  ];

  if (record.recommendations.length > 0) {
    lines.push('', '### Recommendations');
    for (const recommendation of record.recommendations) {
      lines.push(`- ${recommendation.message}`);
      if (recommendation.files?.length) {
        lines.push(`  - Files: ${recommendation.files.join(', ')}`);
      }
    }
  } else {
    lines.push('', '- No recommendations.');
  }

  return `${lines.join('\n')}\n`;
}

export function parseArgs(argv) {
  const options = {};
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--workstream') {
      options.workstream = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--phase') {
      options.phase = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--source-ref') {
      options.sourceRef = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--owner') {
      options.owner = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--baseline-ci-fast-status') {
      options.baselineCiFastStatus = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--run-id') {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--changed-from') {
      options.changedFrom = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--changed-to') {
      options.changedTo = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--summary-path') {
      options.summaryPath = argv[index + 1];
      index += 1;
      continue;
    }
    files.push(token);
  }

  return { options, files };
}

export function runCli(argv = process.argv.slice(2)) {
  const { options, files: explicitFiles } = parseArgs(argv);
  const files =
    explicitFiles.length > 0
      ? explicitFiles
      : listChangedFiles(options.changedFrom, options.changedTo);

  if (files.length === 0) {
    throw new Error('guidance-report requires at least one file path');
  }

  const config = loadPilotConfig();
  const record = buildEvidenceRecord({ files, options, config });
  const artifactPath = writeEvidenceArtifact(record, config);
  const relativeArtifactPath = relative(rootDir, artifactPath).replaceAll('\\', '/');
  const markdownSummary = buildMarkdownSummary(record, relativeArtifactPath);

  const resolvedSummaryPath =
    options.summaryPath ??
    (config.evidence.reportTransport === 'github-step-summary'
      ? process.env.GITHUB_STEP_SUMMARY
      : undefined);

  if (resolvedSummaryPath) {
    appendFileSync(resolvedSummaryPath, markdownSummary, 'utf8');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        artifactPath: relativeArtifactPath,
        markdownSummary,
        ...record,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli();
}
