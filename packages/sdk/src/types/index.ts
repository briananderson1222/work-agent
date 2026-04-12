/**
 * SDK Types — re-exported from explicit contracts/shared modules + SDK-specific types.
 * Contract shapes live in packages/contracts, shared runtime helpers in packages/shared.
 */

import type { ReactElement } from 'react';

export type {
  AgentGuardrails,
  AgentMetadata,
  AgentQuickPrompt,
  AgentSpec,
  AgentTools,
  AgentUIConfig,
  SlashCommand,
  SlashCommandParam,
} from '@stallion-ai/contracts/agent';
export type {
  AuthStatus,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from '@stallion-ai/contracts/auth';
export type {
  KnowledgeDocumentMeta,
  KnowledgeNamespaceConfig,
} from '@stallion-ai/contracts/knowledge';
export type {
  LayoutDefinition,
  LayoutDefinitionMetadata,
  LayoutPrompt,
  LayoutTab,
} from '@stallion-ai/contracts/layout';
export type { PluginManifest } from '@stallion-ai/contracts/plugin';
export type {
  AgentInvokeResponse,
  ConversationStats,
  MemoryEvent,
  SessionMetadata,
  ToolCallResponse,
  WorkflowMetadata,
} from '@stallion-ai/contracts/runtime';
export type {
  ToolDef,
  ToolMetadata,
  ToolPermissions,
} from '@stallion-ai/contracts/tool';

// ── SDK-specific types (React/UI concerns) ─────────────────────────

export interface LayoutComponentProps {
  agent?: AgentSummary;
  layout?: import('@stallion-ai/contracts/layout').LayoutDefinition;
  activeTab?: import('@stallion-ai/contracts/layout').LayoutTab;
  onLaunchPrompt?: (
    prompt: import('@stallion-ai/contracts/agent').AgentQuickPrompt,
  ) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

export type LayoutComponent = (props: LayoutComponentProps) => ReactElement;

export interface AgentSummary {
  slug: string;
  name: string;
  prompt?: string;
  model?: string;
  region?: string;
  source?: 'local' | 'acp';
  guardrails?: import('@stallion-ai/contracts/agent').AgentGuardrails;
  tools?: import('@stallion-ai/contracts/agent').AgentTools;
  ui?: import('@stallion-ai/contracts/agent').AgentUIConfig;
}

export interface Agent extends AgentSummary {}

export interface InvokeOptions {
  conversationId?: string;
  userId?: string;
  model?: string;
  tools?: string[];
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface InvokeResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls?: any[];
}

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

export interface Conversation {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

export interface NavigationState {
  currentView: string;
  selectedLayout?: string;
  selectedAgent?: string;
  dockState: boolean;
  dockHeight: number;
  dockMaximized: boolean;
}

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export type EventHandler<T = any> = (event: T) => void;
export type Permission = string;

export interface KeyboardCommand {
  key: string;
  modifiers?: string[];
  handler: () => void;
}

export interface Tool {
  id: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface WindowOptions {
  url: string;
  title?: string;
  width?: number;
  height?: number;
}

// ── Knowledge Provider ─────────────────────────────────────────────

export interface IKnowledgeProvider {
  listDocs(
    namespace?: string,
  ): Promise<
    import('@stallion-ai/contracts/knowledge').KnowledgeDocumentMeta[]
  >;
  search(query: string, namespace?: string, topK?: number): Promise<any[]>;
  save(
    filename: string,
    content: string,
    namespace?: string,
  ): Promise<import('@stallion-ai/contracts/knowledge').KnowledgeDocumentMeta>;
  remove(docId: string, namespace?: string): Promise<void>;
  listNamespaces(): Promise<
    import('@stallion-ai/contracts/knowledge').KnowledgeNamespaceConfig[]
  >;
}
