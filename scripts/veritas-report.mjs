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
  runVeritasReportCli,
  writeEvidenceArtifact as writeEvidenceArtifactCore,
} from '@kontourai/veritas';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultAdapterPath = resolve(rootDir, '.veritas/repo.adapter.json');
const defaultPolicyPackPath = resolve(
  rootDir,
  '.veritas/policy-packs/default.policy-pack.json',
);

export {
  buildMarkdownSummary,
  matchesPatterns,
  matchesPatternsForAnyFile,
  parseArgs,
  parseBaselineCiFastStatus,
};

export function loadVeritasConfig(configPath = defaultAdapterPath) {
  return loadAdapterConfig(configPath);
}

export const loadPilotConfig = loadVeritasConfig;

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
  return runVeritasReportCli(argv, {
    rootDir,
    adapterPath: defaultAdapterPath,
    policyPackPath: defaultPolicyPackPath,
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli();
}
