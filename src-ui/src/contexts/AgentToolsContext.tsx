import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAgentToolsQuery } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

interface ToolMapping {
  server?: string;
  toolName?: string;
  originalName?: string;
}

const AgentToolsContext = createContext<{} | undefined>(undefined);

export function AgentToolsProvider({ children }: { children: ReactNode }) {
  return (
    <AgentToolsContext.Provider value={{}}>
      {children}
    </AgentToolsContext.Provider>
  );
}

export function useAgentTools(agentSlug: string | undefined): {
  tools: Record<string, ToolMapping>;
  loading: boolean;
  error: string | null;
} {
  const context = useContext(AgentToolsContext);
  if (!context) throw new Error('useAgentTools must be used within AgentToolsProvider');

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
