import type { BedrockChunk } from './types.js';

/**
 * Converts VoltAgent stream chunks to BedrockChunk format
 */
export function adaptVoltAgentChunk(chunk: any): BedrockChunk | null {
  switch (chunk.type) {
    case 'text-delta':
      return {
        type: 'text-delta',
        text: chunk.textDelta || chunk.text || chunk.delta || '',
      };

    case 'tool-call':
      return {
        type: 'tool-call',
        toolData: {
          name: chunk.toolName,
          input: chunk.input || {},
          id: chunk.toolCallId,
        },
      };

    case 'tool-result':
    case 'reasoning-delta':
    case 'reasoning-start':
    case 'reasoning-end':
    case 'error':
      // Pass through - not handled by pipeline yet
      return null;

    default:
      return null;
  }
}
