import { afterEach, describe, expect, test, vi } from 'vitest';
import { expectCanonicalSessionLifecycle } from './adapter-contract-test-utils.js';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

const { mockBuildCliRuntimePrerequisites } = vi.hoisted(() => ({
  mockBuildCliRuntimePrerequisites: vi.fn(),
}));

const { mockAnthropicModelsList } = vi.hoisted(() => ({
  mockAnthropicModelsList: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    models = {
      list: mockAnthropicModelsList,
    };
  },
}));

vi.mock('../cli-auth.js', () => ({
  buildCliRuntimePrerequisites: mockBuildCliRuntimePrerequisites,
}));

import { ClaudeAdapter } from '../adapters/claude-adapter.js';

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalAnthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

function createMockQuery(messages: any[]) {
  let closed = false;
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        if (closed) return;
        yield message;
      }
    },
    interrupt: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockImplementation(() => {
      closed = true;
    }),
  };
}

describe('ClaudeAdapter', () => {
  afterEach(() => {
    mockQuery.mockReset();
    mockBuildCliRuntimePrerequisites.mockReset();
    mockAnthropicModelsList.mockReset();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
    if (originalAnthropicAuthToken === undefined) {
      delete process.env.ANTHROPIC_AUTH_TOKEN;
    } else {
      process.env.ANTHROPIC_AUTH_TOKEN = originalAnthropicAuthToken;
    }
  });

  test('maps Claude SDK stream events to canonical runtime events', async () => {
    mockQuery.mockReturnValue(
      createMockQuery([
        {
          type: 'system',
          subtype: 'session_state_changed',
          state: 'running',
          uuid: 'm1',
          session_id: 'thread-1',
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello' },
          },
          uuid: 'm2',
          session_id: 'thread-1',
        },
        {
          type: 'tool_progress',
          tool_use_id: 'tool-1',
          tool_name: 'Read',
          parent_tool_use_id: null,
          elapsed_time_seconds: 1,
          uuid: 'm3',
          session_id: 'thread-1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
          uuid: 'm4',
          session_id: 'thread-1',
        },
      ]),
    );

    const adapter = new ClaudeAdapter();
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    await adapter.startSession({
      provider: 'claude',
      threadId: 'thread-1',
      cwd: '/tmp/project',
      modelId: 'claude-sonnet-4-6',
    });
    await adapter.sendTurn({
      threadId: 'thread-1',
      input: 'Inspect this codebase',
    });

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
      'turn.started',
      'session.state-changed',
      'content.text-delta',
      'tool.progress',
    ]);
  });

  test('opens and resolves permission requests through canUseTool', async () => {
    mockQuery.mockReturnValue(createMockQuery([]));
    const adapter = new ClaudeAdapter();
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    await adapter.startSession({
      provider: 'claude',
      threadId: 'thread-2',
    });
    await iterator.next();
    await iterator.next();

    const queryArgs = mockQuery.mock.calls[0][0];
    const permissionPromise = queryArgs.options.canUseTool(
      'Read',
      { path: 'a.ts' },
      {
        signal: new AbortController().signal,
        toolUseID: 'tool-use-1',
        title: 'Allow read',
        description: 'Claude wants to read a.ts',
        suggestions: [],
      },
    );

    const opened = await iterator.next();
    expect(opened.value).toMatchObject({
      method: 'request.opened',
      requestType: 'approval',
    });

    await adapter.respondToRequest(
      'thread-2',
      opened.value.requestId,
      'accept',
    );
    const result = await permissionPromise;
    const resolved = await iterator.next();

    expect(result).toMatchObject({ behavior: 'allow' });
    expect(resolved.value).toMatchObject({
      method: 'request.resolved',
      status: 'approved',
    });
  });

  test('reports missing Claude CLI login when the CLI is unauthenticated', async () => {
    mockBuildCliRuntimePrerequisites.mockResolvedValue([
      {
        id: 'claude-cli',
        name: 'Claude CLI',
        status: 'installed',
        category: 'required',
      },
      {
        id: 'claude-auth',
        name: 'Claude login',
        status: 'missing',
        category: 'required',
      },
    ]);
    const adapter = new ClaudeAdapter();

    await expect(adapter.getPrerequisites?.()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Claude CLI',
          category: 'required',
        }),
        expect.objectContaining({
          name: 'Claude login',
          status: 'missing',
          category: 'required',
        }),
      ]),
    );
  });

  test('lists models from the Anthropic models API when explicit auth is available', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockAnthropicModelsList.mockResolvedValue({
      data: [
        {
          id: 'claude-sonnet-4-6',
          display_name: 'Claude Sonnet 4.6',
        },
        {
          id: 'claude-opus-4-6',
          display_name: 'Claude Opus 4.6',
        },
      ],
    });

    const adapter = new ClaudeAdapter();

    await expect(adapter.listModels?.()).resolves.toEqual([
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        originalId: 'claude-sonnet-4-6',
      },
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        originalId: 'claude-opus-4-6',
      },
    ]);
    expect(mockAnthropicModelsList).toHaveBeenCalledWith({ limit: 100 });
  });

  test('returns an empty dynamic model list when Anthropic auth is unavailable', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const adapter = new ClaudeAdapter();

    await expect(adapter.listModels?.()).resolves.toEqual([]);
    expect(mockAnthropicModelsList).not.toHaveBeenCalled();
  });

  test('rejects approval responses for unknown requests', async () => {
    mockQuery.mockReturnValue(createMockQuery([]));
    const adapter = new ClaudeAdapter();

    await adapter.startSession({
      provider: 'claude',
      threadId: 'thread-3',
    });

    await expect(
      adapter.respondToRequest('thread-3', 'missing-request', 'accept'),
    ).rejects.toThrow(/unknown claude permission request/i);
  });

  test('publishes runtime.error when the Claude SDK stream fails', async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield* [] as never[];
        throw new Error('Claude stream failed');
      },
      interrupt: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    });
    const adapter = new ClaudeAdapter();
    const iterator = adapter.streamEvents()[Symbol.asyncIterator]();

    await adapter.startSession({
      provider: 'claude',
      threadId: 'thread-4',
    });

    expect((await iterator.next()).value.method).toBe('session.started');
    expect((await iterator.next()).value.method).toBe('session.configured');
    expect((await iterator.next()).value).toMatchObject({
      method: 'runtime.error',
      message: 'Claude stream failed',
    });
  });
});
