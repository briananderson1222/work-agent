/**
 * SDK Types — re-exported from @work-agent/shared + SDK-specific types.
 * Shared types live in packages/shared. SDK-only types (React, UI) live here.
 */

import type { ReactElement } from 'react';

// Re-export all shared types
export type {
  PluginManifest,
  AgentSpec,
  AgentGuardrails,
  AgentTools,
  AgentUIConfig,
  AgentQuickPrompt,
  AgentMetadata,
  SlashCommand,
  SlashCommandParam,
  ToolDef,
  ToolPermissions,
  ToolMetadata,
  WorkspaceConfig,
  WorkspaceTab,
  WorkspacePrompt,
  WorkspaceMetadata,
  ToolCallResponse,
  AgentInvokeResponse,
  ConversationStats,
} from '@work-agent/shared';

// ── SDK-specific types (React/UI concerns) ─────────────────────────

export interface WorkspaceComponentProps {
  agent?: AgentSummary;
  workspace?: import('@work-agent/shared').WorkspaceConfig;
  activeTab?: import('@work-agent/shared').WorkspaceTab;
  onLaunchPrompt?: (prompt: import('@work-agent/shared').AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

export type WorkspaceComponent = (props: WorkspaceComponentProps) => ReactElement;

export interface AgentSummary {
  slug: string;
  name: string;
  prompt?: string;
  model?: string;
  region?: string;
  source?: 'local' | 'acp';
  guardrails?: import('@work-agent/shared').AgentGuardrails;
  tools?: import('@work-agent/shared').AgentTools;
  ui?: import('@work-agent/shared').AgentUIConfig;
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
  selectedWorkspace?: string;
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
