/**
 * Slash command routing — unit tests.
 *
 * Tests the registry functions and the routing logic that lives inside
 * useSlashCommandHandler. Rather than rendering the React hook (which
 * requires heavy context mocking), we test the routing logic directly
 * using the slash command registry functions that the hook delegates to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import registry functions directly to test routing contracts
// We re-import fresh each test to avoid state bleeding from builtins
async function getRegistry() {
  vi.resetModules();
  return import('../slashCommands/registry');
}

// ── Routing logic extracted from useSlashCommandHandler ───────────────────────

/**
 * Simulates the core routing logic of useSlashCommandHandler without React.
 * This lets us test the command dispatch contracts in a pure Node environment.
 */
async function routeCommand(
  command: string,
  options: {
    agentSource?: 'acp' | 'local';
    customCommands?: Record<string, { prompt: string; params?: Array<{ name: string; default?: string }> }>;
    agents?: any[];
    agentSlug?: string;
  } = {},
): Promise<string | boolean | false> {
  const { getCommand, getAllCommands } = await getRegistry();

  const parts = command.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);

  const agent = options.agentSlug
    ? {
        slug: options.agentSlug,
        source: options.agentSource ?? 'local',
        commands: options.customCommands ?? {},
      }
    : undefined;

  // Fake context state
  const addEphemeralMessage = vi.fn();
  const updateChat = vi.fn();
  const cleanup = () => {};

  // ACP agents: pass all slash commands through as prompt text
  if (agent?.source === 'acp') {
    cleanup();
    return command;
  }

  // 1. Check custom commands
  if (agent?.commands?.[cmd]) {
    let expandedPrompt = agent.commands[cmd].prompt;
    const params = agent.commands[cmd].params || [];
    params.forEach((param: any, idx: number) => {
      const value = args[idx] || param.default || '';
      expandedPrompt = expandedPrompt.replace(
        new RegExp(`{{${param.name}}}`, 'g'),
        value,
      );
    });
    cleanup();
    return expandedPrompt;
  }

  // 2. Check registered commands
  const handler = getCommand(cmd);
  if (handler) {
    cleanup();
    // Don't actually call handler (needs queryClient, etc.)
    return true;
  }

  // 3. Unknown command
  addEphemeralMessage('sess', {
    role: 'system',
    content: `Unknown command: ${command}\n\nAvailable:\n${getAllCommands().map((c: string) => `• /${c}`).join('\n')}`,
  });
  cleanup();
  return true;
}

describe('slash command routing', () => {
  it('non-command input (no leading /) — treated as unresolved', async () => {
    // The hook returns false when chatState is missing. We simulate here.
    // A plain string without '/' is not a command.
    const { getCommand } = await getRegistry();
    const result = getCommand('hello'); // no '/' = not a registered command
    expect(result).toBeUndefined();
  });

  it('ACP agent — command passthrough → returns command text as-is', async () => {
    const result = await routeCommand('/model gpt-4', {
      agentSource: 'acp',
      agentSlug: 'kiro',
    });
    expect(result).toBe('/model gpt-4');
  });

  it('custom agent command → expands {{param}} placeholder', async () => {
    const result = await routeCommand('/greet Alice', {
      agentSlug: 'my-agent',
      customCommands: {
        greet: {
          prompt: 'Hello {{name}}!',
          params: [{ name: 'name' }],
        },
      },
    });
    expect(result).toBe('Hello Alice!');
  });

  it('custom command with default param → uses default when arg missing', async () => {
    const result = await routeCommand('/greet', {
      agentSlug: 'my-agent',
      customCommands: {
        greet: {
          prompt: 'Hello {{name}}!',
          params: [{ name: 'name', default: 'World' }],
        },
      },
    });
    expect(result).toBe('Hello World!');
  });

  it('custom command with multiple params → all placeholders expanded', async () => {
    const result = await routeCommand('/send Bob Hello there', {
      agentSlug: 'my-agent',
      customCommands: {
        send: {
          prompt: 'Message from {{sender}} to {{recipient}}: {{text}}',
          params: [{ name: 'sender', default: 'me' }, { name: 'recipient' }, { name: 'text', default: '...' }],
        },
      },
    });
    // /send Bob Hello there → sender=Bob, recipient=Hello, text=there
    expect(result).toBe('Message from Bob to Hello: there');
  });

  it('registered handler found → returns true', async () => {
    const { registerCommand, getCommand } = await getRegistry();
    registerCommand('test-cmd', vi.fn());

    const result = await routeCommand('/test-cmd', {});
    expect(result).toBe(true);
  });

  it('unknown command → still returns true (ephemeral error shown)', async () => {
    const result = await routeCommand('/definitely-not-a-command', {});
    expect(result).toBe(true);
  });

  it('command with trailing whitespace → trimmed correctly', async () => {
    const result = await routeCommand('/greet  Alice  ', {
      agentSlug: 'my-agent',
      customCommands: {
        greet: {
          prompt: 'Hello {{name}}!',
          params: [{ name: 'name' }],
        },
      },
    });
    expect(result).toBe('Hello Alice!');
  });

  // ── Registry functions ────────────────────────────────────────────────────

  it('getAllCommands returns registered command names', async () => {
    const { registerCommand, getAllCommands } = await getRegistry();
    registerCommand('foo', vi.fn());
    registerCommand('bar', vi.fn());

    const cmds = getAllCommands();
    expect(cmds).toContain('foo');
    expect(cmds).toContain('bar');
  });

  it('getCommand returns undefined for unregistered command', async () => {
    const { getCommand } = await getRegistry();
    expect(getCommand('nonexistent')).toBeUndefined();
  });

  it('getCommand returns handler for registered command', async () => {
    const { registerCommand, getCommand } = await getRegistry();
    const handler = vi.fn();
    registerCommand('mytest', handler);

    expect(getCommand('mytest')).toBe(handler);
  });

  it('ACP agent with complex command → returns entire command string', async () => {
    const cmd = '/search "hello world" --limit=10';
    const result = await routeCommand(cmd, {
      agentSource: 'acp',
      agentSlug: 'acp-agent',
    });
    expect(result).toBe(cmd);
  });
});
