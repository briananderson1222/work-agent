/**
 * Core domain types — re-exported from @work-agent/shared.
 * DO NOT define types here. Add them to packages/shared/src/index.ts.
 */
export {
  type AgentSpec,
  type AgentGuardrails,
  type AgentTools,
  type SlashCommand,
  type SlashCommandParam,
  type AgentUIConfig,
  type AgentQuickPrompt,
  type AgentMetadata,
  type ToolDef,
  type ToolPermissions,
  type ToolMetadata,
  type WorkspaceConfig,
  type WorkspaceTab,
  type WorkspacePrompt,
  type WorkspaceMetadata,
  type AppConfig,
  type TemplateVariable,
  type MemoryEvent,
  type SessionMetadata,
  type ConversationStats,
  type WorkflowMetadata,
  type ToolCallResponse,
  type AgentInvokeResponse,
  AgentSwitchState,
} from '@work-agent/shared';

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
}

export interface ACPConfig {
  connections: ACPConnectionConfig[];
}
