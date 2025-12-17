/**
 * Handler for text-delta events
 */

import { StreamEventHandler } from './BaseHandler';
import type { StreamEvent, StreamState, HandlerResult } from './types';
import { createResult, getTextFromParts } from './stateHelpers';

export class TextDeltaHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'text-delta';
  }

  handle(event: StreamEvent, state: StreamState): HandlerResult {
    const textDelta = event.delta || event.text;
    if (!textDelta) return this.noOp(state);

    const newTextChunk = state.currentTextChunk + textDelta;
    const totalContent = getTextFromParts(state.contentParts) + newTextChunk;
    
    const streamingMessage = this.createStreamingMessage(
      totalContent,
      state.contentParts.length > 0 ? state.contentParts : undefined
    );
    
    this.updateChat({
      streamingMessage,
      isProcessingStep: true,
    });

    return createResult(state, {
      currentTextChunk: newTextChunk,
      streamingMessage,
    });
  }
}
