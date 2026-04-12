import { describe, expect, test, vi } from 'vitest';
import {
  type NovaSonicEventState,
  parseNovaSonicRawEvent,
  processNovaSonicStreamEvent,
} from '../providers/nova-sonic-events.js';

function createState(): NovaSonicEventState {
  return {
    currentRole: '',
    currentGenerationStage: '',
    currentToolName: '',
    currentToolUseId: '',
    currentToolContent: '',
    currentContentType: '',
  };
}

describe('nova-sonic-events', () => {
  test('parseNovaSonicRawEvent decodes event payloads', () => {
    const raw = {
      chunk: {
        bytes: new TextEncoder().encode(
          JSON.stringify({ event: { completionStart: { id: 'c1' } } }),
        ),
      },
    };

    expect(parseNovaSonicRawEvent(raw)).toEqual({
      completionStart: { id: 'c1' },
    });
  });

  test('processNovaSonicStreamEvent emits transcripts based on role and stage', () => {
    const emit = vi.fn();
    const setState = vi.fn();
    const state = createState();

    processNovaSonicStreamEvent(
      {
        contentStart: {
          role: 'ASSISTANT',
          type: 'TEXT',
          additionalModelFields: '{"generationStage":"SPECULATIVE"}',
        },
      },
      state,
      { emit, setState },
    );
    processNovaSonicStreamEvent(
      { textOutput: { content: 'Thinking out loud' } },
      state,
      { emit, setState },
    );

    expect(emit).toHaveBeenCalledWith('transcript', {
      text: 'Thinking out loud',
      role: 'assistant',
      stage: 'speculative',
    });
  });

  test('processNovaSonicStreamEvent emits tool use with parsed JSON params', () => {
    const emit = vi.fn();
    const setState = vi.fn();
    const state = createState();

    processNovaSonicStreamEvent(
      {
        toolUse: {
          toolName: 'lookup_weather',
          toolUseId: 'tu-1',
          content: '{"city":"Denver"}',
        },
      },
      state,
      { emit, setState },
    );
    processNovaSonicStreamEvent(
      { contentEnd: { stopReason: 'TOOL_USE' } },
      state,
      { emit, setState },
    );

    expect(emit).toHaveBeenCalledWith('toolUse', {
      toolName: 'lookup_weather',
      toolUseId: 'tu-1',
      parameters: { city: 'Denver' },
    });
  });
});
