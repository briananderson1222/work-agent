import { describe, expect, test, vi } from 'vitest';
import {
  applyACPConnectionEventState,
  buildACPConnectionEventState,
  handleACPConnectionExtensionMethod,
  handleACPConnectionExtensionNotification,
} from '../acp-connection-events.js';

describe('acp-connection-events helpers', () => {
  test('builds and reapplies ACP event state', () => {
    const fields = {
      activeWriter: null,
      responseAccumulator: 'hello',
      responseParts: [{ type: 'text', text: 'hi' }],
      currentModeId: 'dev',
      configOptions: [{ name: 'model', value: 'sonnet' }],
      slashCommands: [{ name: '/plan' }],
      mcpServers: ['github'],
    } as any;

    const state = buildACPConnectionEventState(fields);
    state.responseAccumulator = '';
    state.responseParts = [
      ...state.responseParts,
      { type: 'text', text: 'there' },
    ];
    state.currentModeId = 'plan';

    applyACPConnectionEventState(fields, state);

    expect(fields.responseAccumulator).toBe('');
    expect(fields.responseParts).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'text', text: 'there' },
    ]);
    expect(fields.currentModeId).toBe('plan');
  });

  test('handles ACP extension notifications and updates slash commands', () => {
    const fields = {
      activeWriter: null,
      responseAccumulator: '',
      responseParts: [],
      currentModeId: 'dev',
      configOptions: [],
      slashCommands: [],
      mcpServers: [],
    } as any;
    const applied = { current: fields };

    handleACPConnectionExtensionNotification(
      '_kiro.dev/commands/available',
      {
        commands: [{ name: '/plan', description: 'Plan mode' }],
      },
      {
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        fields,
        applyFields: (nextFields) => {
          applied.current = nextFields as any;
        },
      },
    );

    expect(applied.current.slashCommands).toEqual([
      { name: '/plan', description: 'Plan mode', hint: undefined },
    ]);
  });

  test('handles ACP extension methods and syncs resulting state', () => {
    const fields = {
      activeWriter: null,
      responseAccumulator: '',
      responseParts: [],
      currentModeId: 'dev',
      configOptions: [],
      slashCommands: [],
      mcpServers: [],
    } as any;
    const applied = { current: fields };

    const result = handleACPConnectionExtensionMethod(
      '_kiro.dev/commands/options',
      {},
      {
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        fields,
        applyFields: (nextFields) => {
          applied.current = nextFields as any;
        },
      },
    );

    expect(result).toEqual({ options: [] });
    expect(applied.current.slashCommands).toEqual([]);
  });
});
