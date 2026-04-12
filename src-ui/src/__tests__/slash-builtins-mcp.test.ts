import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@stallion-ai/sdk', () => ({
  agentQueries: {
    tools: (slug: string) => ({ queryKey: ['agent-tools', slug] }),
    stats: (slug: string, conversationId: string) => ({
      queryKey: ['stats', slug, conversationId],
    }),
  },
}));

describe('default-agent slash commands', () => {
  beforeEach(async () => {
    vi.resetModules();
    await import('../slashCommands/builtins');
    await import('../slashCommands/tools');
  });

  function baseContext(overrides: Record<string, unknown> = {}) {
    return {
      sessionId: 's1',
      chatState: { agentSlug: 'default' },
      agent: { slug: 'default', name: 'Stallion', toolsConfig: {} },
      args: [],
      apiBase: 'http://localhost:3141',
      updateChat: vi.fn(),
      addEphemeralMessage: vi.fn(),
      queryClient: {
        fetchQuery: vi.fn(),
        getQueryData: vi.fn(() => []),
      } as any,
      sendMessage: vi.fn(),
      autocomplete: {
        openModel: vi.fn(),
        openNewChat: vi.fn(),
        closeCommand: vi.fn(),
        closeAll: vi.fn(),
      },
      ...overrides,
    } as any;
  }

  test('lists MCP servers from the agent tools query', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    const handler = getCommand('mcp');
    expect(handler).toBeDefined();

    const fetchQuery = vi.fn(async () => [
      { originalName: 'stallion-control_list_agents' },
      { originalName: 'github_search' },
      { originalName: 'stallion-control_get_project' },
    ]);
    const context = baseContext({
      addEphemeralMessage: vi.fn(),
      queryClient: { fetchQuery } as any,
    });

    await handler!(context);

    expect(fetchQuery).toHaveBeenCalledWith({
      queryKey: ['agent-tools', 'default'],
    });
    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('stallion-control'),
      }),
    );
    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        content: expect.stringContaining('github'),
      }),
    );
  });

  test('/tools renders an HTML summary grouped by MCP server', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    const handler = getCommand('tools');
    const context = baseContext({
      agent: {
        slug: 'default',
        name: 'Stallion',
        toolsConfig: { autoApprove: ['stallion-control_*'] },
      },
      chatState: {
        agentSlug: 'default',
        sessionAutoApprove: ['github_search'],
      },
      queryClient: {
        fetchQuery: vi.fn(async () => [
          {
            server: 'stallion-control',
            toolName: 'list_agents',
            originalName: 'stallion-control_list_agents',
            description: 'List all configured agents',
            parameters: { properties: {} },
          },
          {
            server: 'github',
            toolName: 'search',
            originalName: 'github_search',
            description: 'Search GitHub',
            parameters: { properties: { q: { type: 'string' } } },
          },
        ]),
      } as any,
    });

    await handler!(context);

    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        contentType: 'html',
        content: expect.stringContaining('stallion-control (1 tools)'),
      }),
    );
    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        content: expect.stringContaining('github (1 tools)'),
      }),
    );
  });

  test('/prompts lists available prompt commands', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    const handler = getCommand('prompts');
    const context = baseContext({
      queryClient: {
        fetchQuery: vi.fn(),
        getQueryData: vi
          .fn()
          .mockImplementation((key) =>
            JSON.stringify(key) === JSON.stringify(['playbooks'])
              ? [{ id: 'p1', name: 'Create Agent', description: 'Make one' }]
              : [],
          ),
      } as any,
    });

    await handler!(context);

    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        content: expect.stringContaining('/create-agent'),
      }),
    );
  });

  test('/clear and /new both clear the conversation with ephemeral confirmation', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    for (const cmd of ['clear', 'new']) {
      const handler = getCommand(cmd);
      const context = baseContext();

      await handler!(context);

      expect(context.updateChat).toHaveBeenCalledWith('s1', { messages: [] });
      expect(context.addEphemeralMessage).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ content: 'Conversation cleared' }),
      );
    }
  });

  test('/resume and /chat open the conversation picker', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    for (const cmd of ['resume', 'chat']) {
      const handler = getCommand(cmd);
      const context = baseContext();

      await handler!(context);

      expect(context.autocomplete.openNewChat).toHaveBeenCalled();
    }
  });

  test('/stats without a conversation id reports the problem ephemerally', async () => {
    const { getCommand } = await import('../slashCommands/registry');
    const handler = getCommand('stats');
    const context = baseContext({
      chatState: { agentSlug: 'default' },
    });

    await handler!(context);

    expect(context.addEphemeralMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ content: 'No conversation ID available.' }),
    );
  });
});
