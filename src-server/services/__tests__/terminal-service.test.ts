import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  terminalOps: { add: vi.fn() },
}));

const { TerminalService } = await import('../terminal-service.js');

function createMockPty() {
  return {
    spawn: vi.fn().mockResolvedValue({
      pid: 12345,
      onData: vi.fn().mockReturnValue(vi.fn()),
      onExit: vi.fn().mockReturnValue(vi.fn()),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    }),
  };
}

function createMockHistoryStore() {
  const store = new Map<string, string>();
  return {
    load: vi.fn(async (id: string) => store.get(id) || ''),
    save: vi.fn(async (id: string, data: string) => { store.set(id, data); }),
  };
}

describe('TerminalService', () => {
  let svc: InstanceType<typeof TerminalService>;
  let pty: ReturnType<typeof createMockPty>;

  beforeEach(() => {
    pty = createMockPty();
    svc = new TerminalService(pty as any, createMockHistoryStore() as any);
  });

  afterEach(async () => {
    await svc.dispose();
  });

  test('open spawns a PTY process', async () => {
    const snap = await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    expect(snap.sessionId).toBe('test:t1');
    expect(snap.status).toBe('running');
    expect(snap.pid).toBe(12345);
    expect(pty.spawn).toHaveBeenCalled();
  });

  test('open returns existing session if running', async () => {
    await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    const snap2 = await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    expect(snap2.status).toBe('running');
    expect(pty.spawn).toHaveBeenCalledTimes(1); // not spawned again
  });

  test('write delegates to process', async () => {
    await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    svc.write('test:t1', 'ls\n');
    const proc = pty.spawn.mock.results[0].value;
    expect(proc.write).toHaveBeenCalledWith('ls\n');
  });

  test('resize delegates to process', async () => {
    await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    svc.resize('test:t1', 120, 40);
    const proc = pty.spawn.mock.results[0].value;
    expect(proc.resize).toHaveBeenCalledWith(120, 40);
  });

  test('close kills process', async () => {
    await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    await svc.close('test:t1');
    const proc = pty.spawn.mock.results[0].value;
    expect(proc.kill).toHaveBeenCalled();
  });

  test('subscribe receives events', async () => {
    const events: any[] = [];
    svc.subscribe((e) => events.push(e));
    await svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 });
    expect(events.some((e) => e.type === 'started')).toBe(true);
  });

  test('open throws when no shell found', async () => {
    pty.spawn.mockRejectedValue(new Error('spawn failed'));
    await expect(svc.open({ projectSlug: 'test', terminalId: 't1', cwd: '/tmp', cols: 80, rows: 24 })).rejects.toThrow('no viable shell');
  });

  test('write is no-op for unknown session', () => {
    svc.write('unknown:t1', 'data');
    // Should not throw
  });

  test('close is no-op for unknown session', async () => {
    await svc.close('unknown:t1');
    // Should not throw
  });
});
