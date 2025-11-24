/**
 * Handler for text-delta events
 */

import { StreamEventHandler } from './BaseHandler';
import type { StreamEvent, StreamState, HandlerResult } from './types';
import { createResult } from './stateHelpers';
import { log } from '@/utils/logger';

export class TextDeltaHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'text-delta';
  }

  handle(event: StreamEvent, state: StreamState): HandlerResult {
    const textDelta = event.delta || event.text;
    if (!textDelta) return this.noOp(state);

    const newTextChunk = state.currentTextChunk + textDelta;
    log.chat('Text delta received:', newTextChunk.substring(0, 50));

    this.updateChat({
      streamingMessage: this.createStreamingMessage(
        newTextChunk,
        state.contentParts.length > 0 ? state.contentParts : undefined
      ),
      isProcessingStep: true,
    });

    return createResult(state, {
      currentTextChunk: newTextChunk,
    });
  }
}
