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

    const timestamp = new Date().toISOString();
    const newTextChunk = state.currentTextChunk + textDelta;
    log.chat('Text delta received:', newTextChunk.substring(0, 50));
    
    // DEBUG: Log handler processing timing

    const streamingMessage = this.createStreamingMessage(
      newTextChunk,
      state.contentParts.length > 0 ? state.contentParts : undefined
    );
    
    // DEBUG: Log before updateChat

    // Store in ActiveChats for data access (batched by React)
    this.updateChat({
      streamingMessage,
      isProcessingStep: true,
    });
    
    // DEBUG: Log after updateChat

    // Also return in result for immediate UI rendering via StreamingContext
    return createResult(state, {
      currentTextChunk: newTextChunk,
      streamingMessage,
    });
  }
}
