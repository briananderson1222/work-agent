interface ACPChatMessagePart {
  type: string;
  text?: string;
  url?: string;
  mediaType?: string;
}

export type ACPPromptContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      data: string;
      mimeType: string;
    };

interface ResolveACPChatSessionContext {
  slug: string;
  input: unknown;
  options: {
    userId?: string;
    conversationId?: string;
  };
  context?: { cwd?: string };
  baseCwd: string;
  resolvedAlias: string;
}

export interface ResolvedACPChatSession {
  userId: string;
  isNewConversation: boolean;
  conversationId: string;
  inputText: string;
  promptContent: ACPPromptContentPart[];
}

export function resolveACPChatSession(
  context: ResolveACPChatSessionContext,
): ResolvedACPChatSession {
  const userId =
    context.options.userId ||
    `agent:${context.slug}:user:${context.resolvedAlias}`;
  const isNewConversation = !context.options.conversationId;
  const conversationId =
    context.options.conversationId ||
    `${userId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

  const parsedInput = parseACPChatInput(context.input);
  const promptContent = [...parsedInput.promptContent];

  if (context.context?.cwd && context.context.cwd !== context.baseCwd) {
    promptContent.unshift({
      type: 'text',
      text: `[Working directory: ${context.context.cwd}]`,
    });
  }

  return {
    userId,
    isNewConversation,
    conversationId,
    inputText: parsedInput.inputText,
    promptContent,
  };
}

export function createACPConversationTitle(
  inputText: string,
  title?: string,
): string {
  if (title) {
    return title;
  }

  return inputText.length > 50 ? `${inputText.substring(0, 50)}...` : inputText;
}

function parseACPChatInput(input: unknown): {
  inputText: string;
  promptContent: ACPPromptContentPart[];
} {
  const promptContent: ACPPromptContentPart[] = [];

  if (
    Array.isArray(input) &&
    input[0] &&
    typeof input[0] === 'object' &&
    'parts' in input[0] &&
    Array.isArray((input[0] as { parts?: unknown }).parts)
  ) {
    const parts = (input[0] as { parts: ACPChatMessagePart[] }).parts;
    const inputText = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('\n');

    for (const part of parts) {
      if (part.type === 'file' && part.url) {
        promptContent.push({
          type: 'image',
          data: part.url.replace(/^data:[^;]+;base64,/, ''),
          mimeType: part.mediaType || 'image/png',
        });
        continue;
      }

      if (part.type === 'text' && part.text) {
        promptContent.push({ type: 'text', text: part.text });
      }
    }

    return { inputText, promptContent };
  }

  const inputText = typeof input === 'string' ? input : JSON.stringify(input);
  promptContent.push({ type: 'text', text: inputText });
  return { inputText, promptContent };
}
