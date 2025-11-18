/**
 * SDK API Utilities - Direct API calls without hooks
 * 
 * These functions allow plugins to make API calls directly without
 * relying on React hooks (useful for event handlers, etc.)
 */

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
  apiBase: string,
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
  apiBase: string,
  agentSlug: string,
  content: string,
  options: SendMessageOptions = {}
): Promise<any> {
  const response = await fetch(`${apiBase}/agents/${agentSlug}/text`, {
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
  apiBase: string,
  agentSlug: string,
  content: string,
  options: StreamMessageOptions = {}
): Promise<void> {
  const response = await fetch(`${apiBase}/agents/${agentSlug}/stream`, {
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
  apiBase: string,
  agentSlug: string,
  content: string,
  options: SendMessageOptions = {}
): Promise<any> {
  const response = await fetch(`${apiBase}/agents/${agentSlug}/invoke`, {
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
  apiBase: string,
  agentSlug: string,
  toolName: string,
  toolArgs: any,
  transformFn: string
): Promise<any> {
  const response = await fetch(`${apiBase}/agents/${agentSlug}/invoke/transform`, {
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
export async function fetchAgents(apiBase: string): Promise<any[]> {
  const response = await fetch(`${apiBase}/agents`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch workspace list
 */
export async function fetchWorkspaces(apiBase: string): Promise<any[]> {
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
  apiBase: string,
  agentSlug?: string
): Promise<any[]> {
  const url = agentSlug
    ? `${apiBase}/agents/${agentSlug}/conversations`
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
  apiBase: string,
  conversationId: string
): Promise<any[]> {
  const response = await fetch(`${apiBase}/conversations/${conversationId}/messages`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }
  
  return response.json();
}
