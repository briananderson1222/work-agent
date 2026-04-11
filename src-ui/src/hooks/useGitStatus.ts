import { useGitLogQuery, useGitStatusQuery } from '@stallion-ai/sdk';

export function useGitStatus(workingDirectory: string | null | undefined) {
  return useGitStatusQuery(workingDirectory);
}

export function useGitLog(
  workingDirectory: string | null | undefined,
  count = 5,
) {
  return useGitLogQuery(workingDirectory, count);
}
