export interface AgentGuardrails {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  maxSteps?: number;
}

export interface AgentTools {
  mcpServers: string[];
  available?: string[];
  autoApprove?: string[];
  aliases?: Record<string, string>;
}

export interface SlashCommand {
  name: string;
  description?: string;
  prompt: string;
  params?: SlashCommandParam[];
}

export interface SlashCommandParam {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentExecutionConfig {
  runtimeConnectionId: string;
  modelConnectionId?: string | null;
  modelId?: string | null;
  runtimeOptions?: Record<string, unknown>;
  modelOptions?: Record<string, unknown>;
}

export interface AgentSpec {
  name: string;
  prompt: string;
  description?: string;
  icon?: string;
  model?: string;
  execution?: AgentExecutionConfig;
  region?: string;
  maxSteps?: number;
  guardrails?: AgentGuardrails;
  streaming?: {
    useNewPipeline?: boolean;
    enableThinking?: boolean;
    debugStreaming?: boolean;
  };
  tools?: AgentTools;
  skills?: string[];
  commands?: Record<string, SlashCommand>;
  ui?: AgentUIConfig;
}

export interface AgentMetadata {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  plugin?: string;
  ui?: AgentUIConfig;
  workflowWarnings?: string[];
}
