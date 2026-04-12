import { describe, expect, test } from 'vitest';
import {
  buildAgentsMdDocument,
  buildAgentsMdImportPlan,
  parseAgentsMd,
  serializeAgentsMd,
} from '../portability.js';
import type { AgentSpec, AppConfig, ToolDef } from '../types.js';

describe('portability helpers', () => {
  test('serializes and parses a Stallion AGENTS export block', () => {
    const appConfig: AppConfig = {
      systemPrompt: 'Be helpful',
      approvalGuardian: { enabled: true, mode: 'review' },
      defaultModel: 'gpt-5.4',
    };
    const agent: AgentSpec = {
      name: 'Writer',
      prompt: 'Write clearly',
      tools: { mcpServers: ['filesystem'] },
    };
    const integration: ToolDef = {
      id: 'filesystem',
      kind: 'mcp',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    };

    const document = buildAgentsMdDocument({
      appConfig,
      agents: [{ slug: 'writer', spec: agent }],
      integrations: [integration],
      generatedAt: '2026-04-12T06:00:00.000Z',
    });

    expect(document.losses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'omitted-field',
          path: 'defaultModel',
        }),
      ]),
    );

    const markdown = serializeAgentsMd(document);
    const parsed = parseAgentsMd(markdown);

    expect(parsed.document.guidance.workspace.systemPrompt).toBe('Be helpful');
    expect(parsed.document.guidance.agents[0]?.slug).toBe('writer');
    expect(parsed.document.guidance.integrations[0]?.id).toBe('filesystem');
    expect(parsed.unmatchedProse).toBeNull();
    expect(parsed.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ambiguous-prose' }),
      ]),
    );
  });

  test('builds an import plan that denormalizes integrations and keeps degraded warnings', () => {
    const markdown = `# AGENTS.md

${'<!-- STALLION:EXPORT:START -->'}
\`\`\`json
${JSON.stringify(
  {
    kind: 'stallion-agents-md',
    version: 1,
    generatedAt: '2026-04-12T06:00:00.000Z',
    guidance: {
      workspace: { systemPrompt: 'Imported prompt' },
      agents: [
        { slug: 'assistant', spec: { name: 'Assistant', prompt: 'Hi' } },
      ],
      integrations: [
        {
          id: 'codex',
          transport: 'stdio',
          command: 'codex',
        },
      ],
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
${'<!-- STALLION:EXPORT:END -->'}
`;

    const parsed = parseAgentsMd(markdown);
    const plan = buildAgentsMdImportPlan({
      sourcePath: '/tmp/AGENTS.md',
      parsed,
      importedAt: '2026-04-12T06:10:00.000Z',
      notesPath: '/tmp/import-note.md',
    });

    expect(plan.appConfig.systemPrompt).toBe('Imported prompt');
    expect(plan.agents[0]?.slug).toBe('assistant');
    expect(plan.integrations[0]).toEqual(
      expect.objectContaining({
        id: 'codex',
        kind: 'mcp',
        transport: 'stdio',
        command: 'codex',
      }),
    );
    expect(plan.ledgerEntry.degradedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'degraded-field' }),
      ]),
    );
    expect(plan.ledgerEntry.notesPath).toBe('/tmp/import-note.md');
  });
});
