import { describe, expect, test, vi } from 'vitest';
import {
  isACPConnectionConnected,
  isACPConnectionIdle,
  isACPConnectionStale,
  loadACPConnectionSession,
} from '../acp-connection-session.js';

describe('acp-connection-session helpers', () => {
  test('checks connected state from status, connection, and session id', () => {
    expect(
      isACPConnectionConnected({
        status: 'connected',
        connection: {} as any,
        sessionId: 'session-1',
      }),
    ).toBe(true);
    expect(
      isACPConnectionConnected({
        status: 'disconnected',
        connection: {} as any,
        sessionId: 'session-1',
      }),
    ).toBe(false);
  });

  test('checks idle and stale thresholds', () => {
    expect(
      isACPConnectionIdle({
        status: 'connected',
        activeWriter: null,
        lastActivityAt: 1_000,
        now: 1_000 + 5 * 60_000 + 1,
      }),
    ).toBe(true);
    expect(
      isACPConnectionIdle({
        status: 'connected',
        activeWriter: vi.fn() as any,
        lastActivityAt: 1_000,
        now: 1_000 + 10 * 60_000,
      }),
    ).toBe(false);
    expect(
      isACPConnectionStale({
        status: 'error',
        lastActivityAt: 1_000,
        now: 1_000 + 30_000 + 1,
      }),
    ).toBe(true);
    expect(
      isACPConnectionStale({
        status: 'connected',
        lastActivityAt: 1_000,
        now: 1_000 + 60_000,
      }),
    ).toBe(false);
  });

  test('loads ACP sessions and reports failures', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const loadSession = vi.fn().mockResolvedValue(undefined);

    await expect(
      loadACPConnectionSession({
        connection: { loadSession } as any,
        sessionId: 'session-1',
        cwd: '/tmp/project',
        logger,
      }),
    ).resolves.toBe(true);

    expect(loadSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      mcpServers: [],
    });

    await expect(
      loadACPConnectionSession({
        connection: {
          loadSession: vi.fn().mockRejectedValue(new Error('boom')),
        } as any,
        sessionId: 'session-2',
        cwd: '/tmp/project',
        logger,
      }),
    ).resolves.toBe(false);
  });
});
