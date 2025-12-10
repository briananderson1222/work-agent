import type { StreamChunk, StreamHandler, HandlerConfig } from '../types.js';

/**
 * Pass-through handler for text events
 * 
 * With the generator pattern, ReasoningHandler already emits properly formatted
 * text-delta events, so this handler just passes everything through.
 * 
 * Kept for potential future text transformations or logging.
 */
export class TextDeltaHandler implements StreamHandler {
  name = 'text-delta';

  constructor(private config: Pick<HandlerConfig, 'debug'> = {}) {}

  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      if (this.config.debug && chunk.type === 'text-delta') {
        console.log('[text-delta]', chunk.text?.substring(0, 50));
      }
      // DEBUG: Log timestamp when text-delta is yielded
      if (chunk.type === 'text-delta') {
        console.log(`[STREAM DEBUG] Backend yielding text-delta at ${new Date().toISOString()}, text: "${chunk.text?.substring(0, 30)}"`);
      }
      yield chunk;
    }
  }
}
