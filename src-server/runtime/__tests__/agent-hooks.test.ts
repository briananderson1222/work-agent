import { describe, expect, test, vi } from 'vitest';
import { createAgentHooks } from '../agent-hooks.js';

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    spec: {
      name: 'Planner',
      prompt: 'Plan carefully',
      tools: { autoApprove: ['github_*'] },
    },
    appConfig: {},
    configLoader: {
      loadAgent: vi.fn(),
    },
    agentFixedTokens: new Map(),
    memoryAdapters: new Map(),
    approvalRegistry: {} as any,
    approvalGuardian: undefined,
    toolNameMapping: new Map(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  } as any;
}

describe('createAgentHooks', () => {
  test('blocks tools that are disallowed for delegated child sessions', async () => {
    const hooks = createAgentHooks(createDeps());

    const approved = await hooks.beforeToolCall!(
      {
        toolName: 'stallion-control_send_message',
        toolCallId: 'tool-1',
        toolArgs: {},
      },
      {
        agentSlug: 'planner',
        conversationId: 'conv-1',
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'root',
          rootAgentSlug: 'root',
          blockedTools: ['stallion-control_send_message'],
        },
      },
    );

    expect(approved).toBe(false);
  });

  test('denies approval-bound tools inside delegated child sessions', async () => {
    const hooks = createAgentHooks(createDeps());
    hooks.requestApproval = vi.fn().mockResolvedValue(true);

    const approved = await hooks.beforeToolCall!(
      {
        toolName: 'filesystem_write',
        toolCallId: 'tool-1',
        toolArgs: {},
      },
      {
        agentSlug: 'planner',
        conversationId: 'conv-1',
        delegation: {
          mode: 'isolated-child',
          depth: 1,
          maxDepth: 2,
          parentAgentSlug: 'root',
          rootAgentSlug: 'root',
          denyApprovals: true,
        },
      },
    );

    expect(approved).toBe(false);
    expect(hooks.requestApproval).not.toHaveBeenCalled();
  });

  test('allows tool execution when the guardian approves it', async () => {
    const hooks = createAgentHooks(
      createDeps({
        approvalGuardian: {
          isEnabled: () => true,
          getMode: () => 'review',
          reviewToolCall: vi.fn().mockResolvedValue({
            decision: 'allow',
            reason: 'Safe and scoped.',
          }),
        },
      }),
    );
    hooks.requestApproval = vi.fn().mockResolvedValue(false);

    const approved = await hooks.beforeToolCall!(
      {
        toolName: 'filesystem_write',
        toolCallId: 'tool-1',
        toolArgs: { path: 'notes.md' },
      },
      {
        agentSlug: 'planner',
        conversationId: 'conv-1',
      },
    );

    expect(approved).toBe(true);
    expect(hooks.requestApproval).not.toHaveBeenCalled();
  });

  test('denies tool execution when the guardian blocks in enforce mode', async () => {
    const hooks = createAgentHooks(
      createDeps({
        approvalGuardian: {
          isEnabled: () => true,
          getMode: () => 'enforce',
          reviewToolCall: vi.fn().mockResolvedValue({
            decision: 'deny',
            reason: 'Too destructive.',
          }),
        },
      }),
    );
    hooks.requestApproval = vi.fn().mockResolvedValue(true);

    const approved = await hooks.beforeToolCall!(
      {
        toolName: 'filesystem_write',
        toolCallId: 'tool-1',
        toolArgs: { path: '/etc/passwd' },
      },
      {
        agentSlug: 'planner',
        conversationId: 'conv-1',
      },
    );

    expect(approved).toBe(false);
    expect(hooks.requestApproval).not.toHaveBeenCalled();
  });

  test('falls back to human approval when the guardian defers', async () => {
    const hooks = createAgentHooks(
      createDeps({
        approvalGuardian: {
          isEnabled: () => true,
          getMode: () => 'review',
          reviewToolCall: vi.fn().mockResolvedValue({
            decision: 'defer',
            reason: 'Unclear.',
          }),
        },
      }),
    );
    hooks.requestApproval = vi.fn().mockResolvedValue(true);

    const approved = await hooks.beforeToolCall!(
      {
        toolName: 'filesystem_write',
        toolCallId: 'tool-1',
        toolArgs: { path: 'notes.md' },
      },
      {
        agentSlug: 'planner',
        conversationId: 'conv-1',
      },
    );

    expect(approved).toBe(true);
    expect(hooks.requestApproval).toHaveBeenCalledOnce();
  });
});
