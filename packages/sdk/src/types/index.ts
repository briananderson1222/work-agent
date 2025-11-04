export interface SDKConfig {
  apiBase: string;
  authToken?: string;
}

export interface WorkspaceProps {
  agentSlug: string;
}

export interface Agent {
  slug: string;
  name: string;
  prompt: string;
  model?: string;
}

export interface InvokeOptions {
  tools?: string[];
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface InvokeResult {
  output: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  tool: string;
  input: any;
  output: any;
}

export interface Tool {
  id: string;
  name: string;
  description?: string;
  schema?: any;
}

export interface EventHandler<T = any> {
  (data: T): void;
}

export interface KeyboardCommand {
  id: string;
  key: string;
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  handler: () => void;
}

export interface WindowOptions {
  url: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface PluginManifest {
  name: string;
  version: string;
  sdkVersion: string;
  capabilities: string[];
  permissions: string[];
}

export interface Permission {
  id: string;
  granted: boolean;
}
