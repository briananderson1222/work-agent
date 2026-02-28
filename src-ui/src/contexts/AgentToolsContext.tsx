import { useAgentToolsQuery } from '@stallion-ai/sdk';
import { useMemo } from 'react';
import { log } from '@/utils/logger';

interface ToolMapping {
  server?: string;
  toolName?: string;
  originalName?: string;
}

export function useAgentTools(agentSlug: string | undefined): {
  tools: Record<string, ToolMapping>;
  loading: boolean;
  error: string | null;
} {
  const { data, isLoading, error } = useAgentToolsQuery(agentSlug);

  const tools = useMemo(() => {
    if (!data) return {};

    return data.reduce((acc: Record<string, ToolMapping>, tool: any) => {
      acc[tool.name] = {
        server: tool.server,
        toolName: tool.toolName,
        originalName: tool.originalName,
      };
      return acc;
    }, {});
  }, [data]);

  if (error) log.api('Failed to fetch agent tools:', error);

  return {
    tools,
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}
