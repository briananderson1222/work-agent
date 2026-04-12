import type {
  AgentExecutionConfig,
  AgentUIConfig,
  SlashCommand,
} from '@stallion-ai/contracts/agent';
import type { ProviderKind } from '@stallion-ai/contracts/provider';
import type { UIBlock } from '@stallion-ai/contracts/ui-block';
import type { PlanArtifact } from './utils/planArtifacts';

export type {
  LayoutAction,
  LayoutDefinition,
  LayoutDefinitionMetadata,
  LayoutPrompt,
  LayoutTab,
} from '@stallion-ai/contracts/layout';
export type { WorkflowMetadata } from '@stallion-ai/contracts/runtime';

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
    type: 'text' | 'image' | 'file' | 'tool' | 'reasoning' | 'ui-block';
    content?: string;
    image?: string;
    mediaType?: string;
    url?: string;
    tool?: any;
    uiBlock?: UIBlock;
    toolCallId?: string;
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
  executionMode?: 'runtime' | 'provider-managed';
  executionScope?: 'project' | 'global';
  runtimeConnectionId?: string;
  providerId?: string;
  currentModeId?: string | null;
  planArtifact?: PlanArtifact | null;
  pendingApprovals?: string[];
  isProcessingStep?: boolean;
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

export type { TemplateVariable } from '@stallion-ai/contracts/config';
export type AppConfig = Partial<
  import('@stallion-ai/contracts/config').AppConfig
>;

export type NavigationView =
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
  | { type: 'connections-runtimes' }
  | { type: 'connections-runtime-edit'; id: string }
  | { type: 'connections-tools' }
  | { type: 'connections-tool-edit'; id: string }
  | { type: 'connections-knowledge' }
  | { type: 'plugins' }
  | { type: 'registry'; tab?: 'agents' | 'skills' | 'integrations' | 'plugins' }
  | { type: 'monitoring' }
  | { type: 'schedule' }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'notifications' }
  | { type: 'project'; slug: string }
  | { type: 'project-new' }
  | { type: 'project-edit'; slug: string }
  | { type: 'layout'; projectSlug: string; layoutSlug: string };

export type DockMode = 'bottom' | 'right' | 'bottom-inline';
