import type { Tool } from '../../types';
import type { AgentFormData } from './types';

type AgentLike = {
  slug?: string;
  id?: string;
  name?: string;
  description?: string;
  prompt?: string;
  model?:
    | string
    | {
        modelId?: string;
      };
  region?: string;
  guardrails?: Record<string, unknown> | null;
  maxSteps?: number | string | null;
  toolsConfig?: {
    mcpServers?: string[];
    available?: string[];
    autoApprove?: string[];
  };
  execution?: {
    runtimeConnectionId?: string;
    modelConnectionId?: string;
    runtimeOptions?: Record<string, unknown>;
    modelId?: string;
  };
  icon?: string;
  skills?: string[];
  prompts?: string[];
};

export function createEmptyAgentForm(
  defaultRuntimeConnectionId = '',
): AgentFormData {
  return {
    slug: '',
    name: '',
    description: '',
    prompt: '',
    modelId: '',
    region: '',
    guardrails: null,
    maxSteps: '',
    tools: { mcpServers: [], available: [], autoApprove: [] },
    execution: {
      runtimeConnectionId: defaultRuntimeConnectionId,
      modelConnectionId: '',
      runtimeOptions: {},
    },
    icon: '',
    skills: [],
    prompts: [],
  };
}

export function formFromAgent(
  agent: AgentLike,
  defaultRuntimeConnectionId = '',
): AgentFormData {
  return {
    slug: agent.slug || agent.id || '',
    name: agent.name || '',
    description: agent.description || '',
    prompt: agent.prompt || '',
    modelId:
      typeof agent.execution?.modelId === 'string'
        ? agent.execution.modelId
        : typeof agent.model === 'string'
          ? agent.model
          : agent.model?.modelId || '',
    region: agent.region || '',
    guardrails:
      typeof agent.guardrails === 'object' && agent.guardrails
        ? agent.guardrails
        : null,
    maxSteps: agent.maxSteps?.toString() || '',
    tools: {
      mcpServers: agent.toolsConfig?.mcpServers || [],
      available: agent.toolsConfig?.available || [],
      autoApprove: agent.toolsConfig?.autoApprove || [],
    },
    execution: {
      runtimeConnectionId:
        agent.execution?.runtimeConnectionId || defaultRuntimeConnectionId,
      modelConnectionId: agent.execution?.modelConnectionId || '',
      runtimeOptions: agent.execution?.runtimeOptions || {},
    },
    icon: agent.icon || '',
    skills: agent.skills || [],
    prompts: agent.prompts || [],
  };
}

export function createNewAgentForm(
  initialForm?: Partial<AgentFormData>,
  defaultRuntimeConnectionId = '',
) {
  return initialForm
    ? { ...createEmptyAgentForm(defaultRuntimeConnectionId), ...initialForm }
    : createEmptyAgentForm(defaultRuntimeConnectionId);
}

export function isAgentFormDirty(
  form: AgentFormData,
  saved: AgentFormData,
): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

export function validateAgentForm(
  form: AgentFormData,
  isCreating: boolean,
  agentType?: 'managed' | 'connected' | 'acp',
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (agentType !== 'connected' && agentType !== 'acp') {
    if (!form.prompt.trim()) errors.prompt = 'System prompt is required';
  }
  if (isCreating) {
    if (!form.slug.trim()) errors.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(form.slug))
      errors.slug = 'Lowercase letters, numbers, hyphens only';
  }
  return errors;
}

export function buildAgentPayload(form: AgentFormData) {
  return {
    slug: form.slug,
    name: form.name,
    description: form.description || undefined,
    prompt: form.prompt || undefined,
    model: form.modelId || undefined,
    region: form.region || undefined,
    guardrails: form.guardrails || undefined,
    maxSteps: form.maxSteps ? parseInt(form.maxSteps, 10) : undefined,
    tools: form.tools.mcpServers.length > 0 ? form.tools : undefined,
    execution: {
      runtimeConnectionId: form.execution.runtimeConnectionId,
      modelConnectionId: form.execution.modelConnectionId || undefined,
      modelId: form.modelId || undefined,
      runtimeOptions:
        Object.keys(form.execution.runtimeOptions).length > 0
          ? form.execution.runtimeOptions
          : undefined,
    },
    icon: form.icon || undefined,
    skills: form.skills.length > 0 ? form.skills : undefined,
    prompts: form.prompts.length > 0 ? form.prompts : undefined,
  };
}

export function groupAgentToolsByServer(agentTools: Tool[]) {
  const grouped: Record<string, Tool[]> = {};
  for (const tool of agentTools) {
    if (!tool.server) {
      continue;
    }
    if (!grouped[tool.server]) {
      grouped[tool.server] = [];
    }
    grouped[tool.server].push(tool);
  }
  return grouped;
}
