/**
 * Core domain types for the Work Agent system
 */

/**
 * Agent specification defining behavior, model config, and tool access
 */
export interface AgentSpec {
  name: string;
  prompt: string; // system instructions
  description?: string; // Agent description for display
  icon?: string; // Agent icon (emoji or URL)
  model?: string; // falls back to app.defaultModel
  region?: string;
  maxTurns?: number; // Maximum conversation turns before requiring continue
  guardrails?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    maxSteps?: number; // Maximum number of tool call rounds (default: 5)
  };
  streaming?: {
    useNewPipeline?: boolean; // Feature flag for new streaming architecture
    enableThinking?: boolean; // Send thinking blocks to client
    debugStreaming?: boolean; // Enable debug logging
  };
  tools?: {
    mcpServers: string[]; // MCP server IDs to load
    available?: string[]; // tools agent can invoke (supports wildcards, defaults to ["*"])
    autoApprove?: string[]; // tools that execute without user confirmation in chat mode
    aliases?: Record<string, string>; // alias → tool ID
  };
  commands?: Record<string, SlashCommand>; // Custom slash commands
  ui?: AgentUIConfig;
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

export interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

/**
 * Tool definition for MCP or built-in tools
 */
export interface ToolDef {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;

  // MCP-specific
  transport?: 'stdio' | 'process' | 'ws' | 'tcp';
  command?: string;
  args?: string[];
  endpoint?: string;
  env?: Record<string, string>;

  // Built-in specific
  builtinPolicy?: {
    name: 'fs_read' | 'fs_write' | 'shell_exec';
    allowedPaths?: string[];
    timeout?: number;
  };

  // Permissions (both)
  permissions?: {
    filesystem?: boolean;
    network?: boolean;
    allowedPaths?: string[];
  };

  timeouts?: {
    startupMs?: number;
    requestMs?: number;
  };

  healthCheck?: {
    kind?: 'jsonrpc' | 'http' | 'command';
    path?: string;
    intervalMs?: number;
  };

  exposedTools?: string[]; // hint for MCP tools
}

/**
 * Application-wide configuration
 */
export interface AppConfig {
  region: string;
  defaultModel: string;
  /** Model for /invoke endpoint tool calling */
  invokeModel: string;
  /** Model for /invoke endpoint structured output */
  structureModel: string;
  defaultMaxTurns?: number;
  systemPrompt?: string;
  templateVariables?: TemplateVariable[];
  defaultChatFontSize?: number;
}

export interface TemplateVariable {
  key: string;
  type: 'static' | 'date' | 'time' | 'datetime' | 'custom';
  value?: string;
  format?: string;
}

/**
 * Memory event for VoltAgent memory adapter
 */
export interface MemoryEvent {
  ts: string;
  sessionId: string;
  actor: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  meta?: Record<string, unknown>;
}

/**
 * Session metadata for listing
 */
export interface SessionMetadata {
  sessionId: string;
  lastTs: string;
  sizeBytes?: number;
}

/**
 * Agent metadata for listing
 */
export interface AgentMetadata {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  ui?: AgentUIConfig;
  workflowWarnings?: string[];
}

export interface WorkflowMetadata {
  id: string;
  label: string;
  filename?: string;
  lastModified?: string;
}

/**
 * Tool metadata for listing
 */
export interface ToolMetadata {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
}

/**
 * Agent switch states
 */
export enum AgentSwitchState {
  IDLE = 'IDLE',
  WAITING = 'WAITING',
  TEARDOWN = 'TEARDOWN',
  BUILD = 'BUILD',
  READY = 'READY'
}

/**
 * Conversation statistics tracked per conversation
 */
export interface ConversationStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number; // USD
}

/**
 * Workspace configuration defining UI layout and prompts
 */
export interface WorkspaceConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  tabs: WorkspaceTab[];
  globalPrompts?: WorkspacePrompt[];
}

export interface WorkspaceTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  prompts?: WorkspacePrompt[];
}

export interface WorkspacePrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string; // optional agent slug
}

export interface WorkspaceMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabCount: number;
}

/**
 * ACP connection configuration — a single agent server entry
 */
export interface ACPConnectionConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  icon?: string;
  enabled: boolean;
}

/**
 * ACP configuration file — .work-agent/config/acp.json
 */
export interface ACPConfig {
  connections: ACPConnectionConfig[];
}
