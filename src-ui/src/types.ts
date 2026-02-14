export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface SlashCommandParam {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface SlashCommand {
  name: string;
  description?: string;
  prompt: string;
  params?: SlashCommandParam[];
}

export interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentCommands {
  [commandName: string]: SlashCommand;
}

export interface AgentSummary {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  icon?: string;
  ui?: AgentUIConfig;
  commands?: AgentCommands;
  toolsConfig?: {
    mcpServers?: string[];
    available?: string[];
    autoApprove?: string[];
    aliases?: Record<string, string>;
  };
  workflowWarnings?: string[];
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64 or URL
  preview?: string; // For images
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64 or URL
  preview?: string; // For images
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  isEphemeral?: boolean;
  showContinue?: boolean;
  timestamp?: number;
  traceId?: string;
  contentParts?: Array<{
    type: 'text' | 'image' | 'file' | 'tool' | 'reasoning';
    content?: string;
    image?: string;
    mediaType?: string;
    url?: string;
    tool?: any;
  }>;
  attachments?: FileAttachment[];
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any;
    state?: string;
    error?: string;
  }>;
}

export interface WorkflowMetadata {
  id: string;
  label: string;
}

export type ChatSessionSource = 'manual' | 'prompt' | 'workflow';

export type ChatSessionStatus = 'idle' | 'sending' | 'error';

export interface ChatSession {
  id: string;
  conversationId: string;
  agentSlug: string;
  agentName: string;
  title: string;
  source: ChatSessionSource;
  sourceId?: string;
  messages: ChatMessage[];
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  status: ChatSessionStatus;
  isThinking?: boolean;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
  hasUnread: boolean;
  model?: string;
  inputHistory: string[];
  attachments?: FileAttachment[];
  abortController?: AbortController;
}

export interface Tool {
  id: string;
  name: string;
  description?: string;
  kind?: 'mcp' | 'builtin' | 'custom';
  transport?: string;
  enabled?: boolean;
  parameters?: any;
}

export interface WorkflowFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  lastModified: string;
  content?: string;
}

export interface AppConfig {
  apiEndpoint?: string;
  region?: string;
  defaultModel?: string;
  defaultChatFontSize?: number;
  systemPrompt?: string;
  templateVariables?: TemplateVariable[];
  logLevel?: string;
  meetingNotifications?: {
    enabled?: boolean;
    thresholds?: number[]; // Minutes before meeting to show notification
  };
}

export interface TemplateVariable {
  key: string;
  type: 'static' | 'date' | 'time' | 'datetime' | 'custom';
  value?: string;
  format?: string;
}

export type NavigationView =
  | { type: 'workspace' }
  | { type: 'workspaces' }
  | { type: 'agents' }
  | { type: 'prompts' }
  | { type: 'integrations' }
  | { type: 'monitoring' }
  | { type: 'profile' }
  | { type: 'notifications' }
  | { type: 'agent-new' }
  | { type: 'agent-edit'; slug: string; initialTab?: 'basic' | 'model' | 'tools' | 'commands' }
  | { type: 'tools'; slug: string }
  | { type: 'workflows'; slug: string }
  | { type: 'settings' }
  | { type: 'scheduler' }
  | { type: 'workspace-new' }
  | { type: 'workspace-edit'; slug: string };

export interface WorkspacePrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface WorkspaceTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  prompts?: WorkspacePrompt[];
}

export interface WorkspaceConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  tabs: WorkspaceTab[];
  globalPrompts?: WorkspacePrompt[];
}

export interface WorkspaceMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  tabCount: number;
}
