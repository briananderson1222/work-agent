import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let ActiveChatsStore: typeof import('../contexts/active-chats-store').ActiveChatsStore;

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('ActiveChatsStore', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
    });
    ({ ActiveChatsStore } = await import('../contexts/active-chats-store'));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('rehydrates persisted session metadata', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'activeChats',
      JSON.stringify([
        {
          sessionId: 'agent:1',
          conversationId: 'conv-1',
          agentSlug: 'planner',
          model: 'sonnet',
          projectSlug: 'proj',
          inputHistory: ['/resume'],
        },
      ]),
    );

    const store = new ActiveChatsStore({ storage });

    expect(store.getSnapshot()).toEqual({
      'agent:1': {
        input: '',
        attachments: [],
        queuedMessages: [],
        inputHistory: ['/resume'],
        hasUnread: false,
        agentSlug: 'planner',
        conversationId: 'conv-1',
        model: 'sonnet',
        projectSlug: 'proj',
        projectName: undefined,
        provider: 'bedrock',
        providerOptions: {},
        orchestrationSessionStarted: false,
        orchestrationProvider: undefined,
        orchestrationModel: undefined,
        orchestrationStatus: undefined,
        sessionAutoApprove: [],
        ephemeralMessages: [],
      },
    });
  });

  test('navigates input history and restores unsent input', () => {
    const store = new ActiveChatsStore({ storage: new MemoryStorage() });
    store.initChat('agent:2', {
      agentSlug: 'planner',
      agentName: 'Planner',
      title: 'Planner Chat',
    });
    store.updateChat('agent:2', {
      input: 'draft',
      inputHistory: ['first', 'second'],
    });

    store.navigateHistoryUp('agent:2');
    expect(store.getSnapshot()['agent:2']).toMatchObject({
      input: 'second',
      historyIndex: 1,
      savedInput: 'draft',
    });

    store.navigateHistoryUp('agent:2');
    expect(store.getSnapshot()['agent:2']).toMatchObject({
      input: 'first',
      historyIndex: 0,
    });

    store.navigateHistoryDown('agent:2');
    expect(store.getSnapshot()['agent:2']).toMatchObject({
      input: 'second',
      historyIndex: 1,
    });

    store.navigateHistoryDown('agent:2');
    expect(store.getSnapshot()['agent:2']).toMatchObject({
      input: 'draft',
      historyIndex: -1,
      savedInput: undefined,
    });
  });

  test('uses the persisted conversation id when ordering ephemeral messages', () => {
    const store = new ActiveChatsStore({
      storage: new MemoryStorage(),
      now: () => 100,
      randomId: () => 'seed',
      getBackendMessages: (agentSlug, conversationId) => {
        expect(agentSlug).toBe('planner');
        expect(conversationId).toBe('conv-42');
        return [{ timestamp: '2026-01-01T00:00:05.000Z' }];
      },
    });

    store.initChat('planner:session', {
      agentSlug: 'planner',
      agentName: 'Planner',
      title: 'Planner Chat',
      conversationId: 'conv-42',
    });
    store.addEphemeralMessage('planner:session', {
      role: 'system',
      content: 'queued',
    });

    expect(
      store.getSnapshot()['planner:session'].ephemeralMessages?.[0],
    ).toMatchObject({
      id: 'ephemeral-100-seed',
      content: 'queued',
      ephemeral: true,
      timestamp: new Date('2026-01-01T00:00:05.000Z').getTime() + 1,
    });
  });

  test('persists only conversation-backed sessions after debounced updates', () => {
    const storage = new MemoryStorage();
    const store = new ActiveChatsStore({ storage });
    store.initChat('draft:1', {
      agentSlug: 'planner',
      agentName: 'Planner',
      title: 'Draft',
    });
    store.initChat('chat:1', {
      agentSlug: 'planner',
      agentName: 'Planner',
      title: 'Saved',
      conversationId: 'conv-1',
    });
    store.updateChat('chat:1', { model: 'sonnet' });

    vi.runAllTimers();

    expect(JSON.parse(storage.getItem('activeChats') || '[]')).toEqual([
      expect.objectContaining({
        sessionId: 'chat:1',
        conversationId: 'conv-1',
        model: 'sonnet',
      }),
    ]);
  });
});
