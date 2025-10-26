export interface AgentQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface AgentUIConfig {
  component?: string;
  quickPrompts?: AgentQuickPrompt[];
  workflowShortcuts?: string[];
}

export interface AgentSummary {
  slug: string;
  name: string;
  model?: string;
  updatedAt: string;
  description?: string;
  ui?: AgentUIConfig;
  workflowWarnings?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  status: ChatSessionStatus;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
  hasUnread: boolean;
}
