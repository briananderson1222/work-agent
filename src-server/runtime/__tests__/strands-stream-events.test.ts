import { describe, expect, test } from 'vitest';
import { mapStrandsStreamEvent } from '../strands-stream-events.js';

describe('mapStrandsStreamEvent', () => {
  test('maps text deltas into runtime text chunks', () => {
    expect(
      mapStrandsStreamEvent({
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockDeltaEvent',
          delta: { type: 'textDelta', text: 'hello' },
        },
      } as any),
    ).toEqual({ type: 'text-delta', text: 'hello' });
  });

  test('maps tool-use starts into runtime tool-call chunks', () => {
    expect(
      mapStrandsStreamEvent({
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockStartEvent',
          start: {
            type: 'toolUseStart',
            name: 'read_file',
            toolUseId: 'tool-1',
          },
        },
      } as any),
    ).toEqual({
      type: 'tool-call',
      toolName: 'read_file',
      toolCallId: 'tool-1',
      input: {},
    });
  });

  test('maps metadata usage into runtime usage chunks', () => {
    expect(
      mapStrandsStreamEvent({
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelMetadataEvent',
          usage: { inputTokens: 12, outputTokens: 4 },
        },
      } as any),
    ).toEqual({
      type: 'usage',
      promptTokens: 12,
      completionTokens: 4,
    });
  });

  test('maps tool results into runtime tool-result chunks', () => {
    expect(
      mapStrandsStreamEvent({
        type: 'toolResultEvent',
        result: { toolUseId: 'tool-1', content: { ok: true } },
      } as any),
    ).toEqual({
      type: 'tool-result',
      toolName: 'tool-1',
      toolCallId: 'tool-1',
      output: { ok: true },
    });
  });
});
