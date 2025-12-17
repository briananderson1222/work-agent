import type { StreamChunk, StreamHandler, HandlerConfig } from '../types.js';
import { parseToolName } from '../../../utils/tool-name-normalizer.js';

/**
 * Augments tool events with parsed server/tool fields for UI compatibility
 * 
 * Adds `server` and `tool` fields to tool-call events by parsing the toolName.
 * Example: "satOutlook_calendarView" → server: "satOutlook", tool: "calendarView"
 */
export class ToolCallHandler implements StreamHandler {
  name = 'tool-call';

  constructor(private config: Pick<HandlerConfig, 'debug'> = {}) {}

  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      if (this.config.debug && this.isToolEvent(chunk.type)) {
        console.log(`[tool] ${chunk.type}`);
      }

      // Augment tool-call events with parsed server/tool fields
      if (chunk.type === 'tool-call' && chunk.toolName) {
        const { server, tool } = parseToolName(chunk.toolName);
        yield {
          ...chunk,
          server,
          tool,
        } as unknown as StreamChunk;
      } else {
        yield chunk;
      }
    }
  }

  private isToolEvent(type: string): boolean {
    return type === 'tool-call' || 
           type === 'tool-result' || 
           type === 'tool-error' ||
           type === 'tool-input-start' ||
           type === 'tool-input-delta' ||
           type === 'tool-input-end';
  }
}
