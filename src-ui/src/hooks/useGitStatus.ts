import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';

export function useGitStatus(workingDirectory: string | null | undefined) {
  const { apiBase } = useApiBase();
  return useQuery({
    queryKey: ['git-status', workingDirectory ?? ''],
    queryFn: async () => {
      if (!workingDirectory) return null;
      const res = await fetch(
        `${apiBase}/api/coding/git/status?path=${encodeURIComponent(workingDirectory)}`,
      );
      const json = await res.json();
      if (!json.success) return null;
      return json.data as {
        branch: string; changes: string[];
        staged: number; unstaged: number; untracked: number;
        lastCommit: { sha: string; author: string; relativeTime: string; message: string } | null;
        ahead: number; behind: number;
      };
    },
    enabled: !!workingDirectory,
    staleTime: 10_000,
  });
}

export function useGitLog(workingDirectory: string | null | undefined, count = 5) {
  const { apiBase } = useApiBase();
  return useQuery({
    queryKey: ['git-log', workingDirectory ?? '', count],
    queryFn: async () => {
      if (!workingDirectory) return [];
      const res = await fetch(
        `${apiBase}/api/coding/git/log?path=${encodeURIComponent(workingDirectory)}&count=${count}`,
      );
      const json = await res.json();
      if (!json.success) return [];
      return json.data as Array<{ sha: string; author: string; relativeTime: string; message: string }>;
    },
    enabled: !!workingDirectory,
    staleTime: 30_000,
  });
}
