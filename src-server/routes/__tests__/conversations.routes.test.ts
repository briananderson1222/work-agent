import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  conversationOps: { add: vi.fn() },
}));
vi.mock('../../runtime/conversation-manager.js', () => ({
  manageConversationContext: vi.fn().mockResolvedValue({ success: true }),
  getConversationStats: vi.fn().mockResolvedValue({ tokens: 0, messages: 0 }),
}));

const { createConversationRoutes, createGlobalConversationRoutes } = await import('../conversations.js');

function createMockAdapter() {
  const convs = [{ id: 'c1', userId: 'agent:default', title: 'Test Chat' }];
  return {
    getConversations: vi.fn().mockResolvedValue(convs),
    getConversation: vi.fn().mockResolvedValue(convs[0]),
    updateConversation: vi.fn().mockImplementation(async (_id: string, updates: any) => ({ ...convs[0], ...updates })),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([{ role: 'user', content: 'hello' }]),
  };
}

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

async function json(res: Response) { return res.json(); }

describe('Conversation Routes', () => {
  test('GET /:slug/conversations returns list', async () => {
    const adapters = new Map([['default', createMockAdapter()]]);
    const app = createConversationRoutes(adapters as any, mockLogger);
    const body = await json(await app.request('/default/conversations'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  test('GET /:slug/conversations returns empty for unknown agent', async () => {
    const app = createConversationRoutes(new Map() as any, mockLogger);
    const body = await json(await app.request('/unknown/conversations'));
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test('DELETE /:slug/conversations/:id deletes', async () => {
    const adapter = createMockAdapter();
    const adapters = new Map([['default', adapter]]);
    const app = createConversationRoutes(adapters as any, mockLogger);
    const body = await json(await app.request('/default/conversations/c1', { method: 'DELETE' }));
    expect(body.success).toBe(true);
    expect(adapter.deleteConversation).toHaveBeenCalledWith('c1');
  });

  test('PATCH /:slug/conversations/:id updates title', async () => {
    const adapter = createMockAdapter();
    const adapters = new Map([['default', adapter]]);
    const app = createConversationRoutes(adapters as any, mockLogger);
    const body = await json(await app.request('/default/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    }));
    expect(body.success).toBe(true);
  });

  test('GET /:slug/conversations/:id/messages returns messages', async () => {
    const adapters = new Map([['default', createMockAdapter()]]);
    const app = createConversationRoutes(adapters as any, mockLogger);
    const body = await json(await app.request('/default/conversations/c1/messages'));
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe('Global Conversation Routes', () => {
  test('GET /:id finds conversation in adapters', async () => {
    const adapters = new Map([['default', createMockAdapter()]]);
    const storage = { getConversation: vi.fn().mockReturnValue(null) };
    const app = createGlobalConversationRoutes(adapters as any, storage as any, mockLogger);
    const body = await json(await app.request('/c1'));
    expect(body.success).toBe(true);
    expect(body.data.agentSlug).toBe('default');
  });

  test('GET /:id returns 404 when not found', async () => {
    const adapter = createMockAdapter();
    adapter.getConversation.mockResolvedValue(null);
    const adapters = new Map([['default', adapter]]);
    const storage = { getConversation: vi.fn().mockReturnValue(null) };
    const app = createGlobalConversationRoutes(adapters as any, storage as any, mockLogger);
    const res = await app.request('/missing');
    expect(res.status).toBe(404);
  });
});
