import type { UIBlock } from '@stallion-ai/contracts/ui-block';

type OrchestrationContentPart = {
  type: string;
  content?: string;
  tool?: any;
  toolCallId?: string;
  uiBlock?: UIBlock;
};

export type OrchestrationStreamingMessage = {
  role: 'assistant';
  content: string;
  contentParts?: OrchestrationContentPart[];
};

export function createAssistantStreamingMessage(): OrchestrationStreamingMessage {
  return {
    role: 'assistant',
    content: '',
    contentParts: [],
  };
}

export function upsertTextPart(
  parts: Array<OrchestrationContentPart> | undefined,
  type: 'text' | 'reasoning',
  delta: string,
) {
  const next = [...(parts || [])];
  const index = next.findIndex((part) => part.type === type);
  if (index >= 0) {
    next[index] = {
      ...next[index],
      content: `${next[index].content || ''}${delta}`,
    };
    return next;
  }
  next.push({ type, content: delta });
  return next;
}

export function upsertToolPart(
  parts: Array<OrchestrationContentPart> | undefined,
  toolCallId: string,
  updates: Record<string, unknown>,
) {
  const next = [...(parts || [])];
  const index = next.findIndex(
    (part) => part.type === 'tool' && part.tool?.id === toolCallId,
  );
  if (index >= 0) {
    next[index] = {
      type: 'tool',
      tool: { ...next[index].tool, ...updates },
    };
    return next;
  }
  next.push({
    type: 'tool',
    tool: {
      id: toolCallId,
      name: String(updates.name || updates.toolName || toolCallId),
      args: updates.args || {},
      ...updates,
    },
  });
  return next;
}

export function upsertToolResultBlocks(
  parts: Array<OrchestrationContentPart> | undefined,
  toolCallId: string,
  blocks: UIBlock[],
) {
  const next = [...(parts || [])].filter(
    (part) => !(part.type === 'ui-block' && part.toolCallId === toolCallId),
  );

  if (blocks.length === 0) {
    return next;
  }

  const toolIndex = next.findIndex(
    (part) => part.type === 'tool' && part.tool?.id === toolCallId,
  );
  const blockParts = blocks.map((block, index) => ({
    type: 'ui-block',
    toolCallId,
    uiBlock: {
      ...block,
      id: block.id || `${toolCallId}-block-${index}`,
    },
  }));

  if (toolIndex === -1) {
    next.push(...blockParts);
    return next;
  }

  next.splice(toolIndex + 1, 0, ...blockParts);
  return next;
}

export function buildAssistantTurnContent(
  streamingMessage: OrchestrationStreamingMessage | undefined,
  fallbackText?: string,
) {
  return (
    streamingMessage?.content ||
    streamingMessage?.contentParts
      ?.filter((part) => part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.content || '')
      .join('\n') ||
    fallbackText ||
    ''
  );
}
