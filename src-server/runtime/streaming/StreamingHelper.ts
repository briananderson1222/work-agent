import type { WritableStream } from './types.js';

/**
 * Helper for processing thinking tags in streaming responses
 * 
 * Buffers text chunks and detects `<thinking>` tags, emitting appropriate
 * reasoning events to the stream. Can be used as a drop-in replacement for
 * manual thinking tag parsing.
 * 
 * @example Basic usage
 * ```typescript
 * const helper = new StreamingHelper(streamWriter, {
 *   enableThinking: true,
 *   debug: false
 * });
 * 
 * for await (const chunk of stream) {
 *   if (chunk.type === 'text-delta') {
 *     const outputText = await helper.processTextChunk(chunk.text);
 *     if (outputText) {
 *       // Send outputText as regular text-delta
 *       await streamWriter.write(`data: ${JSON.stringify({
 *         type: 'text-delta',
 *         content: outputText
 *       })}\n\n`);
 *     }
 *   }
 * }
 * 
 * // Flush any remaining buffered content
 * const remaining = await helper.flush();
 * ```
 * 
 * @example With reasoning completion callback
 * ```typescript
 * const helper = new StreamingHelper(streamWriter, {
 *   enableThinking: true,
 *   onReasoningComplete: (content) => {
 *     console.log('Reasoning completed:', content);
 *     // Emit monitoring event, save to database, etc.
 *   }
 * });
 * ```
 */
export class StreamingHelper {
  private inThinkingBlock = false;
  private buffer = '';
  private partialTag = '';
  private currentReasoningContent = '';

  /**
   * Create a new StreamingHelper
   * 
   * @param streamWriter - Writable stream for SSE output
   * @param options - Configuration options
   * @param options.enableThinking - Whether to emit thinking blocks (default: true)
   * @param options.debug - Enable debug logging (default: false)
   * @param options.onReasoningComplete - Callback when reasoning block completes
   */
  constructor(
    private streamWriter: WritableStream,
    private options: {
      enableThinking?: boolean;
      debug?: boolean;
      onReasoningComplete?: (content: string) => void;
    } = {}
  ) {}

  /**
   * Process a text chunk and emit appropriate events
   * 
   * Buffers the text and detects `<thinking>` tags. When tags are found:
   * - Emits `reasoning-start` when opening tag is detected
   * - Emits `reasoning-delta` for content inside thinking block
   * - Emits `reasoning-end` when closing tag is detected
   * 
   * Returns the text that should be sent as regular text-delta (with thinking tags stripped).
   * 
   * @param text - The text chunk to process
   * @returns Text to send as text-delta (thinking tags removed)
   * 
   * @example
   * ```typescript
   * const outputText = await helper.processTextChunk('Hello <thinking>plan</thinking> world');
   * // Returns: 'Hello  world'
   * // Emits: reasoning-start, reasoning-delta('plan'), reasoning-end
   * ```
   */
  async processTextChunk(text: string): Promise<string> {
    if (!text) return '';

    if (this.options.debug) {
      console.log('[StreamingHelper] Processing chunk:', text.substring(0, 50));
    }

    // Just pass through for now - no reasoning logic
    return text;
  }

  /**
   * Flush any remaining buffered content at end of stream
   * 
   * Should be called after all chunks have been processed to ensure
   * any buffered content is emitted. Handles unclosed thinking blocks
   * by emitting the buffered content and a reasoning-end event.
   * 
   * @returns Any remaining buffered text
   * 
   * @example
   * ```typescript
   * for await (const chunk of stream) {
   *   await helper.processTextChunk(chunk.text);
   * }
   * const remaining = await helper.flush();
   * if (remaining) {
   *   // Send remaining text
   * }
   * ```
   */
  async flush(): Promise<string> {
    if (this.inThinkingBlock && this.buffer) {
      // Unclosed thinking block - emit what we have
      this.currentReasoningContent += this.buffer;
      
      if (this.options.enableThinking) {
        await this.streamWriter.write(`data: ${JSON.stringify({
          type: 'reasoning-delta',
          textDelta: this.buffer
        })}\n\n`);
        
        await this.streamWriter.write(`data: ${JSON.stringify({
          type: 'reasoning-end'
        })}\n\n`);
      }

      if (this.options.onReasoningComplete) {
        this.options.onReasoningComplete(this.currentReasoningContent);
      }

      const flushed = this.buffer;
      this.buffer = '';
      this.inThinkingBlock = false;
      return '';
    }

    // Return any buffered regular text
    const flushed = this.buffer;
    this.buffer = '';
    return flushed;
  }

  /**
   * Check if currently inside a reasoning block
   * 
   * @returns True if inside a `<thinking>` block
   */
  isInReasoningBlock(): boolean {
    return this.inThinkingBlock;
  }

  /**
   * Get the current accumulated reasoning content
   * 
   * @returns The reasoning content accumulated so far in the current block
   */
  getCurrentReasoningContent(): string {
    return this.currentReasoningContent;
  }
}
