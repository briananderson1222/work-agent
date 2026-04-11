import { describe, expect, test } from 'vitest';
import {
  applyACPConnectionEventStateFields,
  flushACPConnectionTextPart,
  getACPConnectionEventStateFields,
  updateACPConnectionToolResult,
  type ACPConnectionEventState,
} from '../acp-connection-event-state.js';

function createState(
  overrides: Partial<ACPConnectionEventState> = {},
): ACPConnectionEventState {
  return {
    activeWriter: null,
    responseAccumulator: '',
    responseParts: [],
    currentModeId: null,
    configOptions: [],
    slashCommands: [],
    mcpServers: [],
    ...overrides,
  };
}

describe('acp-connection-event-state helpers', () => {
  test('getACPConnectionEventStateFields returns the mutable event subset', () => {
    const state = createState({
      responseAccumulator: 'hello',
      responseParts: [{ type: 'text', text: 'hello' }],
      currentModeId: 'plan',
      configOptions: [{ id: 'cfg' }],
      slashCommands: [{ name: '/help' }],
      mcpServers: ['server-1'],
    });

    expect(getACPConnectionEventStateFields(state)).toEqual({
      activeWriter: null,
      responseAccumulator: 'hello',
      responseParts: [{ type: 'text', text: 'hello' }],
      currentModeId: 'plan',
      configOptions: [{ id: 'cfg' }],
      slashCommands: [{ name: '/help' }],
      mcpServers: ['server-1'],
    });
  });

  test('applyACPConnectionEventStateFields replaces the mutable event subset', () => {
    const next = applyACPConnectionEventStateFields(createState(), {
      activeWriter: null,
      responseAccumulator: 'world',
      responseParts: [{ type: 'text', text: 'world' }],
      currentModeId: 'build',
      configOptions: [{ id: 'cfg-2' }],
      slashCommands: [{ name: '/run' }],
      mcpServers: ['server-2'],
    });

    expect(next).toEqual({
      activeWriter: null,
      responseAccumulator: 'world',
      responseParts: [{ type: 'text', text: 'world' }],
      currentModeId: 'build',
      configOptions: [{ id: 'cfg-2' }],
      slashCommands: [{ name: '/run' }],
      mcpServers: ['server-2'],
    });
  });

  test('flushACPConnectionTextPart appends accumulated text to response parts', () => {
    const next = flushACPConnectionTextPart(
      createState({
        responseAccumulator: 'Hello',
        responseParts: [{ type: 'tool-result' }],
      }),
    );

    expect(next.responseAccumulator).toBe('');
    expect(next.responseParts).toEqual([
      { type: 'tool-result' },
      { type: 'text', text: 'Hello' },
    ]);
  });

  test('updateACPConnectionToolResult updates matching invocation state', () => {
    const next = updateACPConnectionToolResult(
      createState({
        responseParts: [
          { type: 'tool-invocation', toolCallId: 'call-1', state: 'call' },
        ],
      }),
      'call-1',
      'done',
    );

    expect(next.responseParts).toEqual([
      {
        type: 'tool-invocation',
        toolCallId: 'call-1',
        state: 'result',
        result: 'done',
      },
    ]);
  });
});
