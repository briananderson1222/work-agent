import { describe, expect, test, vi } from 'vitest';
import { handleACPConnectionChat } from '../acp-connection-chat.js';

vi.mock('../acp-chat-preparation.js', () => ({
  prepareACPChatTurn: vi.fn().mockResolvedValue({
    configOptions: [{ key: 'mode', value: 'dev' }],
    conversationId: 'conversation-1',
    currentModeId: 'mode-dev',
    inputText: 'hello',
    isNewConversation: true,
    promptContent: [{ type: 'text', text: 'hello' }],
    userId: 'user-1',
  }),
}));

vi.mock('../acp-chat-stream.js', () => ({
  streamACPChatResponse: vi.fn().mockResolvedValue('stream-response'),
}));

vi.mock('../../routes/auth.js', () => ({
  getCachedUser: () => ({ alias: 'tester' }),
}));

describe('handleACPConnectionChat', () => {
  test('returns 503 when restart fails', async () => {
    const c = { json: vi.fn().mockReturnValue('restart-error') } as any;

    const result = await handleACPConnectionChat({
      c,
      slug: 'kiro-dev',
      input: 'hello',
      options: {},
      prefix: 'kiro',
      cwd: '/tmp/project',
      logger: { info: vi.fn() },
      sessionMap: new Map(),
      getOrCreateAdapter: vi.fn(),
      getCurrentModelName: vi.fn(),
      updateToolResult: vi.fn(),
      getState: () => ({
        status: 'disconnected',
        shuttingDown: false,
        connection: null,
        sessionId: null,
        currentModeId: null,
        configOptions: [],
        activeWriter: null,
        responseAccumulator: '',
        responseParts: [],
      }),
      setPreparedState: vi.fn(),
      setActiveWriter: vi.fn(),
      setResponseAccumulator: vi.fn(),
      setResponseParts: vi.fn(),
      touchActivity: vi.fn(),
      start: vi.fn().mockResolvedValue(false),
    });

    expect(result).toBe('restart-error');
    expect(c.json).toHaveBeenCalledWith(
      { success: false, error: 'ACP failed to restart' },
      503,
    );
  });

  test('returns 503 when not connected after startup check', async () => {
    const c = { json: vi.fn().mockReturnValue('not-connected') } as any;

    const result = await handleACPConnectionChat({
      c,
      slug: 'kiro-dev',
      input: 'hello',
      options: {},
      prefix: 'kiro',
      cwd: '/tmp/project',
      logger: { info: vi.fn() },
      sessionMap: new Map(),
      getOrCreateAdapter: vi.fn(),
      getCurrentModelName: vi.fn(),
      updateToolResult: vi.fn(),
      getState: () => ({
        status: 'connected',
        shuttingDown: false,
        connection: null,
        sessionId: null,
        currentModeId: null,
        configOptions: [],
        activeWriter: null,
        responseAccumulator: '',
        responseParts: [],
      }),
      setPreparedState: vi.fn(),
      setActiveWriter: vi.fn(),
      setResponseAccumulator: vi.fn(),
      setResponseParts: vi.fn(),
      touchActivity: vi.fn(),
      start: vi.fn(),
    });

    expect(result).toBe('not-connected');
    expect(c.json).toHaveBeenCalledWith(
      { success: false, error: 'ACP not connected' },
      503,
    );
  });
});
