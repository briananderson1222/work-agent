import { describe, expect, test, vi, beforeEach } from 'vitest';
import { BUILTIN_VOICE_TOOLS, createBuiltinToolExecutor } from '../voice-tools.js';

describe('BUILTIN_VOICE_TOOLS', () => {
  test('exports 2 builtin tool definitions', () => {
    expect(BUILTIN_VOICE_TOOLS).toHaveLength(2);
    expect(BUILTIN_VOICE_TOOLS.map(t => t.name)).toEqual(['navigate_to_view', 'send_to_chat']);
  });

  test('each tool has name, description, and inputSchema', () => {
    for (const tool of BUILTIN_VOICE_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect((tool.inputSchema as any).type).toBe('object');
    }
  });
});

describe('createBuiltinToolExecutor', () => {
  const apiBase = 'http://localhost:3141';
  let executor: ReturnType<typeof createBuiltinToolExecutor>;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
    executor = createBuiltinToolExecutor(apiBase);
  });

  test('navigate_to_view calls /api/ui and returns confirmation', async () => {
    const result = await executor('navigate_to_view', { path: '/layouts/my-layout' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ui'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toContain('/layouts/my-layout');
  });

  test('send_to_chat calls /api/agents/{agent}/chat', async () => {
    const result = await executor('send_to_chat', { message: 'hello', agent: 'dev' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agents/dev/chat'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toContain('dev');
  });

  test('send_to_chat defaults to "default" agent', async () => {
    await executor('send_to_chat', { message: 'hello' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agents/default/chat'),
      expect.any(Object),
    );
  });

  test('unknown tool returns error string', async () => {
    const result = await executor('nonexistent', {});
    expect(result).toContain('Unknown tool');
  });
});
