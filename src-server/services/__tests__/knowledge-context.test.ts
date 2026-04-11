import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeInjectContext,
  buildKnowledgeRagContext,
} from '../knowledge-context.js';
import { saveKnowledgeMeta } from '../knowledge-storage.js';

describe('knowledge-context helpers', () => {
  test('buildKnowledgeRagContext formats only results above threshold', () => {
    const context = buildKnowledgeRagContext(
      [
        {
          score: 0.81,
          text: 'Useful chunk',
          metadata: { filename: 'guide.md' },
        },
        {
          score: 0.12,
          text: 'Low value chunk',
          metadata: { filename: 'ignored.md' },
        },
      ],
      0.25,
    );

    expect(context).toContain('<project_knowledge>');
    expect(context).toContain('Useful chunk');
    expect(context).not.toContain('Low value chunk');
    expect(context).toContain('guide.md');
  });

  test('buildKnowledgeInjectContext reconstructs document text grouped by namespace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-context-'));
    saveKnowledgeMeta(join(dir, 'rules'), [
      {
        id: 'doc-1',
        filename: 'rules.md',
        namespace: 'rules',
        path: 'rules.md',
        source: 'upload',
        chunkCount: 2,
        createdAt: new Date().toISOString(),
      },
    ]);

    const context = await buildKnowledgeInjectContext({
      projectSlug: 'test',
      namespaces: [{ id: 'rules', label: 'Rules', behavior: 'inject' }],
      dataDir: dir,
      resolveStorageDir: () => join(dir, 'rules'),
      vectorDb: {
        namespaceExists: async () => true,
        search: async () => [
          {
            text: 'Second chunk',
            metadata: {
              docId: 'doc-1',
              chunkIndex: 1,
              filename: 'rules.md',
            },
          },
          {
            text: 'First chunk',
            metadata: {
              docId: 'doc-1',
              chunkIndex: 0,
              filename: 'rules.md',
            },
          },
        ],
      },
      embeddingProvider: {
        embed: async () => [[0, 0, 0]],
      },
    });

    expect(context).toContain('<project_rules>');
    expect(context).toContain('<rules_rules>');
    expect(context).toContain('First chunk\n\nSecond chunk');

    rmSync(dir, { recursive: true, force: true });
  });
});
