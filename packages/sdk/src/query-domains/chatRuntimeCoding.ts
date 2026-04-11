import { type QueryConfig, resolveApiBase, useApiQuery } from '../query-core';

export interface CodingFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: CodingFileEntry[];
}

export async function fetchCodingFiles(
  workingDir: string,
  apiBase?: string,
): Promise<CodingFileEntry[]> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/coding/files?path=${encodeURIComponent(workingDir)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: CodingFileEntry[];
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to load files');
  }
  return result.data ?? [];
}

export async function fetchCodingDiff(
  workingDir: string,
  apiBase?: string,
): Promise<string> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/coding/git/diff?path=${encodeURIComponent(workingDir)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: { diff?: string } | string;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to load diff');
  }
  if (typeof result.data === 'string') {
    return result.data;
  }
  return result.data?.diff ?? '';
}

export async function fetchCodingFileContent(
  filePath: string,
  apiBase?: string,
): Promise<string> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/coding/files/content?path=${encodeURIComponent(filePath)}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: { content?: string } | string;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to load file content');
  }
  if (typeof result.data === 'string') {
    return result.data;
  }
  return result.data?.content ?? '';
}

export async function fetchTerminalPort(apiBase?: string): Promise<number> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(`${resolvedApiBase}/api/system/terminal-port`);
  const result = (await response.json()) as {
    port?: number;
    data?: { port?: number };
  };
  const port = result.port ?? result.data?.port;
  if (!port) {
    throw new Error('Terminal port unavailable');
  }
  return port;
}

export async function executeCodingCommand(
  command: string,
  cwd: string,
  apiBase?: string,
): Promise<{ stdout?: string; stderr?: string }> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(`${resolvedApiBase}/api/coding/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, cwd }),
  });
  const result = (await response.json()) as {
    success?: boolean;
    data?: { stdout?: string; stderr?: string };
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? `HTTP ${response.status}`);
  }
  return result.data ?? {};
}

export function useCodingFilesQuery(
  workingDir: string | undefined,
  apiBase?: string,
  config?: QueryConfig<CodingFileEntry[]>,
) {
  return useApiQuery(
    ['coding-files', workingDir ?? ''],
    () => fetchCodingFiles(workingDir!, apiBase),
    {
      enabled: !!workingDir && (config?.enabled ?? true),
      staleTime: config?.staleTime,
      gcTime: config?.gcTime,
    },
  );
}

export function useCodingDiffQuery(
  workingDir: string | undefined,
  apiBase?: string,
  config?: QueryConfig<string>,
) {
  return useApiQuery(
    ['coding-diff', workingDir ?? ''],
    () => fetchCodingDiff(workingDir!, apiBase),
    {
      enabled: !!workingDir && (config?.enabled ?? true),
      staleTime: config?.staleTime,
      gcTime: config?.gcTime,
    },
  );
}

export function useCodingFileContentQuery(
  filePath: string | undefined,
  apiBase?: string,
  config?: QueryConfig<string>,
) {
  return useApiQuery(
    ['coding-file-content', filePath ?? ''],
    () => fetchCodingFileContent(filePath!, apiBase),
    {
      enabled: !!filePath && (config?.enabled ?? true),
      staleTime: config?.staleTime,
      gcTime: config?.gcTime,
    },
  );
}
