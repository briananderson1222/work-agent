import type { AgentStreamEvent } from '@strands-agents/sdk';
import type { IStreamChunk } from './types.js';

export function mapStrandsStreamEvent(
  event: AgentStreamEvent,
): IStreamChunk | null {
  if (event.type === 'modelStreamUpdateEvent') {
    const inner = (event as any).event;
    if (!inner) return null;

    switch (inner.type) {
      case 'modelContentBlockDeltaEvent': {
        const delta = inner.delta;
        if (!delta) return null;
        if (delta.type === 'textDelta') {
          return { type: 'text-delta', text: delta.text || '' };
        }
        if (delta.type === 'reasoningContentDelta') {
          return { type: 'reasoning-delta', text: delta.text || '' };
        }
        if (delta.type === 'toolUseInputDelta') {
          return { type: 'tool-call-delta', argsTextDelta: delta.input || '' };
        }
        return null;
      }

      case 'modelContentBlockStartEvent': {
        const start = inner.start;
        if (start?.type === 'toolUseStart') {
          return {
            type: 'tool-call',
            toolName: start.name,
            toolCallId: start.toolUseId || `tool-${Date.now()}`,
            input: {},
          };
        }
        return null;
      }

      case 'modelMessageStopEvent':
        return { type: 'finish', finishReason: inner.stopReason || 'end_turn' };

      case 'modelMetadataEvent':
        if (inner.usage) {
          return {
            type: 'usage',
            promptTokens: inner.usage.inputTokens || 0,
            completionTokens: inner.usage.outputTokens || 0,
          };
        }
        return null;

      default:
        return null;
    }
  }

  if (event.type === 'toolResultEvent') {
    const result = (event as any).result;
    return {
      type: 'tool-result',
      toolName: result?.toolUseId || '',
      toolCallId: result?.toolUseId || '',
      output: result?.content,
    };
  }

  return null;
}
