import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type { AgentExecutionConfig } from '@stallion-ai/shared';

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
  source?: 'local' | 'acp';
  ui?: AgentUIConfig;
  commands?: AgentCommands;
  toolsConfig?: {
    mcpServers?: string[];
    available?: string[];
    autoApprove?: string[];
    aliases?: Record<string, string>;
  };
  execution?: AgentExecutionConfig;
  workflowWarnings?: string[];
  // ACP agent capabilities
  supportsAttachments?: boolean;
  modelOptions?: Array<{ id: string; name: string; originalId: string }> | null;
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
  conversationId?: string;
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
  provider?: ProviderKind;
  providerOptions?: Record<string, unknown>;
  model?: string;
  orchestrationProvider?: ProviderKind;
  orchestrationModel?: string;
  orchestrationStatus?: string;
  inputHistory: string[];
  abortController?: AbortController;
  projectSlug?: string;
  projectName?: string;
  focusDirectoryId?: string;
}

export interface Tool {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  kind?: 'mcp' | 'builtin' | 'custom';
  transport?: string;
  enabled?: boolean;
  parameters?: any;
  server?: string;
  toolName?: string;
}

export interface WorkflowFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  lastModified: string;
  content?: string;
}

export type { TemplateVariable } from '@stallion-ai/shared';
export type AppConfig = Partial<import('@stallion-ai/shared').AppConfig>;

export type NavigationView =
  | { type: 'standalone-layout' }
  | { type: 'agents' }
  | { type: 'agent-detail'; slug: string }
  | { type: 'agent-new' }
  | {
      type: 'agent-edit';
      slug: string;
      initialTab?:
        | 'basic'
        | 'model'
        | 'tools'
        | 'commands'
        | 'skills'
        | 'runtime'
        | 'connection';
    }
  | { type: 'agent-tools'; slug: string }
  | { type: 'workflows'; slug: string }
  | { type: 'skills' }
  | { type: 'prompts' }
  | { type: 'playbooks' }
  | { type: 'connections' }
  | { type: 'connections-providers' }
  | { type: 'connections-provider-edit'; id: string }
  | { type: 'connections-runtime-edit'; id: string }
  | { type: 'connections-tools' }
  | { type: 'connections-tool-edit'; id: string }
  | { type: 'connections-knowledge' }
  | { type: 'plugins' }
  | { type: 'registry' }
  | { type: 'monitoring' }
  | { type: 'schedule' }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'notifications' }
  | { type: 'project'; slug: string }
  | { type: 'project-new' }
  | { type: 'project-edit'; slug: string }
  | { type: 'layout'; projectSlug: string; layoutSlug: string }
  | { type: 'layouts' }
  | { type: 'layout-new' }
  | { type: 'layout-edit'; slug: string };

export type DockMode = 'bottom' | 'right' | 'bottom-inline';

// Workspace/Layout types — kept for backward compat with plugins that import from here
export interface LayoutPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface LayoutAction {
  type: 'prompt' | 'inline-prompt' | 'external' | 'internal';
  label: string;
  icon?: string;
  agent?: string;
  data: string;
}

export interface LayoutTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  description?: string;
  actions?: LayoutAction[];
  prompts?: (LayoutAction | LayoutPrompt)[];
}

export interface StandaloneLayoutConfig {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  plugin?: string;
  requiredProviders?: string[];
  availableAgents?: string[];
  defaultAgent?: string;
  tabs: LayoutTab[];
  actions?: LayoutAction[];
  globalPrompts?: LayoutPrompt[];
}

export interface StandaloneLayoutMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount: number;
}
