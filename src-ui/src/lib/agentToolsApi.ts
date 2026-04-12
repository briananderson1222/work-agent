import { type ApiEnvelope, apiRequest, unwrapApiData } from './apiClient';

export interface AgentToolConfig {
  tools: string[];
  allowed?: string[];
  aliases?: Record<string, string>;
}

export interface ToolDef {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  transport?: string;
  parameters?: Record<string, unknown>;
}

interface AgentToolDetails {
  id: string;
  parameters?: Record<string, unknown>;
}

interface EnrichedAgent {
  id: string;
  slug: string;
  toolsConfig?: {
    mcpServers?: string[];
    available?: string[];
    aliases?: Record<string, string>;
  };
}

export interface ToolManagementData {
  tools: ToolDef[];
  config: AgentToolConfig;
}

export async function fetchToolManagementData(
  apiBase: string,
  agentSlug: string,
): Promise<ToolManagementData> {
  const [toolsEnvelope, agentsEnvelope, agentToolsEnvelope] = await Promise.all(
    [
      apiRequest<ApiEnvelope<ToolDef[]>>(`${apiBase}/tools`),
      apiRequest<ApiEnvelope<EnrichedAgent[]>>(`${apiBase}/agents`),
      apiRequest<ApiEnvelope<AgentToolDetails[]>>(
        `${apiBase}/agents/${encodeURIComponent(agentSlug)}/tools`,
      ),
    ],
  );

  const tools = unwrapApiData(toolsEnvelope, 'Failed to load tools');
  const agents = unwrapApiData(agentsEnvelope, 'Failed to load agents');
  const agentToolDetails = unwrapApiData(
    agentToolsEnvelope,
    'Failed to load agent tools',
  );

  const agent = agents.find(
    (candidate) => candidate.slug === agentSlug || candidate.id === agentSlug,
  );
  if (!agent) {
    throw new Error('Agent not found');
  }

  const toolDetailsById = new Map(
    agentToolDetails.map((tool) => [tool.id, tool.parameters]),
  );

  return {
    tools: tools.map((tool) => ({
      ...tool,
      parameters: toolDetailsById.get(tool.id) ?? tool.parameters,
    })),
    config: {
      tools: agent.toolsConfig?.mcpServers ?? [],
      allowed: agent.toolsConfig?.available,
      aliases: agent.toolsConfig?.aliases,
    },
  };
}

export async function addAgentTool(
  apiBase: string,
  agentSlug: string,
  toolId: string,
): Promise<void> {
  const envelope = await apiRequest<ApiEnvelope<unknown>>(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/tools`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId }),
    },
  );
  unwrapApiData(envelope, 'Failed to add tool');
}

export async function removeAgentTool(
  apiBase: string,
  agentSlug: string,
  toolId: string,
): Promise<void> {
  const envelope = await apiRequest<ApiEnvelope<unknown>>(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/tools/${encodeURIComponent(toolId)}`,
    {
      method: 'DELETE',
    },
  );
  unwrapApiData(envelope, 'Failed to remove tool');
}

export async function updateAgentAllowedTools(
  apiBase: string,
  agentSlug: string,
  allowed: string[],
): Promise<void> {
  const envelope = await apiRequest<ApiEnvelope<unknown>>(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/tools/allowed`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed }),
    },
  );
  unwrapApiData(envelope, 'Failed to update allow list');
}

export async function updateAgentToolAliases(
  apiBase: string,
  agentSlug: string,
  aliases: Record<string, string>,
): Promise<void> {
  const envelope = await apiRequest<ApiEnvelope<unknown>>(
    `${apiBase}/agents/${encodeURIComponent(agentSlug)}/tools/aliases`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliases }),
    },
  );
  unwrapApiData(envelope, 'Failed to update aliases');
}
