/**
 * SDK API Utilities - Direct API calls without hooks
 *
 * These functions allow plugins to make API calls directly without
 * relying on React hooks (useful for event handlers, etc.)
 */

import {
  _setLayoutContext as _setLayoutContextResolver,
  resolveAgentName,
} from './agentResolver';
import type { StandaloneLayoutConfig } from './types';

// Internal context for API configuration
let _apiBase: string = '';
let _currentLayout: StandaloneLayoutConfig | undefined;

/**
 * Set the API base URL
 * @internal Called by SDK provider
 */
export function _setApiBase(apiBase: string) {
  _apiBase = apiBase;
}

/**
 * Set the current layout context for agent resolution
 * @internal Called by SDK provider
 */
export function _setLayoutContext(layout: StandaloneLayoutConfig | undefined) {
  _currentLayout = layout;
  _setLayoutContextResolver(layout);
}

/**
 * Resolve agent slug using current layout context
 * @internal
 */
function _resolveAgent(agentSlug: string): string {
  return resolveAgentName(agentSlug, _currentLayout);
}

/**
 * Get current plugin name from layout context
 * @internal
 */
export function _getPluginName(): string {
  return _currentLayout?.slug || '';
}

/**
 * Get current API base
 * @internal
 */
export async function _getApiBase(): Promise<string> {
  // TODO: This polling approach is a workaround for race condition between SDKProvider useEffect
  // and component useEffect calls. Consider using a Promise-based initialization pattern or
  // React Context to ensure API base is available before components can call SDK functions.
  let attempts = 0;
  while (!_apiBase && attempts < 50) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    attempts++;
  }

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
  _agentSlug: string,
  _sessionId: string,
  _title?: string,
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
  options: SendMessageOptions = {},
): Promise<any> {
  const apiBase = await _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/text`,
    {
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
    },
  );

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
  options: StreamMessageOptions = {},
): Promise<void> {
  const apiBase = await _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/stream`,
    {
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
    },
  );

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
  options: SendMessageOptions & { schema?: any } = {},
): Promise<any> {
  const apiBase = await _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/invoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: content,
        schema: options.schema,
        options: {
          model: options.model,
          conversationId: options.conversationId,
          userId: options.userId,
        },
        attachments: options.attachments,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to invoke agent: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Transform tool data using an agent
 */
/**
 * Call a tool directly — raw MCP call, no server-side transform.
 * Hits POST /agents/:slug/tools/:toolName
 */
export async function callTool(
  agentSlug: string,
  toolName: string,
  toolArgs: any = {},
): Promise<any> {
  const apiBase = await _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/tools/${encodeURIComponent(toolName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolArgs),
    },
  );

  if (!response.ok) {
    throw new Error(`Tool call failed: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Tool call failed');
  }

  return data.response;
}

/** @deprecated Use callTool instead — transformTool will be removed */
export async function transformTool(
  agentSlug: string,
  toolName: string,
  toolArgs: any,
  transformFn: string,
): Promise<any> {
  const apiBase = await _getApiBase();
  const resolvedAgent = _resolveAgent(agentSlug);
  const response = await fetch(
    `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/tool/${encodeURIComponent(toolName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolArgs,
        transform: transformFn,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to transform tool: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Transform failed');
  }

  return data.response;
}

export interface InvokeOptions {
  prompt: string;
  schema?: any;
  tools?: string[];
  maxSteps?: number;
  model?: string;
  structureModel?: string;
  system?: string;
}

/**
 * Invoke with multi-turn tool calling and structured output
 * No agent needed - lightweight endpoint
 */
export async function invoke(options: InvokeOptions): Promise<any> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Failed to invoke: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Invoke failed');
  }

  return data.response;
}

/**
 * Fetch agent list
 */
export async function fetchAgents(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/agents`);

  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch layout list
 */
export async function fetchLayouts(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/layouts`);

  if (!response.ok) {
    throw new Error(`Failed to fetch layouts: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch conversation history
 */
export async function fetchConversations(agentSlug?: string): Promise<any[]> {
  const apiBase = await _getApiBase();
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
  conversationId: string,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/conversations/${conversationId}/messages`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch app configuration
 */
export async function fetchConfig(): Promise<any> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/config/app`);

  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }

  return response.json();
}
