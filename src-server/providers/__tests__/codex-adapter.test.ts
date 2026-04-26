import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, test } from 'vitest';
import { CodexAdapter } from '../adapters/codex-adapter.js';
import { expectCanonicalSessionLifecycle } from './adapter-contract-test-utils.js';

class FakeWritable extends Writable {
  readonly lines: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (line.trim()) {
        this.lines.push(line);
      }
    }
    callback();
  }
}

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new FakeWritable();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  constructor() {
    super();
    this.stdout.setEncoding('utf8');
    this.stderr.setEncoding('utf8');
  }

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0);
    return true;
  }
}

function parseLine(line: string): any {
  return JSON.parse(line);
}

async function flushIo(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function writeServerMessage(
  adapter: CodexAdapter,
  threadId: string,
  message: unknown,
): void {
  const transport = (adapter as any).transport;
  const record = transport.requireSession(threadId);
  transport.handleStdoutLine(record, JSON.stringify(message));
}

async function nextEvent(
  iterator: AsyncIterator<any>,
  label: string,
): Promise<any> {
  const result = await Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${label}`)),
        750,
      ),
    ),
  ]);
  return result.value;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${label}`)),
        750,
      ),
    ),
  ]);
}

describe('CodexAdapter', () => {
  let processHandle: FakeCodexProcess | undefined;
  const originalPath = process.env.PATH;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    processHandle?.stdout.end();
    processHandle?.stderr.end();
    processHandle = undefined;
    process.env.PATH = originalPath;
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  test('starts a Codex session, sends turns, and maps notifications to canonical events', async () => {
    processHandle = new FakeCodexProcess();
    const adapter = new CodexAdapter({
      processFactory: () => processHandle!,
    });
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    const startSessionPromise = adapter.startSession({
      provider: 'codex',
      threadId: 'thread-1',
      cwd: '/tmp/project',
      modelId: 'gpt-5-codex',
      modelOptions: {
        reasoningEffort: 'high',
        fastMode: true,
      },
    });
    await flushIo();

    writeServerMessage(adapter, 'thread-1', {
      id: '1',
      result: {
        userAgent: 'test',
        codexHome: '/tmp/.codex',
        platformFamily: 'unix',
        platformOs: 'linux',
      },
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-1', {
      id: '2',
      result: {
        thread: {
          id: 'codex-thread-1',
        },
        model: 'gpt-5-codex',
      },
    });

    const session = await withTimeout(startSessionPromise, 'startSession');
    await flushIo();
    expect(session).toMatchObject({
      threadId: 'thread-1',
      status: 'ready',
      resumeCursor: { codexThreadId: 'codex-thread-1' },
    });

    const sendTurnPromise = adapter.sendTurn({
      threadId: 'thread-1',
      input: 'Inspect the repo',
      modelOptions: {
        reasoningEffort: 'high',
        fastMode: true,
      },
    });

    writeServerMessage(adapter, 'thread-1', {
      id: '3',
      result: {
        turn: {
          id: 'turn-1',
        },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'thread/status/changed',
      params: {
        threadId: 'codex-thread-1',
        status: { type: 'active', activeFlags: [] },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'item/started',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'tool-1',
          command: 'ls',
          cwd: '/tmp/project',
          status: 'inProgress',
          commandActions: [],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
          processId: 'pty-1',
          source: 'localShell',
        },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'item/commandExecution/outputDelta',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        itemId: 'tool-1',
        delta: 'file-a\n',
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'item/completed',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'tool-1',
          command: 'ls',
          cwd: '/tmp/project',
          status: 'completed',
          commandActions: [],
          aggregatedOutput: 'file-a\n',
          exitCode: 0,
          durationMs: 12,
          processId: 'pty-1',
          source: 'localShell',
        },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'Done.',
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'item/reasoning/textDelta',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        itemId: 'reason-1',
        delta: 'Need to check files first.',
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'codex-thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          total: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            cachedInputTokens: 2,
          },
        },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'thread/status/changed',
      params: {
        threadId: 'codex-thread-1',
        status: { type: 'idle' },
      },
    });
    writeServerMessage(adapter, 'thread-1', {
      method: 'turn/completed',
      params: {
        threadId: 'codex-thread-1',
        turn: {
          id: 'turn-1',
          status: 'completed',
          items: [],
          error: null,
        },
      },
    });

    const turn = await withTimeout(sendTurnPromise, 'sendTurn');
    await flushIo();
    expect(turn).toEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
      resumeCursor: {
        codexThreadId: 'codex-thread-1',
        turnId: 'turn-1',
      },
    });

    const events = [
      await nextEvent(iterator, 'event 1'),
      await nextEvent(iterator, 'event 2'),
      await nextEvent(iterator, 'event 3'),
      await nextEvent(iterator, 'event 4'),
      await nextEvent(iterator, 'event 5'),
      await nextEvent(iterator, 'event 6'),
      await nextEvent(iterator, 'event 7'),
      await nextEvent(iterator, 'event 8'),
      await nextEvent(iterator, 'event 9'),
      await nextEvent(iterator, 'event 10'),
      await nextEvent(iterator, 'event 11'),
      await nextEvent(iterator, 'event 12'),
    ];
    const methods = events.map((event) => event.method);

    expectCanonicalSessionLifecycle(methods);
    expect(methods).toContain('session.state-changed');
    expect(methods).toContain('tool.started');
    expect(methods).toContain('tool.progress');
    expect(methods).toContain('tool.completed');
    expect(methods).toContain('content.text-delta');
    expect(methods).toContain('content.reasoning-delta');
    expect(methods).toContain('token-usage.updated');
    expect(methods).toContain('turn.completed');

    const usageEvent = events.find(
      (event) => event.method === 'token-usage.updated',
    );
    expect(usageEvent).toMatchObject({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cacheReadTokens: 2,
    });

    const idleEvent = events.find(
      (event) =>
        event.method === 'session.state-changed' &&
        event.from === 'running' &&
        event.to === 'idle',
    );
    const completedEvent = events.find(
      (event) => event.method === 'turn.completed',
    );

    expect(idleEvent).toBeTruthy();
    expect(completedEvent).toMatchObject({
      turnId: 'turn-1',
      finishReason: 'stop',
      outputText: 'Done.',
    });

    const writtenMethods = processHandle.stdin.lines.map(
      (line) => parseLine(line).method,
    );
    expect(writtenMethods).toEqual([
      'initialize',
      'initialized',
      'thread/start',
      'turn/start',
    ]);
  });

  test('resolves approval requests by writing JSON-RPC responses back to Codex', async () => {
    processHandle = new FakeCodexProcess();
    const adapter = new CodexAdapter({
      processFactory: () => processHandle!,
    });
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    const sessionPromise = adapter.startSession({
      provider: 'codex',
      threadId: 'thread-2',
      cwd: '/tmp/project',
    });
    await flushIo();

    writeServerMessage(adapter, 'thread-2', {
      id: '1',
      result: {
        userAgent: 'test',
        codexHome: '/tmp/.codex',
        platformFamily: 'unix',
        platformOs: 'linux',
      },
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-2', {
      id: '2',
      result: {
        thread: {
          id: 'codex-thread-2',
        },
        model: 'gpt-5-codex',
      },
    });

    await withTimeout(sessionPromise, 'startSession approval');
    await nextEvent(iterator, 'session.started');
    await nextEvent(iterator, 'session.configured');

    writeServerMessage(adapter, 'thread-2', {
      id: 'approval-1',
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'codex-thread-2',
        turnId: 'turn-2',
        itemId: 'perm-1',
        reason: 'Needs network access',
        permissions: {
          network: { enabled: true },
          fileSystem: null,
        },
      },
    });

    await flushIo();
    const opened = await nextEvent(iterator, 'request.opened');
    expect(opened).toMatchObject({
      method: 'request.opened',
      requestType: 'permission',
      description: 'Needs network access',
    });

    await adapter.respondToRequest(
      'thread-2',
      opened.requestId,
      'acceptForSession',
    );

    const response = parseLine(
      processHandle.stdin.lines[processHandle.stdin.lines.length - 1],
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'approval-1',
      result: {
        permissions: {
          network: { enabled: true },
          fileSystem: null,
        },
        scope: 'session',
      },
    });

    await flushIo();
    const resolved = await nextEvent(iterator, 'request.resolved');
    expect(resolved).toMatchObject({
      method: 'request.resolved',
      status: 'approved',
    });
  });

  test('reports missing Codex prerequisites when CLI or login are unavailable', async () => {
    process.env.PATH = '/definitely-missing-codex';
    const adapter = new CodexAdapter();

    await expect(adapter.getPrerequisites()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Codex CLI',
          status: 'missing',
        }),
        expect.objectContaining({
          name: 'Codex login',
          status: 'missing',
        }),
      ]),
    );
  });

  test('lists models from Codex app-server model/list', async () => {
    processHandle = new FakeCodexProcess();
    const adapter = new CodexAdapter({
      processFactory: () => processHandle!,
    });

    const listModelsPromise = adapter.listModels();
    await flushIo();

    processHandle!.stdout.write(
      `${JSON.stringify({
        id: '1',
        result: {
          userAgent: 'test',
          codexHome: '/tmp/.codex',
          platformFamily: 'unix',
          platformOs: 'linux',
        },
      })}\n`,
    );
    await flushIo();
    processHandle!.stdout.write(
      `${JSON.stringify({
        id: '2',
        result: {
          data: [
            {
              id: 'gpt-5.4',
              model: 'gpt-5.4',
              displayName: 'GPT-5.4',
            },
          ],
          nextCursor: 'next-page',
        },
      })}\n`,
    );
    await flushIo();
    processHandle!.stdout.write(
      `${JSON.stringify({
        id: '3',
        result: {
          data: [
            {
              model: 'gpt-5.5',
              displayName: 'GPT-5.5',
            },
          ],
          nextCursor: null,
        },
      })}\n`,
    );

    await expect(listModelsPromise).resolves.toEqual([
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        originalId: 'gpt-5.4',
      },
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        originalId: 'gpt-5.5',
      },
    ]);

    const writtenMessages = processHandle.stdin.lines.map(parseLine);
    expect(writtenMessages.map((message) => message.method)).toEqual([
      'initialize',
      'initialized',
      'model/list',
      'model/list',
    ]);
    expect(writtenMessages[3].params.cursor).toBe('next-page');
  });

  test('publishes a warning for malformed JSON-RPC payloads', async () => {
    processHandle = new FakeCodexProcess();
    const adapter = new CodexAdapter({
      processFactory: () => processHandle!,
    });
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    const sessionPromise = adapter.startSession({
      provider: 'codex',
      threadId: 'thread-3',
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-3', {
      id: '1',
      result: {
        userAgent: 'test',
        codexHome: '/tmp/.codex',
        platformFamily: 'unix',
        platformOs: 'linux',
      },
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-3', {
      id: '2',
      result: {
        thread: { id: 'codex-thread-3' },
      },
    });

    await withTimeout(sessionPromise, 'startSession malformed payload');
    await nextEvent(iterator, 'session.started');
    await nextEvent(iterator, 'session.configured');

    const transport = (adapter as any).transport;
    transport.handleStdoutLine(
      transport.requireSession('thread-3'),
      '{not json',
    );

    expect(await nextEvent(iterator, 'runtime.warning')).toMatchObject({
      method: 'runtime.warning',
      code: 'codex-json-parse',
    });
  });

  test('rejects approval responses for unknown requests', async () => {
    processHandle = new FakeCodexProcess();
    const adapter = new CodexAdapter({
      processFactory: () => processHandle!,
    });

    const sessionPromise = adapter.startSession({
      provider: 'codex',
      threadId: 'thread-4',
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-4', {
      id: '1',
      result: {
        userAgent: 'test',
        codexHome: '/tmp/.codex',
        platformFamily: 'unix',
        platformOs: 'linux',
      },
    });
    await flushIo();
    writeServerMessage(adapter, 'thread-4', {
      id: '2',
      result: {
        thread: { id: 'codex-thread-4' },
      },
    });
    await withTimeout(sessionPromise, 'startSession unknown approval');

    await expect(
      adapter.respondToRequest('thread-4', 'missing-request', 'accept'),
    ).rejects.toThrow(/unknown codex approval request/i);
  });
});
