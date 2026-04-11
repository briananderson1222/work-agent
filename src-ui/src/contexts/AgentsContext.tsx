import {
  useAgentsQuery,
  useCreateAgentMutation,
  useDeleteAgentMutation,
  useUpdateAgentMutation,
} from '@stallion-ai/sdk';
import type { AgentExecutionConfig } from '@stallion-ai/contracts/agent';
import { log } from '@/utils/logger';

export type AgentData = {
  slug: string;
  name: string;
  description?: string;
  model?: string;
  icon?: string;
  updatedAt?: string;
  commands?: Record<string, any>;
  ui?: any;
  toolsConfig?: any;
  execution?: AgentExecutionConfig;
  workflowWarnings?: string[];
  source?: 'local' | 'acp';
  supportsAttachments?: boolean;
  modelOptions?: Array<{ id: string; name: string; originalId: string }> | null;
};

export function useAgents(): AgentData[] {
  const { data, error } = useAgentsQuery();

  if (error) log.api('Failed to fetch agents:', error);

  return data || [];
}

export function useAgent(slug: string): AgentData | null {
  const agents = useAgents();
  return agents.find((a) => a.slug === slug) || null;
}

export function useAgentActions() {
  const createMutation = useCreateAgentMutation({
    onError: (error) => log.api('Failed to create agent:', error),
  });

  const updateMutation = useUpdateAgentMutation({
    onError: (error) => log.api('Failed to update agent:', error),
  });

  const deleteMutation = useDeleteAgentMutation({
    onError: (error) => log.api('Failed to delete agent:', error),
  });

  return {
    createAgent: (agent: AgentData) =>
      createMutation.mutateAsync(agent as unknown as Record<string, unknown>),
    updateAgent: (slug: string, agent: Partial<AgentData>) =>
      updateMutation.mutateAsync({
        slug,
        agent: agent as Record<string, unknown>,
      }),
    deleteAgent: (slug: string) => deleteMutation.mutateAsync(slug),
  };
}
