import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildEvidenceRecord as buildEvidenceRecordCore,
  buildMarkdownSummary,
  classifyNodes as classifyNodesCore,
  loadAdapterConfig,
  loadPolicyPack as loadPolicyPackCore,
  matchesPatterns,
  matchesPatternsForAnyFile,
  normalizeRepoPath as normalizeRepoPathCore,
  parseArgs,
  parseBaselineCiFastStatus,
  resolveWorkstream as resolveWorkstreamCore,
  runGuidanceReportCli,
  writeEvidenceArtifact as writeEvidenceArtifactCore,
} from 'ai-guidance-framework';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultAdapterPath = resolve(rootDir, '.ai-guidance/work-agent.adapter.json');
const defaultPolicyPackPath = resolve(
  rootDir,
  '.ai-guidance/policy-packs/work-agent-convergence.policy-pack.json',
);

export {
  buildMarkdownSummary,
  matchesPatterns,
  matchesPatternsForAnyFile,
  parseArgs,
  parseBaselineCiFastStatus,
};

export function loadPilotConfig(configPath = defaultAdapterPath) {
  return loadAdapterConfig(configPath);
}

export function loadPolicyPack(policyPackPath = defaultPolicyPackPath) {
  return loadPolicyPackCore(policyPackPath);
}

export function normalizeRepoPath(filePath, cwd = rootDir) {
  return normalizeRepoPathCore(filePath, cwd);
}

export function classifyNodes(files, config = loadPilotConfig(), cwd = rootDir) {
  return classifyNodesCore(files, config, cwd);
}

export function resolveWorkstream(
  options,
  config = loadPilotConfig(),
  normalizedFiles = [],
) {
  return resolveWorkstreamCore(options, config, normalizedFiles);
}

export function buildEvidenceRecord({
  files,
  options = {},
  config = loadPilotConfig(),
  cwd = rootDir,
}) {
  return buildEvidenceRecordCore({
    files,
    options,
    config,
    policyPack: loadPolicyPack(),
    rootDir: cwd,
  });
}

export function writeEvidenceArtifact(record, config = loadPilotConfig()) {
  return writeEvidenceArtifactCore(record, config, rootDir);
}

export function runCli(argv = process.argv.slice(2)) {
  return runGuidanceReportCli(argv, {
    rootDir,
    adapterPath: defaultAdapterPath,
    policyPackPath: defaultPolicyPackPath,
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli();
}
