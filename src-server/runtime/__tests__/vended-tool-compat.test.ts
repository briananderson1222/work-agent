import { describe, expect, test, vi } from 'vitest';
import { createBuiltinTool } from '../mcp-manager.js';
import { loadStrandsTools } from '../strands-tool-loader.js';
import {
  createBuiltinVendedToolDef,
  listBuiltinVendedRegistryItems,
} from '../vended-tool-compat.js';

describe('vended tool compatibility', () => {
  test('lists the shared Strands compatibility tools in the registry catalog', () => {
    expect(listBuiltinVendedRegistryItems().map((item) => item.id)).toEqual([
      'bash',
      'file-editor',
      'http-request',
      'notebook',
    ]);
  });

  test('VoltAgent built-in tool wrapper uses the shared notebook implementation', async () => {
    const toolDef = createBuiltinVendedToolDef('notebook');
    const tool = createBuiltinTool('agent-a', toolDef!, {
      warn: vi.fn(),
    } as any);

    expect(tool?.name).toBe('notebook');
    await expect(
      tool?.execute({ mode: 'create', name: 'plan', newStr: '# Plan' }),
    ).resolves.toContain('Created notebook');
    await expect(
      tool?.execute({ mode: 'read', name: 'plan' }),
    ).resolves.toContain('# Plan');
  });

  test('Strands loader pulls built-in tools through the shared implementation path', async () => {
    const toolDef = createBuiltinVendedToolDef('notebook');
    const tools = await loadStrandsTools({
      slug: 'agent-b',
      spec: {
        name: 'Agent B',
        prompt: 'Test',
        tools: { mcpServers: ['notebook'] },
      },
      opts: {
        configLoader: {
          loadIntegration: vi.fn().mockResolvedValue(toolDef),
        },
        mcpConnectionStatus: new Map(),
        integrationMetadata: new Map(),
        toolNameMapping: new Map(),
        toolNameReverseMapping: new Map(),
        logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
      } as any,
      state: {
        mcpClients: new Map(),
        agentMcpClients: new Map(),
      },
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('notebook');
    await expect(
      tools[0]?.execute({ mode: 'create', name: 'checklist', newStr: '- one' }),
    ).resolves.toContain('Created notebook');
    await expect(
      tools[0]?.execute({ mode: 'read', name: 'checklist' }),
    ).resolves.toContain('- one');
  });
});
