import { describe, expect, test } from 'vitest';
import {
  createChildDelegationContext,
  DEFAULT_CHILD_BLOCKED_TOOLS,
  isDelegatedToolAllowed,
} from '../delegation.js';
import { wrapDelegationAwareTools } from '../mcp-manager.js';

describe('delegation helpers', () => {
  test('creates child delegation context with inherited root metadata', () => {
    const context = createChildDelegationContext({
      agentSlug: 'planner',
      conversationId: 'conv-parent',
      spec: {
        name: 'Planner',
        prompt: 'Plan well',
        delegation: {
          maxDepth: 3,
          allowedTools: ['github_*'],
          blockedTools: ['stallion-control_update_*'],
        },
      },
      current: {
        mode: 'isolated-child',
        depth: 1,
        maxDepth: 3,
        parentAgentSlug: 'root',
        rootAgentSlug: 'root',
        rootConversationId: 'conv-root',
      },
    });

    expect(context).toEqual({
      mode: 'isolated-child',
      depth: 2,
      maxDepth: 3,
      parentAgentSlug: 'planner',
      parentConversationId: 'conv-parent',
      rootAgentSlug: 'root',
      rootConversationId: 'conv-root',
      allowedTools: ['github_*'],
      blockedTools: [
        ...DEFAULT_CHILD_BLOCKED_TOOLS,
        'stallion-control_update_*',
      ],
      denyApprovals: true,
    });
  });

  test('rejects delegation once the max depth is reached', () => {
    expect(() =>
      createChildDelegationContext({
        agentSlug: 'planner',
        conversationId: 'conv-parent',
        spec: {
          name: 'Planner',
          prompt: 'Plan well',
          delegation: { maxDepth: 2 },
        },
        current: {
          mode: 'isolated-child',
          depth: 2,
          maxDepth: 2,
          parentAgentSlug: 'writer',
          rootAgentSlug: 'root',
        },
      }),
    ).toThrow(/Delegation depth limit reached/);
  });

  test('applies allowlists and blocklists to delegated child tools', () => {
    const toolNameMapping = new Map([
      [
        'github_repo_search',
        {
          original: 'github/repo_search',
          normalized: 'github_repo_search',
          server: 'github',
          tool: 'repo_search',
        },
      ],
    ]);

    const delegation = createChildDelegationContext({
      agentSlug: 'planner',
      conversationId: 'conv-parent',
      spec: {
        name: 'Planner',
        prompt: 'Plan well',
        delegation: { allowedTools: ['github/*'] },
      },
    });

    expect(
      isDelegatedToolAllowed({
        toolName: 'github_repo_search',
        delegation,
        toolNameMapping,
      }),
    ).toBe(true);
    expect(
      isDelegatedToolAllowed({
        toolName: 'stallion-control_send_message',
        delegation,
        toolNameMapping,
      }),
    ).toBe(false);
  });

  test('wraps stallion-control send_message with hidden child metadata', async () => {
    const execute = async (args: Record<string, unknown>) => args;
    const [wrapped] = wrapDelegationAwareTools(
      [
        {
          name: 'stallion-control_send_message',
          description: 'Send a message',
          parameters: {},
          execute,
        } as any,
      ],
      {
        agentSlug: 'planner',
        toolId: 'stallion-control',
        spec: {
          name: 'Planner',
          prompt: 'Plan well',
          delegation: { maxDepth: 2 },
        },
      },
    );

    const result = await wrapped.execute(
      { agent: 'writer', message: 'Draft this' },
      {
        conversationId: 'conv-parent',
        userId: 'user-1',
      },
    );

    expect(result).toMatchObject({
      agent: 'writer',
      message: 'Draft this',
      _userId: 'user-1',
      _delegation: {
        mode: 'isolated-child',
        depth: 1,
        parentAgentSlug: 'planner',
        parentConversationId: 'conv-parent',
        rootAgentSlug: 'planner',
        rootConversationId: 'conv-parent',
        maxDepth: 2,
      },
    });
  });

  test('wraps playbook creation tools with hidden agent provenance', async () => {
    const execute = async (args: Record<string, unknown>) => args;
    const [wrapped] = wrapDelegationAwareTools(
      [
        {
          name: 'stallion-control_create_playbook',
          description: 'Create a playbook',
          parameters: {},
          execute,
        } as any,
      ],
      {
        agentSlug: 'planner',
        toolId: 'stallion-control',
        spec: {
          name: 'Planner',
          prompt: 'Plan well',
        },
      },
    );

    const result = await wrapped.execute(
      { name: 'Research Plan', content: 'Draft the plan' },
      { conversationId: 'conv-parent' },
    );

    expect(result).toMatchObject({
      name: 'Research Plan',
      content: 'Draft the plan',
      _sourceContext: {
        kind: 'agent',
        agentSlug: 'planner',
        conversationId: 'conv-parent',
      },
    });
  });

  test('keeps the legacy prompt alias delegation-aware', async () => {
    const execute = async (args: Record<string, unknown>) => args;
    const [wrapped] = wrapDelegationAwareTools(
      [
        {
          name: 'stallion-control_create_prompt',
          description: 'Compatibility alias for playbook creation',
          parameters: {},
          execute,
        } as any,
      ],
      {
        agentSlug: 'planner',
        toolId: 'stallion-control',
        spec: {
          name: 'Planner',
          prompt: 'Plan well',
        },
      },
    );

    const result = await wrapped.execute(
      { name: 'Research Plan', content: 'Draft the plan' },
      { conversationId: 'conv-parent' },
    );

    expect(result).toMatchObject({
      name: 'Research Plan',
      content: 'Draft the plan',
      _sourceContext: {
        kind: 'agent',
        agentSlug: 'planner',
        conversationId: 'conv-parent',
      },
    });
  });
});
