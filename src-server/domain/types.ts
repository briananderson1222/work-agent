/**
 * Core domain types — re-exported from @stallion-ai/shared.
 * DO NOT define types here. Add them to packages/shared/src/index.ts.
 */
export {
  type AgentGuardrails,
  type AgentInvokeResponse,
  type AgentMetadata,
  type AgentQuickPrompt,
  type AgentSpec,
  AgentSwitchState,
  type AgentTools,
  type AgentUIConfig,
  type AppConfig,
  type ConversationStats,
  type LayoutPrompt,
  type LayoutTab,
  type MemoryEvent,
  type SessionMetadata,
  type SlashCommand,
  type SlashCommandParam,
  type StandaloneLayoutConfig,
  type StandaloneLayoutMetadata,
  type TemplateVariable,
  type ToolCallResponse,
  type ToolDef,
  type ToolMetadata,
  type ToolPermissions,
  type WorkflowMetadata,
} from '@stallion-ai/shared';

// Legacy aliases kept for backwards compat with existing core server code
// that imports ACPConfig from this file
export interface ACPConnectionConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  icon?: string;
  cwd?: string;
  enabled: boolean;
  source?: 'user' | 'plugin';
  interactive?: {
    args: string[];  // '{agent}' placeholder replaced with mode slug at launch
  };
}

export interface ACPConfig {
  connections: ACPConnectionConfig[];
}
