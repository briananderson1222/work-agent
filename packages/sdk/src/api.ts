/**
 * SDK API Utilities - Direct API calls without hooks
 * 
 * These functions allow plugins to make API calls directly without
 * relying on React hooks (useful for event handlers, etc.)
 */

import { resolveAgentName } from './agentResolver';
import type { WorkspaceConfig } from './types';

// Internal context for API configuration
let _apiBase: string = '';
let _currentWorkspace: WorkspaceConfig | undefined;

/**
 * Set the API base URL
 * @internal Called by SDK provider
 */
export function _setApiBase(apiBase: string) {
  _apiBase = apiBase;
}

/**
 * Set the current workspace context for agent resolution
 * @internal Called by SDK provider
 */
export function _setWorkspaceContext(workspace: WorkspaceConfig | undefined) {
  _currentWorkspace = workspace;
}

/**
 * Resolve agent slug using current workspace context
 * @internal
 */
function _resolveAgent(agentSlug: string): string {
  return resolveAgentName(agentSlug, _currentWorkspace);
}

/**
 * Get current API base
 * @internal
 */
function _getApiBase(): string {
  if (!_apiBase) {
    throw new Error('API base not configured. Ensure SDKProvider is mounted.');
  }
  return _apiBase;
}

export interface SendMessageOptions {
  model?: string;
  conversationId?: string;
  userId?: string;
  attachments?: Array<{
    type: string;
    content: string;
    mimeType?: string;
  }>;
}

export interface StreamMessageOptions extends SendMessageOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Create a new chat session
 */
export async function createChatSession(
  agentSlug: string,
  sessionId: string,
  title?: string
): Promise<void> {
  // Implementation delegated to core app
  // This is a placeholder that plugins can use
  throw new Error('createChatSession must be implemented by core app');
}

/**
 * Send a message to an agent
 */
export async function sendMessage(
  agentSlug: string,
  content: string,
  options: SendMessageOptions = {}
): Promise<any> {
  const apiBase = _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(`${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: content,
      options: {
        model: options.model,
        conversationId: options.conversationId,
        userId: options.userId,
      },
      attachments: options.attachments,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Stream a message from an agent
 */
export async function streamMessage(
  agentSlug: string,
  content: string,
  options: StreamMessageOptions = {}
): Promise<void> {
  const apiBase = _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(`${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: content,
      options: {
        model: options.model,
        conversationId: options.conversationId,
        userId: options.userId,
      },
      attachments: options.attachments,
    }),
  });

  if (!response.ok) {
    const error = new Error(`Failed to stream message: ${response.statusText}`);
    options.onError?.(error);
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        options.onComplete?.();
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      options.onChunk?.(chunk);
    }
  } catch (error) {
    options.onError?.(error as Error);
    throw error;
  }
}

/**
 * Invoke an agent silently (no user confirmation)
 */
export async function invokeAgent(
  agentSlug: string,
  content: string,
  options: SendMessageOptions = {}
): Promise<any> {
  const apiBase = _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(`${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: content,
      options: {
        model: options.model,
        conversationId: options.conversationId,
        userId: options.userId,
      },
      attachments: options.attachments,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to invoke agent: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Transform tool data using an agent
 */
export async function transformTool(
  agentSlug: string,
  toolName: string,
  toolArgs: any,
  transformFn: string
): Promise<any> {
  const apiBase = _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(`${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/invoke/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName,
      toolArgs,
      transform: transformFn
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to transform tool: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Transform failed');
  }
  
  return data.response;
}

/**
 * Fetch agent list
 */
export async function fetchAgents(): Promise<any[]> {
  const apiBase = _getApiBase();
  const response = await fetch(`${apiBase}/agents`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch workspace list
 */
export async function fetchWorkspaces(): Promise<any[]> {
  const apiBase = _getApiBase();
  const response = await fetch(`${apiBase}/workspaces`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch workspaces: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch conversation history
 */
export async function fetchConversations(
  agentSlug?: string
): Promise<any[]> {
  const apiBase = _getApiBase();
  const resolvedAgent = agentSlug ? _resolveAgent(agentSlug) : undefined;
  const url = resolvedAgent
    ? `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/conversations`
    : `${apiBase}/conversations`;
    
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch conversation messages
 */
export async function fetchConversationMessages(
  conversationId: string
): Promise<any[]> {
  const apiBase = _getApiBase();
  const response = await fetch(`${apiBase}/conversations/${conversationId}/messages`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch app configuration
 */
export async function fetchConfig(): Promise<any> {
  const apiBase = _getApiBase();
  const response = await fetch(`${apiBase}/config/app`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }
  
  return response.json();
}
