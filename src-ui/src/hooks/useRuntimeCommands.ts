import type { ProviderKind } from '@stallion-ai/contracts/provider';
import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { SlashCommand } from './useSlashCommands';

interface RuntimeCommand {
  name: string;
  description: string;
  argumentHint?: string;
  passthrough: boolean;
}

export function useRuntimeCommands(
  provider: ProviderKind | undefined,
): SlashCommand[] {
  const { apiBase } = useApiBase();
  const enabled = !!provider && provider !== 'bedrock';

  const { data } = useQuery<RuntimeCommand[]>({
    queryKey: ['runtime-commands', provider],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/orchestration/providers/${provider}/commands`,
      );
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  if (!enabled || !data) return [];

  return data.map((cmd) => ({
    cmd: `/${cmd.name}`,
    description: cmd.description,
    source: 'runtime' as const,
  }));
}
