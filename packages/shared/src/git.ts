import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

/**
 * Resolve git info from a hint directory. Falls back through process.argv
 * for bundled environments where import.meta.url may not resolve correctly.
 */
export function resolveGitInfo(hint?: string): {
  gitRoot: string;
  branch: string;
  hash: string;
  remote?: string;
} {
  const candidates = [hint, process.cwd()].filter(Boolean) as string[];
  const serverEntry = process.argv.find(
    (arg) => arg.includes('src-server') || arg.includes('dist-server'),
  );
  if (serverEntry) candidates.splice(1, 0, dirname(resolve(serverEntry)));

  let gitRoot: string | undefined;
  for (const directory of candidates) {
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: directory,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      break;
    } catch {}
  }
  if (!gitRoot) throw new Error('Not a git repository');

  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: gitRoot,
    encoding: 'utf-8',
  }).trim();

  const hash = execSync('git rev-parse HEAD', {
    cwd: gitRoot,
    encoding: 'utf-8',
  })
    .trim()
    .substring(0, 7);

  let remote: string | undefined;
  try {
    remote = execSync('git remote get-url origin', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  return { gitRoot, branch, hash, remote };
}
