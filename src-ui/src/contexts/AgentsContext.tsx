import { createContext, useContext, ReactNode } from 'react';
import { useAgentsQuery, useApiMutation, useInvalidateQuery } from '@stallion-ai/sdk';
import { useApiBase } from './ApiBaseContext'';
import { log } from '@/utils/logger';

type AgentData = {
  slug: string;
  name: string;
  description?: string;
  model?: string;
  icon?: string;
  updatedAt?: string;
  commands?: Record<string, any>;
  ui?: any;
  toolsConfig?: any;
  workflowWarnings?: string[];
};

const AgentsContext = createContext<{} | undefined>(undefined);

export function AgentsProvider({ children }: { children: ReactNode }) {
  return (
    <AgentsContext.Provider value={{}}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents(): AgentData[] {
  const context = useContext(AgentsContext);
  if (!context) throw new Error('useAgents must be used within AgentsProvider');

  const { data, isLoading, error } = useAgentsQuery();
  
  if (error) log.api('Failed to fetch agents:', error);
  
  return data || [];
}

export function useAgent(slug: string): AgentData | null {
  const agents = useAgents();
  return agents.find(a => a.slug === slug) || null;
}

export function useAgentActions() {
  const context = useContext(AgentsContext);
  if (!context) throw new Error('useAgentActions must be used within AgentsProvider');
  
  const apiBase = useApiBase();
  const invalidate = useInvalidateQuery();

  const createMutation = useApiMutation(
    async (agent: AgentData) => {
      const response = await fetch(`${apiBase}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    {
      onSuccess: () => invalidate(['agents']),
      onError: (error) => log.api('Failed to create agent:', error),
    }
  );

  const updateMutation = useApiMutation(
    async ({ slug, agent }: { slug: string; agent: Partial<AgentData> }) => {
      const response = await fetch(`${apiBase}/agents/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    {
      onSuccess: () => invalidate(['agents']),
      onError: (error) => log.api('Failed to update agent:', error),
    }
  );

  const deleteMutation = useApiMutation(
    async (slug: string) => {
      const response = await fetch(`${apiBase}/agents/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    {
      onSuccess: () => invalidate(['agents']),
      onError: (error) => log.api('Failed to delete agent:', error),
    }
  );

  return {
    createAgent: (agent: AgentData) => createMutation.mutateAsync(agent),
    updateAgent: (slug: string, agent: Partial<AgentData>) => updateMutation.mutateAsync({ slug, agent }),
    deleteAgent: (slug: string) => deleteMutation.mutateAsync(slug),
  };
}
