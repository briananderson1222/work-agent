/**
 * SDK Types - Shared types for plugin development
 */

// Plugin Manifest
export interface PluginManifest {
  name: string;
  version: string;
  type: 'workspace' | 'component' | 'tool';
  sdkVersion: string;
  displayName: string;
  description?: string;
  entrypoint: string;
  capabilities?: string[];
  permissions?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  
  // Workspace-owned agents
  agents?: Array<{
    slug: string;
    source: string;
  }>;
  
  // Workspace configuration
  workspace?: {
    slug: string;
    source: string;
  };
}

// Agent Types
export interface AgentSummary {
  slug: string;
  name: string;
  prompt?: string;
  model?: string;
  region?: string;
  guardrails?: AgentGuardrails;
  tools?: AgentTools;
  ui?: AgentUI;
}

export interface AgentGuardrails {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface AgentTools {
  mcpServers?: string[];
  available?: string[];
  autoApprove?: string[];
  aliases?: Record<string, string>;
}

export interface AgentUI {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

// Workspace Types
export interface WorkspaceConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  defaultAgent?: string;
  tabs?: WorkspaceTab[];
  globalPrompts?: AgentQuickPrompt[];
}

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: string;
  component?: string;
  prompts?: AgentQuickPrompt[];
}

// Message Types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  toolCalls?: ToolCall[];
  finishReason?: string;
}

export interface MessageAttachment {
  type: string;
  content: string;
  mimeType?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  result?: any;
  status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
}

// Conversation Types
export interface Conversation {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

export interface ConversationStats {
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
}

// Model Types
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

// Navigation Types
export interface NavigationState {
  currentView: string;
  selectedWorkspace?: string;
  selectedAgent?: string;
  dockState: boolean;
  dockHeight: number;
  dockMaximized: boolean;
}

// Toast Types
export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

// Slash Command Types
export interface SlashCommand {
  command: string;
  description: string;
  handler: (args: string[]) => Promise<void> | void;
}

// Workflow Types
export interface WorkflowFile {
  filename: string;
  path: string;
  content?: string;
}

// Tool Types
export interface ToolDefinition {
  id: string;
  kind: 'mcp' | 'builtin';
  displayName?: string;
  description?: string;
  transport?: 'stdio' | 'ws' | 'tcp';
  command?: string;
  args?: string[];
  endpoint?: string;
  permissions?: ToolPermissions;
}

export interface ToolPermissions {
  filesystem?: boolean;
  network?: boolean;
  allowedPaths?: string[];
}

// Workspace Component Props
export interface WorkspaceComponentProps {
  agent?: AgentSummary;
  workspace?: WorkspaceConfig;
  activeTab?: WorkspaceTab;
  onLaunchPrompt?: (prompt: AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

// Plugin Component Type
export type WorkspaceComponent = (props: WorkspaceComponentProps) => JSX.Element;
