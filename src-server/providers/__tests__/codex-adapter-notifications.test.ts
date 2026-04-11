import { PassThrough, Writable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import type { ProviderSession } from '../../providers/adapter-shape.js';
import { handleCodexNotification } from '../adapters/codex-adapter-notifications.js';
import type { CodexSessionRecord } from '../adapters/codex-adapter-types.js';

class FakeWritable extends Writable {
  _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

function buildRecord(
  overrides: Partial<CodexSessionRecord> = {},
): CodexSessionRecord {
  const session: ProviderSession = {
    provider: 'codex',
    threadId: 'thread-1',
    status: 'ready',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    externalThreadId: 'thread-1',
    codexThreadId: 'codex-thread-1',
    process: {
      stdin: new FakeWritable(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
      on() {
        return this as any;
      },
    },
    session,
    rpcRequestCounter: 0,
    pendingRpcRequests: new Map(),
    pendingApprovals: new Map(),
    lastSessionState: 'idle',
    turnOutput: new Map(),
    toolNames: new Map(),
    toolStarted: new Set(),
    ...overrides,
  };
}

describe('codex-adapter-notifications', () => {
  test('updates session state and emits state change events', () => {
    const record = buildRecord();
    const events: any[] = [];

    handleCodexNotification({
      record,
      notification: {
        method: 'thread/status/changed',
        params: {
          threadId: 'codex-thread-1',
          status: { type: 'active', activeFlags: [] },
        },
      },
      nowIso: () => '2026-01-02T00:00:00.000Z',
      publish: (event) => events.push(event),
    });

    expect(record.lastSessionState).toBe('running');
    expect(record.session.status).toBe('running');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      method: 'session.state-changed',
      from: 'idle',
      to: 'running',
    });
  });

  test('tracks tool lifecycle and turn completion output', () => {
    const record = buildRecord({
      activeTurnId: 'turn-1',
      activeTurnStartedAt: Date.now() - 10,
      turnOutput: new Map([['turn-1', 'Done.']]),
    });
    const events: any[] = [];

    handleCodexNotification({
      record,
      notification: {
        method: 'item/started',
        params: {
          turnId: 'turn-1',
          item: {
            id: 'tool-1',
            type: 'commandExecution',
            command: 'ls',
            cwd: '/tmp/project',
          },
        },
      },
      nowIso: () => '2026-01-02T00:00:00.000Z',
      publish: (event) => events.push(event),
    });

    handleCodexNotification({
      record,
      notification: {
        method: 'item/completed',
        params: {
          turnId: 'turn-1',
          item: {
            id: 'tool-1',
            type: 'commandExecution',
            command: 'ls',
            cwd: '/tmp/project',
            status: 'completed',
            aggregatedOutput: 'file-a\n',
            exitCode: 0,
            durationMs: 12,
          },
        },
      },
      nowIso: () => '2026-01-02T00:00:01.000Z',
      publish: (event) => events.push(event),
    });

    handleCodexNotification({
      record,
      notification: {
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-1',
            status: 'completed',
          },
        },
      },
      nowIso: () => '2026-01-02T00:00:02.000Z',
      publish: (event) => events.push(event),
    });

    expect(record.toolStarted.has('tool-1')).toBe(false);
    expect(record.activeTurnId).toBeUndefined();
    expect(record.session.status).toBe('ready');
    expect(record.session.resumeCursor).toEqual({
      codexThreadId: 'codex-thread-1',
      turnId: 'turn-1',
    });
    expect(events.map((event) => event.method)).toEqual([
      'tool.started',
      'tool.completed',
      'turn.completed',
    ]);
    expect(events[2]).toMatchObject({
      outputText: 'Done.',
      finishReason: 'stop',
    });
  });
});
