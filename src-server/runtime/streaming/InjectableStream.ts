import type { StreamChunk } from './types.js';

/**
 * Stream wrapper that allows injecting events at chunk boundaries
 * 
 * Events are injected by external code (e.g., elicitation callback)
 * and emitted at safe boundaries to ensure proper ordering.
 */
export class InjectableStream {
  private buffer: StreamChunk[] = [];
  
  /**
   * Wrap a source stream and inject buffered events in order
   */
  async *wrap(source: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of source) {
      // Emit any buffered events before this chunk
      while (this.buffer.length > 0) {
        const buffered = this.buffer.shift()!;
        console.log('[InjectableStream] Yielding buffered event:', buffered.type, 'before chunk:', chunk.type);
        yield buffered;
      }
      
      console.log('[InjectableStream] Yielding chunk from source:', chunk.type);
      yield chunk;
    }
    
    // Yield remaining buffered events
    while (this.buffer.length > 0) {
      const buffered = this.buffer.shift()!;
      console.log('[InjectableStream] Yielding buffered event at end:', buffered.type);
      yield buffered;
    }
  }
  
  /**
   * Inject an event to be emitted before the next chunk
   */
  inject(event: StreamChunk) {
    console.log('[InjectableStream] Injecting event:', event.type, 'buffer size:', this.buffer.length);
    this.buffer.push(event);
  }
}
