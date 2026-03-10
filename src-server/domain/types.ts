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
  type MemoryEvent,
  type SessionMetadata,
  type SlashCommand,
  type SlashCommandParam,
  type TemplateVariable,
  type ToolCallResponse,
  type ToolDef,
  type ToolMetadata,
  type ToolPermissions,
  type WorkflowMetadata,
  type StandaloneLayoutConfig,
  type StandaloneLayoutMetadata,
  type LayoutPrompt,
  type LayoutTab,
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
}

export interface ACPConfig {
  connections: ACPConnectionConfig[];
}
