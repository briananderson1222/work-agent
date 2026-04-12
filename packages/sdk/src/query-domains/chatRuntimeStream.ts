import { resolveApiBase } from '../query-core';
import type {
  ChatAttachmentInput,
  ConversationMessage,
  ConversationMessagePart,
} from './chatRuntimeTypes';

type MessageApiPart = {
  type: string;
  text?: string;
  content?: string;
  url?: string;
  mediaType?: string;
  name?: string;
  server?: string;
  toolName?: string;
  originalName?: string;
};

type MessageApiShape = {
  role: 'user' | 'assistant';
  parts?: MessageApiPart[];
  metadata?: { timestamp?: string; traceId?: string };
  timestamp?: string;
};

export type {
  ChatAttachmentInput,
  ConversationMessage,
  ConversationMessagePart,
} from './chatRuntimeTypes';

export function mapConversationMessages(
  messages: MessageApiShape[],
  toolMappings: Record<
    string,
    { server?: string; toolName?: string; originalName?: string }
  > = {},
): ConversationMessage[] {
  return messages.map((message) => {
    const textContent =
      message.parts
        ?.map((part) => part.text || part.content)
        .filter(Boolean)
        .join('\n') || '';

    const contentParts = message.parts
      ?.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', content: part.text };
        }
        if (part.type === 'reasoning') {
          return { type: 'reasoning', content: part.text };
        }
        if (part.type === 'file') {
          const typeName = part.mediaType?.split('/')[0] || 'File';
          return {
            type: 'file',
            url: part.url,
            mediaType: part.mediaType,
            name:
              part.name ||
              `${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`,
          };
        }
        if (part.type?.startsWith('tool-')) {
          const toolName = part.type.replace('tool-', '');
          const mapping = toolMappings[toolName] || {};
          return {
            ...part,
            server: part.server || mapping.server,
            toolName: part.toolName || mapping.toolName || toolName,
            originalName: part.originalName || mapping.originalName,
          };
        }
        return null;
      })
      .filter(Boolean) as ConversationMessagePart[] | undefined;

    return {
      role: message.role,
      content: textContent,
      contentParts: contentParts?.length ? contentParts : undefined,
      timestamp: message.metadata?.timestamp || message.timestamp,
      traceId: message.metadata?.traceId,
    };
  });
}

export function buildConversationTurnInput(
  content: string,
  attachments?: ChatAttachmentInput[],
) {
  if (!attachments || attachments.length === 0) {
    return content;
  }

  const parts: Array<{
    type: string;
    text?: string;
    url?: string;
    mediaType?: string;
  }> = [];

  if (content) {
    parts.push({ type: 'text', text: content });
  }

  for (const attachment of attachments) {
    parts.push({
      type: 'file',
      url: attachment.data,
      mediaType: attachment.type,
    });
  }

  return [
    {
      id: `msg-${Date.now()}`,
      role: 'user',
      parts,
    },
  ];
}

export function buildConversationTurnPayload(input: {
  conversationId?: string;
  content: string;
  title?: string;
  model?: string;
  attachments?: ChatAttachmentInput[];
  projectSlug?: string;
  chatOptions?: Record<string, unknown>;
}) {
  return {
    input: buildConversationTurnInput(input.content, input.attachments),
    options: {
      ...(input.chatOptions ?? {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.model ? { model: input.model } : {}),
    },
    ...(input.projectSlug ? { projectSlug: input.projectSlug } : {}),
  };
}

function buildAbortAwareHeaders(signal?: AbortSignal) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (
    signal &&
    '_userInitiated' in signal &&
    (signal as AbortSignal & { _userInitiated?: boolean })._userInitiated
  ) {
    headers['X-Abort-Reason'] = 'user-cancel';
  }

  return headers;
}

export async function streamConversationTurn(input: {
  agentSlug: string;
  conversationId?: string;
  content: string;
  title?: string;
  onStreamEvent: (data: any, state: any) => any;
  onConversationStarted?: (conversationId: string, title?: string) => void;
  signal?: AbortSignal;
  model?: string;
  attachments?: ChatAttachmentInput[];
  projectSlug?: string;
  chatOptions?: Record<string, unknown>;
  apiBase?: string;
}): Promise<{ conversationId?: string; finishReason?: string }> {
  const payload = buildConversationTurnPayload(input);
  const headers = buildAbortAwareHeaders(input.signal);
  const resolvedApiBase = await resolveApiBase(input.apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/agents/${input.agentSlug}/chat`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: input.signal,
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  let aborted = false;
  const abortHandler = async () => {
    aborted = true;
    try {
      await reader.cancel();
    } catch {}
  };
  input.signal?.addEventListener('abort', abortHandler);

  const decoder = new TextDecoder();
  let buffer = '';
  let state = {
    currentTextChunk: '',
    contentParts: [],
    pendingApprovals: new Map(),
    reasoningChunks: [],
  };
  let conversationId = input.conversationId;
  let finishReason: string | undefined;

  try {
    while (true) {
      if (aborted || input.signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) {
          continue;
        }

        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') {
          break;
        }

        const data = JSON.parse(dataStr);

        if (
          (data.type === 'conversation-started' ||
            data.type === 'conversation') &&
          data.conversationId
        ) {
          conversationId = data.conversationId;
          input.onConversationStarted?.(data.conversationId, data.title);
          continue;
        }

        if (data.type === 'finish' && data.finishReason) {
          finishReason = data.finishReason;
        }

        const result = input.onStreamEvent(data, state);
        state = {
          currentTextChunk: result.currentTextChunk,
          contentParts: result.contentParts,
          pendingApprovals: result.pendingApprovals,
          reasoningChunks: result.currentReasoningChunk
            ? [...result.reasoningChunks, result.currentReasoningChunk]
            : result.reasoningChunks,
        };
      }
    }
  } catch (error) {
    if (
      aborted ||
      input.signal?.aborted ||
      (error as Error).name === 'AbortError'
    ) {
      return {};
    }
    throw error;
  } finally {
    input.signal?.removeEventListener('abort', abortHandler);
    try {
      reader.releaseLock();
    } catch {}
  }

  return { conversationId, finishReason };
}
