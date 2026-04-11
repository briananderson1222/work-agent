import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import type { Prerequisite } from '@stallion-ai/contracts/tool';

const execFile = promisify(execFileCallback);

export type CliAuthState = 'authenticated' | 'unauthenticated' | 'unknown';

export interface CliCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function findCliBinary(command: string): string | null {
  const pathEnv = process.env.PATH ?? '';
  const suffixes = platform() === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of pathEnv.split(':')) {
    for (const suffix of suffixes) {
      const candidate = `${dir}/${command}${suffix}`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export async function runCliCommand(
  command: string,
  args: string[],
): Promise<CliCommandResult | null> {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      encoding: 'utf-8',
      timeout: 5_000,
      windowsHide: true,
    });
    return {
      stdout,
      stderr,
      code: 0,
    };
  } catch (error) {
    if (error && typeof error === 'object') {
      const result = error as {
        stdout?: string;
        stderr?: string;
        code?: number | null;
      };
      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        code: result.code ?? 1,
      };
    }
    return null;
  }
}

function extractAuthBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractAuthBoolean(item);
      if (extracted !== undefined) return extracted;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const key of ['auth', 'authenticated', 'loggedIn', 'logged_in']) {
    const candidate = extractAuthBoolean(
      (value as Record<string, unknown>)[key],
    );
    if (candidate !== undefined) return candidate;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const candidate = extractAuthBoolean(nested);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

export function parseCliAuthState(
  result: CliCommandResult,
  command: string,
): CliAuthState {
  const lowerOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (
    lowerOutput.includes('not logged in') ||
    lowerOutput.includes('login required') ||
    lowerOutput.includes('authentication required') ||
    lowerOutput.includes(`run \`${command} login\``) ||
    lowerOutput.includes(`run ${command} login`)
  ) {
    return 'unauthenticated';
  }

  const trimmed = result.stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const auth = extractAuthBoolean(parsed);
      if (auth === true) return 'authenticated';
      if (auth === false) return 'unauthenticated';
    } catch {
      // Fall through to exit-code heuristics.
    }
  }

  if (result.code === 0) {
    return 'authenticated';
  }

  return 'unknown';
}

export async function buildCliRuntimePrerequisites(input: {
  command: string;
  displayName: string;
  versionArgs: string[];
  authArgs: string[];
  installStep: string;
  authStep: string;
}): Promise<Prerequisite[]> {
  const binary = findCliBinary(input.command);
  const installStatus = binary ? 'installed' : 'missing';

  const prerequisites: Prerequisite[] = [
    {
      id: `${input.command}-cli`,
      name: `${input.displayName} CLI`,
      description: `Required to launch the ${input.displayName} runtime.`,
      status: installStatus,
      category: 'required',
      installGuide: {
        steps: [input.installStep],
      },
    },
  ];

  if (!binary) {
    prerequisites.push({
      id: `${input.command}-auth`,
      name: `${input.displayName} login`,
      description: `${input.displayName} CLI must be installed before authentication can be verified.`,
      status: 'missing',
      category: 'required',
      installGuide: {
        steps: [input.installStep, input.authStep],
      },
    });
    return prerequisites;
  }

  const versionResult = await runCliCommand(binary, input.versionArgs);
  if (!versionResult || versionResult.code !== 0) {
    prerequisites.push({
      id: `${input.command}-auth`,
      name: `${input.displayName} login`,
      description: `${input.displayName} CLI is installed but failed to run cleanly.`,
      status: 'error',
      category: 'required',
      installGuide: {
        steps: [input.authStep],
      },
    });
    return prerequisites;
  }

  const authResult = await runCliCommand(binary, input.authArgs);
  const authState = authResult
    ? parseCliAuthState(authResult, input.command)
    : 'unknown';

  prerequisites.push({
    id: `${input.command}-auth`,
    name: `${input.displayName} login`,
    description:
      authState === 'unauthenticated'
        ? `${input.displayName} CLI is not authenticated.`
        : `${input.displayName} CLI authentication is managed by the local CLI session.`,
    status: authState === 'unauthenticated' ? 'missing' : 'installed',
    category: 'required',
    installGuide: {
      steps: [input.authStep],
    },
  });

  return prerequisites;
}
