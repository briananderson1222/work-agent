export interface ToolPermissions {
  filesystem?: boolean;
  network?: boolean;
  allowedPaths?: string[];
}

export interface ToolDef {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: 'stdio' | 'sse' | 'streamable-http' | 'process' | 'ws' | 'tcp';
  command?: string;
  args?: string[];
  endpoint?: string;
  env?: Record<string, string>;
  builtinPolicy?: {
    name: 'fs_read' | 'fs_write' | 'shell_exec';
    allowedPaths?: string[];
    timeout?: number;
  };
  permissions?: ToolPermissions;
  timeouts?: { startupMs?: number; requestMs?: number };
  healthCheck?: {
    kind?: 'jsonrpc' | 'http' | 'command';
    path?: string;
    intervalMs?: number;
  };
  exposedTools?: string[];
}

export interface ToolMetadata {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: string;
  source?: string;
}

export interface Prerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'missing' | 'error';
  category: 'required' | 'optional';
  source?: string;
  installGuide?: {
    steps: string[];
    commands?: string[];
    links?: string[];
  };
}

export type ConnectionKind = 'model' | 'runtime';

export type ConnectionCapability =
  | 'llm'
  | 'embedding'
  | 'vectordb'
  | 'agent-runtime'
  | 'session-lifecycle'
  | 'tool-calls'
  | 'interrupt'
  | 'approvals'
  | 'resume'
  | 'reasoning-events'
  | 'external-process'
  | 'acp';

export type ConnectionStatus =
  | 'ready'
  | 'degraded'
  | 'missing_prerequisites'
  | 'disabled'
  | 'error';

export interface ConnectionConfig {
  id: string;
  kind: ConnectionKind;
  type: string;
  name: string;
  enabled: boolean;
  description?: string;
  capabilities: ConnectionCapability[];
  config: Record<string, unknown>;
  status: ConnectionStatus;
  prerequisites: Prerequisite[];
  lastCheckedAt?: string | null;
}

export interface RuntimeConnectionSettings {
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface ProviderConnectionConfig {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  capabilities: ('llm' | 'embedding' | 'vectordb')[];
}
