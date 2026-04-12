import { describe, expect, test } from 'vitest';
import {
  appendInputHistory,
  assignConversationIdState,
  clearEphemeralMessagesState,
  clearInputState,
  clearQueueState,
  createDefaultChatState,
  createEphemeralMessageState,
  hydrateActiveChats,
  mergeChatUpdates,
  navigateHistoryDownState,
  navigateHistoryUpState,
  removeQueuedMessageState,
  serializeActiveChats,
} from '../contexts/active-chats-state';
import type { PlanArtifact } from '../utils/planArtifacts';

describe('active chat state helpers', () => {
  test('creates default chat state with metadata merged in', () => {
    expect(
      createDefaultChatState({
        agentSlug: 'planner',
        agentName: 'Planner',
        title: 'Planning',
        conversationId: 'conv-1',
        projectSlug: 'proj',
        projectName: 'Project',
        provider: 'anthropic',
        model: 'sonnet',
        providerOptions: { temperature: 0.2 },
      }),
    ).toMatchObject({
      input: '',
      attachments: [],
      queuedMessages: [],
      inputHistory: [],
      hasUnread: false,
      provider: 'anthropic',
      providerOptions: { temperature: 0.2 },
      orchestrationSessionStarted: false,
      agentSlug: 'planner',
      title: 'Planning',
      conversationId: 'conv-1',
      model: 'sonnet',
      projectSlug: 'proj',
      projectName: 'Project',
    });
  });

  test('hydrates and serializes only conversation-backed sessions', () => {
    const planArtifact: PlanArtifact = {
      source: 'reasoning',
      rawText: '✅ First\n🔄 Second',
      steps: [
        { content: 'First', status: 'completed' },
        { content: 'Second', status: 'in_progress' },
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const chats = hydrateActiveChats([
      {
        sessionId: 'draft:1',
        conversationId: 'conv-draft',
        agentSlug: 'planner',
        inputHistory: ['/resume'],
        ephemeralMessages: [],
        currentModeId: 'plan',
        planArtifact,
      },
      {
        sessionId: 'ephemeral:1',
        conversationId: undefined as never,
        agentSlug: 'planner',
      } as never,
    ]);

    expect(chats['draft:1']).toMatchObject({
      input: '',
      inputHistory: ['/resume'],
      provider: undefined,
      ephemeralMessages: [],
      currentModeId: 'plan',
      planArtifact,
    });

    expect(
      serializeActiveChats({
        ...chats,
        'draft:1': {
          ...chats['draft:1'],
          model: 'sonnet',
        },
      }),
    ).toEqual([
      expect.objectContaining({
        sessionId: 'draft:1',
        conversationId: 'conv-draft',
        agentSlug: 'planner',
        model: 'sonnet',
        currentModeId: 'plan',
        planArtifact,
      }),
    ]);
  });

  test('navigates history and restores saved input', () => {
    const seeded = appendInputHistory(
      {
        input: 'draft',
        attachments: [],
        queuedMessages: [],
        inputHistory: ['first', 'second'],
        hasUnread: false,
      },
      'third',
    );

    expect(seeded.inputHistory).toEqual(['first', 'second', 'third']);

    const up = navigateHistoryUpState({
      ...seeded,
      input: 'draft',
      historyIndex: -1,
      savedInput: undefined,
    });

    expect(up).toMatchObject({
      input: 'third',
      historyIndex: 2,
      savedInput: 'draft',
    });

    const down = navigateHistoryDownState({
      ...up!,
      historyIndex: 2,
      savedInput: 'draft',
    });

    expect(down).toMatchObject({
      input: 'draft',
      historyIndex: -1,
      savedInput: undefined,
    });
  });

  test('merges updates and resets history when input changes', () => {
    const result = mergeChatUpdates(
      {
        input: 'draft',
        attachments: [],
        queuedMessages: [],
        inputHistory: [],
        hasUnread: false,
        historyIndex: 2,
      },
      { input: 'changed' },
    );

    expect(result).toEqual({
      chat: expect.objectContaining({
        input: 'changed',
        historyIndex: -1,
      }),
      shouldPersist: false,
    });
  });

  test('persists plan artifact updates', () => {
    const planArtifact: PlanArtifact = {
      source: 'assistant',
      rawText: '- First\n- Second',
      steps: [
        { content: 'First', status: 'pending' },
        { content: 'Second', status: 'pending' },
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = mergeChatUpdates(
      {
        input: '',
        attachments: [],
        queuedMessages: [],
        inputHistory: [],
        hasUnread: false,
      },
      { planArtifact },
    );

    expect(result).toEqual({
      chat: expect.objectContaining({ planArtifact }),
      shouldPersist: true,
    });
  });

  test('creates ephemeral messages using the persisted conversation id', () => {
    const next = createEphemeralMessageState(
      {
        input: '',
        attachments: [],
        queuedMessages: [],
        inputHistory: [],
        hasUnread: false,
        agentSlug: 'planner',
        conversationId: 'conv-42',
        ephemeralMessages: [],
      },
      {
        role: 'system',
        content: 'queued',
      },
      3,
      () => 100,
      () => 'seed',
      (agentSlug, conversationId) => {
        expect(agentSlug).toBe('planner');
        expect(conversationId).toBe('conv-42');
        return [{ timestamp: '2026-01-01T00:00:05.000Z' }];
      },
    );

    expect(next?.ephemeralMessages?.[0]).toMatchObject({
      id: 'ephemeral-100-seed',
      content: 'queued',
      ephemeral: true,
      insertAfterCount: 3,
      timestamp: new Date('2026-01-01T00:00:05.000Z').getTime() + 1,
    });
  });

  test('simple state transforms preserve immutability', () => {
    const chat = {
      input: 'draft',
      attachments: ['file'],
      queuedMessages: ['queued'],
      inputHistory: [],
      hasUnread: false,
      ephemeralMessages: [{ role: 'assistant', content: 'hi' }],
    } as never;

    expect(clearInputState(chat)).toEqual(
      expect.objectContaining({
        input: '',
        attachments: [],
      }),
    );
    expect(clearQueueState(chat)).toEqual(
      expect.objectContaining({
        queuedMessages: [],
      }),
    );
    expect(clearEphemeralMessagesState(chat)).toEqual(
      expect.objectContaining({
        ephemeralMessages: [],
      }),
    );
    expect(assignConversationIdState(chat, 'conv-new')).toEqual(
      expect.objectContaining({
        conversationId: 'conv-new',
      }),
    );
    expect(
      removeQueuedMessageState({ ...chat, queuedMessages: ['a', 'b'] }, 0),
    ).toEqual(expect.objectContaining({ queuedMessages: ['b'] }));
  });
});
