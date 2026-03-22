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
import { telemetry } from './telemetry';
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
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const resolvedAgent = _resolveAgent(agentSlug);
    const response = await fetch(
      `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
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

    const result = await response.json();
    telemetry.track('sdk.sendMessage', { duration_ms: Math.round(performance.now() - start), status: 'ok' });
    return result;
  } catch (err) {
    telemetry.track('sdk.sendMessage', { duration_ms: Math.round(performance.now() - start), status: 'error' });
    throw err;
  }
}

/**
 * Stream a message from an agent
 */
export async function streamMessage(
  agentSlug: string,
  content: string,
  options: StreamMessageOptions = {},
): Promise<void> {
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const resolvedAgent = _resolveAgent(agentSlug);
    const response = await fetch(
      `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
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

    telemetry.track('sdk.streamMessage', { duration_ms: Math.round(performance.now() - start), status: 'ok' });
  } catch (err) {
    telemetry.track('sdk.streamMessage', { duration_ms: Math.round(performance.now() - start), status: 'error' });
    throw err;
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
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const resolvedAgent = _resolveAgent(agentSlug);
    const response = await fetch(
      `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
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

    const result = await response.json();
    telemetry.track('sdk.invokeAgent', { duration_ms: Math.round(performance.now() - start), status: 'ok' });
    return result;
  } catch (err) {
    telemetry.track('sdk.invokeAgent', { duration_ms: Math.round(performance.now() - start), status: 'error' });
    throw err;
  }
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
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const resolvedAgent = _resolveAgent(agentSlug);
    const response = await fetch(
      `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/tools/${encodeURIComponent(toolName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
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

    telemetry.track('sdk.callTool', { duration_ms: Math.round(performance.now() - start), status: 'ok' });
    return data.response;
  } catch (err) {
    telemetry.track('sdk.callTool', { duration_ms: Math.round(performance.now() - start), status: 'error' });
    throw err;
  }
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
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const response = await fetch(`${apiBase}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error(`Failed to invoke: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Invoke failed');
    }

    telemetry.track('sdk.invoke', { duration_ms: Math.round(performance.now() - start), status: 'ok' });
    return data.response;
  } catch (err) {
    telemetry.track('sdk.invoke', { duration_ms: Math.round(performance.now() - start), status: 'error' });
    throw err;
  }
}

/**
 * Fetch agent list
 */
export async function fetchAgents(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/agents`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });

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
  const response = await fetch(`${apiBase}/layouts`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });

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

  const response = await fetch(url, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });

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
    { headers: { 'x-stallion-plugin': _getPluginName() } },
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
  const response = await fetch(`${apiBase}/config/app`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }

  return response.json();
}

// ── Knowledge API ──────────────────────────────────────────────────

function knowledgeBase(apiBase: string, projectSlug: string, namespace?: string): string {
  const base = `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge`;
  return namespace ? `${base}/ns/${encodeURIComponent(namespace)}` : base;
}

export async function fetchKnowledgeNamespaces(projectSlug: string): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Failed to fetch namespaces: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchKnowledgeDocs(projectSlug: string, namespace?: string): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(knowledgeBase(apiBase, projectSlug, namespace), {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Failed to fetch knowledge docs: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function searchKnowledge(projectSlug: string, query: string, namespace?: string, topK?: number): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug, namespace)}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify({ query, topK }),
  });
  if (!res.ok) throw new Error(`Knowledge search failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function uploadKnowledge(projectSlug: string, filename: string, content: string, namespace?: string, metadata?: Record<string, any>): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug, namespace)}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify({ filename, content, ...(metadata && { metadata }) }),
  });
  if (!res.ok) throw new Error(`Knowledge upload failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deleteKnowledgeDoc(projectSlug: string, docId: string, namespace?: string): Promise<void> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug, namespace)}/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Knowledge delete failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function bulkDeleteKnowledgeDocs(projectSlug: string, ids: string[], namespace?: string): Promise<void> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug, namespace)}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`Knowledge bulk delete failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function fetchKnowledgeStatus(projectSlug: string): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/status`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Failed to fetch knowledge status: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function scanKnowledgeDirectory(projectSlug: string, options?: { extensions?: string[]; includePatterns?: string[]; excludePatterns?: string[] }): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${knowledgeBase(apiBase, projectSlug)}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) throw new Error(`Knowledge scan failed: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchProjectConversations(projectSlug: string, limit = 10): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/conversations?limit=${limit}`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export async function addProjectLayoutFromPlugin(projectSlug: string, plugin: string): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/layouts/from-plugin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify({ plugin }),
  });
  if (!res.ok) throw new Error(`Failed to add layout from plugin: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchAvailableLayouts(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/layouts/available`, {
    headers: { 'x-stallion-plugin': _getPluginName() },
  });
  if (!res.ok) throw new Error(`Failed to fetch available layouts: ${res.statusText}`);
  const json = await res.json();
  return json.success ? json.data ?? [] : [];
}

export async function updateKnowledgeNamespace(projectSlug: string, namespaceId: string, data: Record<string, any>): Promise<any> {
  const apiBase = await _getApiBase();
  const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/knowledge/namespaces/${encodeURIComponent(namespaceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-stallion-plugin': _getPluginName() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update namespace: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}
