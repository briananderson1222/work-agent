import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ParsedCoreArgs {
  flags: Record<string, string | boolean>;
  positionals: string[];
}

type JsonEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export function parseCoreArgs(args: string[]): ParsedCoreArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const trimmed = arg.slice(2);
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      flags[trimmed] = true;
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    const value = trimmed.slice(equalsIndex + 1);
    flags[key] = value;
  }

  return { flags, positionals };
}

export function resolveApiBase(parsed: ParsedCoreArgs): string {
  const explicit = parsed.flags['api-base'];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit.replace(/\/+$/, '');
  }

  if (process.env.STALLION_API_BASE) {
    return process.env.STALLION_API_BASE.replace(/\/+$/, '');
  }

  const port = process.env.STALLION_PORT || '3141';
  return `http://127.0.0.1:${port}`;
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export async function requestJson<T>(
  apiBase: string,
  path: string,
  init?: RequestInit,
): Promise<T | { success: true; message?: string }> {
  const response = await fetch(`${apiBase}${path}`, {
    method: init?.method || 'GET',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });

  let payload: JsonEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as JsonEnvelope<T>;
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed with HTTP ${response.status}`);
    }
    throw new Error('Expected JSON response');
  }

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.error ||
        payload.message ||
        `Request failed with HTTP ${response.status}`,
    );
  }

  if (payload.data !== undefined) {
    return payload.data;
  }

  return { success: true, message: payload.message };
}

export function requirePositional(
  parsed: ParsedCoreArgs,
  index: number,
  name: string,
): string {
  const value = parsed.positionals[index];
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

async function readStdin(): Promise<string> {
  return await new Promise<string>((resolvePromise, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolvePromise(data));
    process.stdin.on('error', reject);
  });
}

export async function loadJsonPayload(
  parsed: ParsedCoreArgs,
): Promise<Record<string, unknown>> {
  const inline = parsed.flags.data;
  if (typeof inline === 'string' && inline.length > 0) {
    return JSON.parse(inline) as Record<string, unknown>;
  }

  const file = parsed.flags.file;
  if (typeof file === 'string' && file.length > 0) {
    return JSON.parse(readFileSync(resolve(file), 'utf8')) as Record<
      string,
      unknown
    >;
  }

  if (!process.stdin.isTTY) {
    const stdin = (await readStdin()).trim();
    if (stdin.length > 0) {
      return JSON.parse(stdin) as Record<string, unknown>;
    }
  }

  throw new Error(
    'Provide JSON input with --data=<json>, --file=<path>, or piped stdin.',
  );
}

export async function loadTextInput(
  parsed: ParsedCoreArgs,
  startIndex = 0,
): Promise<string> {
  const inline = parsed.positionals.slice(startIndex).join(' ').trim();
  if (inline.length > 0) {
    return inline;
  }

  const dataFlag = parsed.flags.data;
  if (typeof dataFlag === 'string' && dataFlag.length > 0) {
    return dataFlag;
  }

  const fileFlag = parsed.flags.file;
  if (typeof fileFlag === 'string' && fileFlag.length > 0) {
    return readFileSync(resolve(fileFlag), 'utf8');
  }

  if (!process.stdin.isTTY) {
    const stdin = await readStdin();
    if (stdin.trim().length > 0) {
      return stdin;
    }
  }

  throw new Error(
    'Provide message text as positional args, --data=<text>, --file=<path>, or piped stdin.',
  );
}

export async function streamSse(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available for streaming');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split('\n\n');
      buffer = segments.pop() || '';

      for (const segment of segments) {
        const line = segment
          .split('\n')
          .find((entry) => entry.startsWith('data: '));
        if (!line) {
          continue;
        }

        const payload = line.slice(6);
        if (payload === '[DONE]') {
          return;
        }

        onEvent(JSON.parse(payload) as Record<string, unknown>);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}
