import { describe, expect, test, vi } from 'vitest';
import {
  addACPManagerConnection,
  getOrCreateACPManagerSession,
  reconnectACPManagerConnection,
  removeACPManagerConnection,
  runACPManagerProbes,
  shutdownACPManager,
  sweepACPManagerIdleSessions,
} from '../acp-manager-orchestration.js';

function createSession({
  id = 'kiro',
  idle = false,
  stale = false,
}: {
  id?: string;
  idle?: boolean;
  stale?: boolean;
} = {}) {
  return {
    config: { id },
    shutdown: vi.fn().mockResolvedValue(undefined),
    isIdle: vi.fn().mockReturnValue(idle),
    isStale: vi.fn().mockReturnValue(stale),
    handleChat: vi.fn(),
  };
}

describe('acp-manager-orchestration helpers', () => {
  test('runACPManagerProbes skips probing while sessions are active', async () => {
    const probe = { probe: vi.fn().mockResolvedValue(true) };

    await runACPManagerProbes({
      sessions: new Map([['conv-1', createSession()]]),
      probes: new Map([['kiro', probe]]),
      getVirtualAgentCount: () => 1,
    });

    expect(probe.probe).not.toHaveBeenCalled();
  });

  test('runACPManagerProbes emits when discovered agent count changes', async () => {
    let agentCount = 1;
    const emit = vi.fn();
    const probe = {
      probe: vi.fn().mockImplementation(async () => {
        agentCount = 2;
        return true;
      }),
    };

    await runACPManagerProbes({
      sessions: new Map(),
      probes: new Map([['kiro', probe]]),
      eventBus: { emit },
      getVirtualAgentCount: () => agentCount,
    });

    expect(probe.probe).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('agents:changed');
  });

  test('add/reconnect/remove ACP manager connections mutate maps and emit changes', async () => {
    const config = {
      id: 'kiro',
      name: 'Kiro',
      command: 'kiro',
      args: ['acp'],
      enabled: true,
    };
    const probes = new Map<string, { probe(): Promise<boolean> }>();
    const configs = new Map();
    const sessions = new Map([
      ['conv-1', createSession({ id: 'kiro' })],
      ['conv-2', createSession({ id: 'other' })],
    ]);
    const emit = vi.fn();
    const probe = { probe: vi.fn().mockResolvedValue(true) };
    const removeConnection = vi.fn().mockResolvedValue(undefined);

    const added = await addACPManagerConnection({
      config,
      probes,
      configs,
      logger: { info: vi.fn() },
      cwd: '/tmp',
      eventBus: { emit },
      createProbe: () => probe,
      removeConnection,
    });

    expect(added).toBe(true);
    expect(probes.get('kiro')).toBe(probe);
    expect(configs.get('kiro')).toEqual(config);
    expect(emit).toHaveBeenCalledWith('agents:changed');

    const reconnected = await reconnectACPManagerConnection({
      id: 'kiro',
      probes,
      eventBus: { emit },
    });

    expect(reconnected).toBe(true);
    expect(probe.probe).toHaveBeenCalledTimes(2);

    await removeACPManagerConnection({
      id: 'kiro',
      probes,
      configs,
      sessions,
    });

    expect(probes.has('kiro')).toBe(false);
    expect(configs.has('kiro')).toBe(false);
    expect(sessions.has('conv-1')).toBe(false);
    expect(sessions.has('conv-2')).toBe(true);
  });

  test('getOrCreateACPManagerSession reuses existing sessions and creates new ones with context cwd', () => {
    const existingSession = createSession({ id: 'kiro' });
    const sessions = new Map([['conv-1', existingSession]]);
    const createSessionFn = vi
      .fn()
      .mockImplementation(({ config, conversationId, cwd }) => ({
        ...createSession({ id: config.id }),
        meta: { conversationId, cwd },
      }));
    const configs = new Map([
      [
        'kiro',
        {
          id: 'kiro',
          name: 'Kiro',
          command: 'kiro',
          args: ['acp'],
          enabled: true,
        },
      ],
    ]);

    const existing = getOrCreateACPManagerSession({
      configId: 'kiro',
      configs,
      sessions,
      options: { conversationId: 'conv-1' },
      createSession: createSessionFn,
    });
    expect(existing.session).toBe(existingSession);
    expect(createSessionFn).not.toHaveBeenCalled();

    const created = getOrCreateACPManagerSession({
      configId: 'kiro',
      configs,
      sessions,
      options: {},
      context: { conversationId: 'conv-2', cwd: '/workspace' },
      createSession: createSessionFn,
    });

    expect(created.conversationId).toBe('conv-2');
    expect((created.session as any).meta).toEqual({
      conversationId: 'conv-2',
      cwd: '/workspace',
    });
    expect(sessions.get('conv-2')).toBe(created.session);
  });

  test('sweep and shutdown clear ACP manager sessions and timers', async () => {
    const idleSession = createSession({ id: 'kiro', idle: true });
    const activeSession = createSession({ id: 'other' });
    const sessions = new Map([
      ['conv-1', idleSession],
      ['conv-2', activeSession],
    ]);

    await sweepACPManagerIdleSessions({ sessions });

    expect(idleSession.shutdown).toHaveBeenCalledTimes(1);
    expect(activeSession.shutdown).not.toHaveBeenCalled();
    expect(sessions.has('conv-1')).toBe(false);
    expect(sessions.has('conv-2')).toBe(true);

    const probeTimer = setInterval(() => {}, 60_000);
    const cullTimer = setInterval(() => {}, 30_000);
    const timers = await shutdownACPManager({
      probeTimer,
      cullTimer,
      sessions,
      probes: new Map([['kiro', { probe: vi.fn() }]]),
      configs: new Map([
        [
          'kiro',
          {
            id: 'kiro',
            name: 'Kiro',
            command: 'kiro',
            args: ['acp'],
            enabled: true,
          },
        ],
      ]),
    });

    expect(activeSession.shutdown).toHaveBeenCalledTimes(1);
    expect(timers).toEqual({ probeTimer: null, cullTimer: null });
    expect(sessions.size).toBe(0);
  });
});
