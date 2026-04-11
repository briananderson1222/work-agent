import crypto from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildApprovalResult,
  deriveToolArguments,
  deriveToolName,
  deriveToolOutput,
  mapApprovalResolutionStatus,
  mapServerRequestToEvent,
  mapThreadStatusToState,
  mapToolCompletionStatus,
  mapTurnFinishReason,
} from '../adapters/codex-adapter-events.js';

describe('codex-adapter-events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('maps approval requests into canonical request.opened events', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('event-1');

    expect(
      mapServerRequestToEvent(
        'thread-1',
        'request-1',
        'item/commandExecution/requestApproval',
        {
          command: 'rm -rf tmp',
          reason: 'Needs approval',
        },
        '2026-01-01T00:00:00.000Z',
      ),
    ).toEqual({
      eventId: 'event-1',
      provider: 'codex',
      threadId: 'thread-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      requestId: 'request-1',
      method: 'request.opened',
      requestType: 'approval',
      title: 'rm -rf tmp',
      description: 'Needs approval',
      payload: {
        command: 'rm -rf tmp',
        reason: 'Needs approval',
      },
    });
  });

  test('builds approval results and resolution statuses', () => {
    expect(
      buildApprovalResult(
        'item/permissions/requestApproval',
        { permissions: { fs: 'write' } },
        'acceptForSession',
      ),
    ).toEqual({
      permissions: { fs: 'write' },
      scope: 'session',
    });
    expect(
      buildApprovalResult(
        'item/fileChange/requestApproval',
        {},
        'decline',
      ),
    ).toEqual({ decision: 'decline' });

    expect(mapApprovalResolutionStatus('accept')).toBe('approved');
    expect(mapApprovalResolutionStatus('acceptForSession')).toBe('approved');
    expect(mapApprovalResolutionStatus('decline')).toBe('denied');
    expect(mapApprovalResolutionStatus('cancel')).toBe('cancelled');
  });

  test('derives tool names, arguments, and output from item payloads', () => {
    const commandItem = {
      type: 'commandExecution',
      command: 'ls',
      cwd: '/tmp/project',
      aggregatedOutput: 'file-a',
      exitCode: 0,
      durationMs: 12,
    };

    expect(deriveToolName(commandItem)).toBe('shell_exec');
    expect(deriveToolArguments(commandItem)).toEqual({
      command: 'ls',
      cwd: '/tmp/project',
    });
    expect(deriveToolOutput(commandItem)).toEqual({
      output: 'file-a',
      exitCode: 0,
      durationMs: 12,
    });
  });

  test('maps thread, turn, and tool completion states', () => {
    expect(mapThreadStatusToState({ type: 'active' })).toBe('running');
    expect(mapThreadStatusToState({ type: 'systemError' })).toBe('errored');
    expect(mapThreadStatusToState({ type: 'idle' })).toBe('idle');

    expect(mapTurnFinishReason('completed')).toBe('stop');
    expect(mapTurnFinishReason('interrupted')).toBe('cancelled');
    expect(mapTurnFinishReason('unknown')).toBe('other');

    expect(mapToolCompletionStatus('completed')).toBe('success');
    expect(mapToolCompletionStatus('declined')).toBe('cancelled');
    expect(mapToolCompletionStatus('failed')).toBe('error');
  });
});
