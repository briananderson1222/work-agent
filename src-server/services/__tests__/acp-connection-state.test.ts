import { describe, expect, test, vi } from 'vitest';
import {
  cleanupACPConnectionState,
  flushACPTextPart,
  getOrCreateACPAdapter,
  syncACPEventState,
  updateACPToolResultState,
} from '../acp-connection-state.js';

describe('acp-connection-state helpers', () => {
  test('flushACPTextPart appends accumulated text as a response part', () => {
    expect(flushACPTextPart('Hello', [{ type: 'tool-result' }])).toEqual({
      responseAccumulator: '',
      responseParts: [{ type: 'tool-result' }, { type: 'text', text: 'Hello' }],
    });
  });

  test('updateACPToolResultState updates matching invocation result', () => {
    expect(
      updateACPToolResultState(
        [{ type: 'tool-invocation', toolCallId: 'call-1', state: 'call' }],
        'call-1',
        'done',
      ),
    ).toEqual([
      {
        type: 'tool-invocation',
        toolCallId: 'call-1',
        state: 'result',
        result: 'done',
      },
    ]);
  });

  test('getOrCreateACPAdapter creates and caches a missing adapter', () => {
    const memoryAdapters = new Map<string, any>();
    const created = { id: 'adapter' };
    const createMemoryAdapter = vi.fn(() => created);

    const adapter = getOrCreateACPAdapter({
      slug: 'acp-agent',
      memoryAdapters: memoryAdapters as any,
      createMemoryAdapter,
    });

    expect(adapter).toBe(created);
    expect(memoryAdapters.get('acp-agent')).toBe(created);
  });

  test('syncACPEventState returns the mutable state subset', () => {
    expect(
      syncACPEventState({
        activeWriter: null,
        responseAccumulator: 'x',
        responseParts: [{ type: 'text', text: 'x' }],
        currentModeId: 'plan',
        configOptions: [{ id: 'cfg' }],
        slashCommands: [{ name: '/help' }],
        mcpServers: ['server-1'],
      }),
    ).toEqual({
      responseAccumulator: 'x',
      responseParts: [{ type: 'text', text: 'x' }],
      currentModeId: 'plan',
      configOptions: [{ id: 'cfg' }],
      slashCommands: [{ name: '/help' }],
      mcpServers: ['server-1'],
    });
  });

  test('cleanupACPConnectionState clears terminals and returns reset fields', () => {
    const processKill = vi.fn();
    const proc = {} as any;
    const cancelAll = vi.fn(() => 2);
    const logger = { info: vi.fn() };
    const terminals = new Map([['term-1', { process: { kill: processKill } }]]);

    const result = cleanupACPConnectionState({
      approvalRegistry: { cancelAll },
      logger,
      prefix: 'kiro',
      terminals,
      proc,
    });

    expect(processKill).toHaveBeenCalled();
    expect(terminals.size).toBe(0);
    expect(result).toEqual({
      proc: null,
      connection: null,
      sessionId: null,
      modes: [],
      slashCommands: [],
      mcpServers: [],
      configOptions: [],
      currentModeId: null,
    });
  });
});
