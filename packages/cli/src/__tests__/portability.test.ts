import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('portability commands', () => {
  let home: string;
  let cwd: string;
  const extraDirs: string[] = [];
  const originalHome = process.env.STALLION_AI_DIR;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    home = mkdtempSync(join(tmpdir(), 'stallion-portability-home-'));
    cwd = mkdtempSync(join(tmpdir(), 'stallion-portability-cwd-'));
    process.env.STALLION_AI_DIR = home;
  });

  afterEach(() => {
    process.env.STALLION_AI_DIR = originalHome;
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
    for (const dir of extraDirs.splice(0, extraDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('export writes an AGENTS.md document with the Stallion machine block', async () => {
    mkdirSync(join(home, 'config'), { recursive: true });
    mkdirSync(join(home, 'agents', 'writer'), { recursive: true });
    mkdirSync(join(home, 'integrations', 'filesystem'), { recursive: true });

    writeFileSync(
      join(home, 'config', 'app.json'),
      JSON.stringify(
        {
          defaultModel: 'gpt-5.4',
          invokeModel: 'invoke-model',
          structureModel: 'structure-model',
          systemPrompt: 'Be helpful',
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(home, 'agents', 'writer', 'agent.json'),
      JSON.stringify(
        {
          name: 'Writer',
          prompt: 'Write clearly',
          tools: { mcpServers: ['filesystem'] },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(home, 'integrations', 'filesystem', 'integration.json'),
      JSON.stringify(
        {
          id: 'filesystem',
          kind: 'mcp',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { SECRET: 'redacted' },
        },
        null,
        2,
      ),
    );

    const { exportConfig } = await import('../commands/export.js');
    const output = exportConfig({
      format: 'agents-md',
      output: join(cwd, 'AGENTS.md'),
      projectHome: home,
    });

    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(output).toContain('<!-- STALLION:EXPORT:START -->');
    expect(output).toContain('## Workspace Guidance');
    expect(output).toContain('defaultModel');
  });

  test('import restores canonical config, writes notes, and appends import ledger', async () => {
    const agentsMdPath = join(cwd, 'AGENTS.md');
    writeFileSync(
      agentsMdPath,
      `# AGENTS.md

## Workspace Guidance

Imported prose that should become notes.

<!-- STALLION:EXPORT:START -->
\`\`\`json
${JSON.stringify(
  {
    kind: 'stallion-agents-md',
    version: 1,
    generatedAt: '2026-04-12T06:00:00.000Z',
    guidance: {
      workspace: {
        systemPrompt: 'Imported system prompt',
      },
      agents: [
        {
          slug: 'assistant',
          spec: { name: 'Assistant', prompt: 'Help users' },
        },
      ],
      integrations: [{ id: 'codex', transport: 'stdio', command: 'codex' }],
    },
    losses: [
      {
        code: 'degraded-field',
        scope: 'document',
        path: 'notes',
        message: 'Example warning',
        severity: 'warning',
      },
    ],
  },
  null,
  2,
)}
\`\`\`
<!-- STALLION:EXPORT:END -->
`,
      'utf-8',
    );

    const { importConfig } = await import('../commands/import.js');
    const result = importConfig(agentsMdPath, { projectHome: home });

    expect(
      JSON.parse(readFileSync(join(home, 'config', 'app.json'), 'utf-8'))
        .systemPrompt,
    ).toBe('Imported system prompt');
    expect(
      JSON.parse(
        readFileSync(join(home, 'agents', 'assistant', 'agent.json'), 'utf-8'),
      ).prompt,
    ).toBe('Help users');
    expect(
      JSON.parse(
        readFileSync(
          join(home, 'integrations', 'codex', 'integration.json'),
          'utf-8',
        ),
      ).command,
    ).toBe('codex');
    expect(result.notesPath).toBeDefined();
    expect(readFileSync(result.notesPath!, 'utf-8')).toContain(
      'Imported prose that should become notes.',
    );
    expect(
      JSON.parse(readFileSync(result.ledgerPath, 'utf-8')).sourceFormat,
    ).toBe('agents-md');
  });

  test('export -> import -> export preserves the structured Stallion document', async () => {
    const sourceHome = mkdtempSync(
      join(tmpdir(), 'stallion-portability-source-'),
    );
    const targetHome = mkdtempSync(
      join(tmpdir(), 'stallion-portability-target-'),
    );
    const exportedPath = join(cwd, 'AGENTS.md');
    extraDirs.push(sourceHome, targetHome);

    mkdirSync(join(sourceHome, 'config'), { recursive: true });
    mkdirSync(join(sourceHome, 'agents', 'assistant'), { recursive: true });
    mkdirSync(join(sourceHome, 'integrations', 'codex'), { recursive: true });

    writeFileSync(
      join(sourceHome, 'config', 'app.json'),
      JSON.stringify(
        {
          invokeModel: 'invoke-model',
          structureModel: 'structure-model',
          systemPrompt: 'Imported system prompt',
          approvalGuardian: { enabled: true, mode: 'review' },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(sourceHome, 'agents', 'assistant', 'agent.json'),
      JSON.stringify({ name: 'Assistant', prompt: 'Help users' }, null, 2),
    );
    writeFileSync(
      join(sourceHome, 'integrations', 'codex', 'integration.json'),
      JSON.stringify(
        {
          id: 'codex',
          kind: 'mcp',
          transport: 'stdio',
          command: 'codex',
        },
        null,
        2,
      ),
    );

    const { exportConfig } = await import('../commands/export.js');
    const { importConfig } = await import('../commands/import.js');

    const first = exportConfig({
      format: 'agents-md',
      output: exportedPath,
      projectHome: sourceHome,
    });
    importConfig(exportedPath, { projectHome: targetHome });
    const second = exportConfig({
      format: 'agents-md',
      projectHome: targetHome,
    });

    expect(second).toContain('Imported system prompt');
    expect(second).toContain('<!-- STALLION:EXPORT:START -->');

    const firstDocument = JSON.parse(
      first.match(/```json\s*([\s\S]*?)\s*```/)![1],
    );
    const secondDocument = JSON.parse(
      second.match(/```json\s*([\s\S]*?)\s*```/)![1],
    );

    expect(secondDocument.guidance).toEqual(firstDocument.guidance);
    expect(secondDocument.losses).toEqual([]);
  });

  test('exports and imports Claude Desktop MCP config', async () => {
    mkdirSync(join(home, 'integrations', 'github'), { recursive: true });
    writeFileSync(
      join(home, 'integrations', 'github', 'integration.json'),
      JSON.stringify(
        {
          id: 'github',
          kind: 'mcp',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
        null,
        2,
      ),
    );

    const { exportConfig } = await import('../commands/export.js');
    const { importConfig } = await import('../commands/import.js');
    const outputPath = join(cwd, 'claude_desktop_config.json');

    const exported = exportConfig({
      format: 'claude-desktop',
      output: outputPath,
      projectHome: home,
    });

    expect(JSON.parse(exported)).toEqual({
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      },
    });

    const targetHome = mkdtempSync(join(tmpdir(), 'stallion-claude-import-'));
    extraDirs.push(targetHome);
    const result = importConfig(outputPath, { projectHome: targetHome });

    expect(
      JSON.parse(
        readFileSync(
          join(targetHome, 'integrations', 'github', 'integration.json'),
          'utf-8',
        ),
      ),
    ).toMatchObject({
      id: 'github',
      kind: 'mcp',
      transport: 'stdio',
      command: 'npx',
    });
    expect(result.integrationCount).toBe(1);
  });

  test('records degraded transport fidelity when importing URL-based Claude Desktop MCP servers', async () => {
    const configPath = join(cwd, 'claude_desktop_config.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            linear: {
              url: 'https://mcp.example.com/linear',
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const { importConfig } = await import('../commands/import.js');
    const result = importConfig(configPath, { projectHome: home });
    const ledger = JSON.parse(readFileSync(result.ledgerPath, 'utf-8'));

    expect(
      JSON.parse(
        readFileSync(
          join(home, 'integrations', 'linear', 'integration.json'),
          'utf-8',
        ),
      ),
    ).toMatchObject({
      id: 'linear',
      kind: 'mcp',
      transport: 'streamable-http',
      endpoint: 'https://mcp.example.com/linear',
    });
    expect(ledger.degradedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'degraded-field',
          path: 'linear.transport',
        }),
      ]),
    );
  });
});
