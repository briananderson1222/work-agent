import { describe, expect, test, vi } from 'vitest';
import { BedrockAdapter } from '../adapters/bedrock-adapter.js';
import { checkBedrockCredentials } from '../bedrock.js';
import { expectCanonicalSessionLifecycle } from './adapter-contract-test-utils.js';

vi.mock('../bedrock.js', () => ({
  checkBedrockCredentials: vi.fn(),
}));

describe('BedrockAdapter', () => {
  test('starts sessions, sends turns, and emits canonical runtime events', async () => {
    const adapter = new BedrockAdapter({
      sendTurn: async () => ({
        outputText: 'Completed output',
      }),
    });
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    const session = await adapter.startSession({
      provider: 'bedrock',
      threadId: 'thread-1',
      cwd: '/tmp/project',
      modelId: 'anthropic.claude',
    });
    const turn = await adapter.sendTurn({
      threadId: session.threadId,
      input: 'Inspect the repo',
    });

    expect(turn.threadId).toBe('thread-1');
    expect(await adapter.hasSession('thread-1')).toBe(true);

    const methods = [
      (await iterator.next()).value.method,
      (await iterator.next()).value.method,
      (await iterator.next()).value.method,
      (await iterator.next()).value.method,
      (await iterator.next()).value.method,
      (await iterator.next()).value.method,
    ];

    expectCanonicalSessionLifecycle(methods);
    expect(methods).toEqual([
      'session.started',
      'session.configured',
      'session.state-changed',
      'turn.started',
      'content.text-delta',
      'turn.completed',
    ]);
  });

  test('resolves approval requests and tears down sessions', async () => {
    const adapter = new BedrockAdapter();
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    await adapter.startSession({
      provider: 'bedrock',
      threadId: 'thread-2',
    });
    await iterator.next();
    await iterator.next();

    await adapter.respondToRequest('thread-2', 'req-1', 'accept');
    await adapter.stopSession('thread-2');

    const requestResolved = await iterator.next();
    const sessionExited = await iterator.next();

    expect(requestResolved.value).toMatchObject({
      method: 'request.resolved',
      requestId: 'req-1',
      status: 'approved',
    });
    expect(sessionExited.value).toMatchObject({
      method: 'session.exited',
      sessionId: 'thread-2',
    });
    expect(await adapter.hasSession('thread-2')).toBe(false);
  });

  test('rejects sendTurn for an unknown session', async () => {
    const adapter = new BedrockAdapter();

    await expect(
      adapter.sendTurn({
        threadId: 'missing-thread',
        input: 'Inspect the repo',
      }),
    ).rejects.toThrow(/missing session/i);
  });

  test('surfaces Bedrock credential prerequisites for runtime readiness', async () => {
    vi.mocked(checkBedrockCredentials).mockResolvedValue(false);
    const adapter = new BedrockAdapter();

    await expect(adapter.getPrerequisites?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'bedrock-credentials',
        name: 'Bedrock Credentials',
        status: 'missing',
        category: 'required',
      }),
    ]);
  });
});
