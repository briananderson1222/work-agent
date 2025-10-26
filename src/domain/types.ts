/**
 * Core domain types for the Work Agent system
 */

/**
 * Agent specification defining behavior, model config, and tool access
 */
export interface AgentSpec {
  name: string;
  prompt: string; // system instructions
  model?: string; // falls back to app.defaultModel
  region?: string;
  guardrails?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
  tools?: {
    use: string[]; // tool IDs from catalog
    allowed?: string[]; // allow-list for invocation
    aliases?: Record<string, string>; // alias → tool ID
  };
  ui?: AgentUIConfig;
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
