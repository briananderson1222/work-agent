import { _getApiBase, _resolveAgent, getPluginHeaders } from './api-core';
import { telemetry } from './telemetry';

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

export interface InvokeOptions {
  prompt: string;
  schema?: any;
  tools?: string[];
  maxSteps?: number;
  model?: string;
  structureModel?: string;
  system?: string;
}

export async function createChatSession(
  _agentSlug: string,
  _sessionId: string,
  _title?: string,
): Promise<void> {
  throw new Error('createChatSession must be implemented by core app');
}

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
        headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
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
    telemetry.track('sdk.sendMessage', {
      duration_ms: Math.round(performance.now() - start),
      status: 'ok',
    });
    return result;
  } catch (err) {
    telemetry.track('sdk.sendMessage', {
      duration_ms: Math.round(performance.now() - start),
      status: 'error',
    });
    throw err;
  }
}

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
        headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
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
      const error = new Error(
        `Failed to stream message: ${response.statusText}`,
      );
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

    telemetry.track('sdk.streamMessage', {
      duration_ms: Math.round(performance.now() - start),
      status: 'ok',
    });
  } catch (err) {
    telemetry.track('sdk.streamMessage', {
      duration_ms: Math.round(performance.now() - start),
      status: 'error',
    });
    throw err;
  }
}

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
        headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
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
    telemetry.track('sdk.invokeAgent', {
      duration_ms: Math.round(performance.now() - start),
      status: 'ok',
    });
    return result;
  } catch (err) {
    telemetry.track('sdk.invokeAgent', {
      duration_ms: Math.round(performance.now() - start),
      status: 'error',
    });
    throw err;
  }
}

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
        headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
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

    telemetry.track('sdk.callTool', {
      duration_ms: Math.round(performance.now() - start),
      status: 'ok',
    });
    return data.response;
  } catch (err) {
    telemetry.track('sdk.callTool', {
      duration_ms: Math.round(performance.now() - start),
      status: 'error',
    });
    throw err;
  }
}

export async function invoke(options: InvokeOptions): Promise<any> {
  const start = performance.now();
  try {
    const apiBase = await _getApiBase();
    const response = await fetch(`${apiBase}/invoke`, {
      method: 'POST',
      headers: getPluginHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error(`Failed to invoke: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Invoke failed');
    }

    telemetry.track('sdk.invoke', {
      duration_ms: Math.round(performance.now() - start),
      status: 'ok',
    });
    return data.response;
  } catch (err) {
    telemetry.track('sdk.invoke', {
      duration_ms: Math.round(performance.now() - start),
      status: 'error',
    });
    throw err;
  }
}

export async function fetchAgents(): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/agents`, {
    headers: getPluginHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchConversations(agentSlug?: string): Promise<any[]> {
  const apiBase = await _getApiBase();
  const resolvedAgent = agentSlug ? _resolveAgent(agentSlug) : undefined;
  const url = resolvedAgent
    ? `${apiBase}/agents/${encodeURIComponent(resolvedAgent)}/conversations`
    : `${apiBase}/conversations`;

  const response = await fetch(url, {
    headers: getPluginHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchConversationMessages(
  conversationId: string,
): Promise<any[]> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/conversations/${conversationId}/messages`,
    { headers: getPluginHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchConfig(): Promise<any> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/config/app`, {
    headers: getPluginHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }

  return response.json();
}
