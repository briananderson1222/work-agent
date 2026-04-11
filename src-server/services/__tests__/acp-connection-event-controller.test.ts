import { describe, expect, test, vi } from 'vitest';
import {
  createACPConnectionEventController,
  runACPConnectionExtensionMethod,
  runACPConnectionExtensionNotification,
  runACPConnectionSessionUpdate,
} from '../acp-connection-event-controller.js';
import type { ACPConnectionEventState } from '../acp-connection-event-state.js';

function createState(
  overrides: Partial<ACPConnectionEventState> = {},
): ACPConnectionEventState {
  return {
    activeWriter: null,
    responseAccumulator: '',
    responseParts: [],
    currentModeId: 'dev',
    configOptions: [],
    slashCommands: [],
    mcpServers: [],
    ...overrides,
  };
}

function createController(state: ACPConnectionEventState) {
  let current = state;
  const controller = createACPConnectionEventController({
    getState: () => current,
    setState: (nextState) => {
      current = nextState;
    },
  });
  return {
    controller,
    getState: () => current,
  };
}

describe('acp-connection-event-controller', () => {
  test('flushTextPart syncs accumulated text back into response parts', () => {
    const { controller, getState } = createController(
      createState({
        responseAccumulator: 'hello world',
      }),
    );

    controller.flushTextPart();

    expect(getState().responseAccumulator).toBe('');
    expect(getState().responseParts).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  test('updateToolResult syncs invocation output back into state', () => {
    const { controller, getState } = createController(
      createState({
        responseParts: [
          {
            type: 'tool-invocation',
            toolCallId: 'tool-1',
            state: 'pending',
          },
        ],
      }),
    );

    controller.updateToolResult('tool-1', 'ok');

    expect(getState().responseParts).toEqual([
      {
        type: 'tool-invocation',
        toolCallId: 'tool-1',
        state: 'result',
        result: 'ok',
      },
    ]);
  });

  test('runACPConnectionExtensionNotification updates slash commands', () => {
    const { controller, getState } = createController(createState());

    runACPConnectionExtensionNotification(
      '_kiro.dev/commands/available',
      {
        commands: [{ name: '/plan', description: 'Plan mode' }],
      },
      {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        controller,
      },
    );

    expect(getState().slashCommands).toEqual([
      { name: '/plan', description: 'Plan mode', hint: undefined },
    ]);
  });

  test('runACPConnectionExtensionMethod returns options and preserves synced state', () => {
    const { controller, getState } = createController(createState());

    const result = runACPConnectionExtensionMethod(
      '_kiro.dev/commands/options',
      {},
      {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        controller,
      },
    );

    expect(result).toEqual({ options: [] });
    expect(getState().slashCommands).toEqual([]);
  });

  test('runACPConnectionSessionUpdate applies standard ACP mode updates', async () => {
    const { controller, getState } = createController(createState());

    await runACPConnectionSessionUpdate(
      {
        update: {
          sessionUpdate: 'current_mode_update',
          modeId: 'plan',
        },
      } as any,
      {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        controller,
      },
    );

    expect(getState().currentModeId).toBe('plan');
  });
});
