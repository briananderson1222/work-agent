import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createBuiltinTool } from '../mcp-manager.js';
import { loadStrandsTools } from '../strands-tool-loader.js';
import {
  createBuiltinVendedToolDef,
  listBuiltinVendedRegistryItems,
} from '../vended-tool-compat.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs
      .splice(0, cleanupDirs.length)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('vended tool compatibility', () => {
  test('lists the shared builtin tools in the registry catalog', () => {
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

  test('bash preserves shell session state across calls', async () => {
    const toolDef = createBuiltinVendedToolDef('bash');
    const tool = createBuiltinTool('agent-shell', toolDef!, {} as any);

    await expect(
      tool?.execute({ mode: 'execute', command: 'export TEST_VALUE=hello' }),
    ).resolves.toEqual(
      expect.objectContaining({
        output: '',
      }),
    );

    await expect(
      tool?.execute({ mode: 'execute', command: 'echo $TEST_VALUE' }),
    ).resolves.toEqual(
      expect.objectContaining({
        output: 'hello',
      }),
    );
  });

  test('file editor creates and updates files through the shared implementation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stallion-vended-file-editor-'));
    cleanupDirs.push(dir);
    const filePath = join(dir, 'notes.txt');
    const toolDef = createBuiltinVendedToolDef('file-editor');
    const tool = createBuiltinTool('agent-files', toolDef!, {} as any);

    await expect(
      tool?.execute({
        command: 'create',
        path: filePath,
        file_text: 'Hello\nWorld',
      }),
    ).resolves.toContain('File created successfully');

    await expect(
      tool?.execute({
        command: 'str_replace',
        path: filePath,
        old_str: 'World',
        new_str: 'Stallion',
      }),
    ).resolves.toContain('has been edited');

    await expect(readFile(filePath, 'utf-8')).resolves.toBe('Hello\nStallion');
  });

  test('http request executes real network calls through the shared implementation', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;

    try {
      const toolDef = createBuiltinVendedToolDef('http-request');
      const tool = createBuiltinTool('agent-http', toolDef!, {} as any);

      await expect(
        tool?.execute({
          method: 'GET',
          url: `http://127.0.0.1:${port}/health`,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 200,
          body: '{"ok":true}',
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
