/**
 * SDK Types — re-exported from @stallion-ai/shared + SDK-specific types.
 * Shared types live in packages/shared. SDK-only types (React, UI) live here.
 */

import type { ReactElement } from 'react';

// Re-export all shared types
export type {
  AgentGuardrails,
  AgentInvokeResponse,
  AgentMetadata,
  AgentQuickPrompt,
  AgentSpec,
  AgentTools,
  AgentUIConfig,
  ConversationStats,
  LayoutPrompt,
  LayoutTab,
  PluginManifest,
  SlashCommand,
  SlashCommandParam,
  StandaloneLayoutConfig,
  StandaloneLayoutMetadata,
  ToolCallResponse,
  ToolDef,
  ToolMetadata,
  ToolPermissions,
} from '@stallion-ai/shared';

// ── SDK-specific types (React/UI concerns) ─────────────────────────

export interface LayoutComponentProps {
  agent?: AgentSummary;
  layout?: import('@stallion-ai/shared').StandaloneLayoutConfig;
  activeTab?: import('@stallion-ai/shared').LayoutTab;
  onLaunchPrompt?: (
    prompt: import('@stallion-ai/shared').AgentQuickPrompt,
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
  guardrails?: import('@stallion-ai/shared').AgentGuardrails;
  tools?: import('@stallion-ai/shared').AgentTools;
  ui?: import('@stallion-ai/shared').AgentUIConfig;
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
  listDocs(namespace?: string): Promise<import('@stallion-ai/shared').KnowledgeDocumentMeta[]>;
  search(query: string, namespace?: string, topK?: number): Promise<any[]>;
  save(filename: string, content: string, namespace?: string): Promise<import('@stallion-ai/shared').KnowledgeDocumentMeta>;
  remove(docId: string, namespace?: string): Promise<void>;
  listNamespaces(): Promise<import('@stallion-ai/shared').KnowledgeNamespaceConfig[]>;
}
