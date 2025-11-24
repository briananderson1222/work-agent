/**
 * Base class for stream event handlers
 */

import type { StreamEvent, StreamState, HandlerResult, HandlerContext } from './types';
import { createNoOpResult } from './stateHelpers';

export abstract class StreamEventHandler {
  protected context: HandlerContext;

  constructor(context: HandlerContext) {
    this.context = context;
  }

  /**
   * Check if this handler can process the given event
   */
  abstract canHandle(event: StreamEvent): boolean;

  /**
   * Process the event and return updated state
   */
  abstract handle(event: StreamEvent, state: StreamState): HandlerResult;

  /**
   * Helper to update chat UI
   */
  protected updateChat(updates: any): void {
    this.context.updateChat(this.context.sessionId, updates);
  }

  /**
   * Helper to create streaming message update
   */
  protected createStreamingMessage(content: string, contentParts?: any[]): any {
    return {
      role: 'assistant',
      content,
      contentParts: contentParts && contentParts.length > 0 ? contentParts : undefined,
    };
  }

  /**
   * Default no-op result
   */
  protected noOp(state: StreamState): HandlerResult {
    return createNoOpResult(state);
  }
}
