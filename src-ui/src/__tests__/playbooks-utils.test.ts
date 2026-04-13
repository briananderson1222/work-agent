import type { Playbook } from '@stallion-ai/contracts/catalog';
import { describe, expect, test } from 'vitest';
import {
  buildPlaybookExportMarkdown,
  buildPlaybookFilename,
  buildPlaybookPayload,
  extractTemplateVariables,
  formatPlaybookProvenanceSummary,
  formatPlaybookStatsSummary,
  playbookToForm,
} from '../views/playbooks/utils';

describe('playbooks utils', () => {
  test('playbookToForm maps playbook fields to editable form state', () => {
    const playbook = {
      id: 'pb-1',
      name: 'Research assistant',
      content: 'Draft the plan',
      description: 'Generate a research plan',
      category: 'analysis',
      tags: ['research', 'planning'],
      agent: 'planner',
      global: true,
      createdAt: '2026-04-11T10:00:00Z',
      updatedAt: '2026-04-11T11:00:00Z',
    } as Playbook;

    expect(playbookToForm(playbook)).toEqual({
      name: 'Research assistant',
      content: 'Draft the plan',
      storageMode: 'json-inline',
      description: 'Generate a research plan',
      category: 'analysis',
      tags: 'research, planning',
      agent: 'planner',
      global: true,
    });
  });

  test('buildPlaybookPayload trims tags and omits empty optional fields', () => {
    expect(
      buildPlaybookPayload({
        name: 'Research assistant',
        content: 'Draft the plan',
        storageMode: 'markdown-file',
        description: '',
        category: '',
        tags: ' alpha, beta , , gamma ',
        agent: '',
        global: false,
      }),
    ).toEqual({
      name: 'Research assistant',
      content: 'Draft the plan',
      storageMode: 'markdown-file',
      tags: ['alpha', 'beta', 'gamma'],
    });
  });

  test('extractTemplateVariables deduplicates template placeholders in order', () => {
    expect(
      extractTemplateVariables(
        'Use {{topic}} for {{scope}} and repeat {{topic}} before {{scope-type}}.',
      ),
    ).toEqual(['topic', 'scope', 'scope-type']);
  });

  test('buildPlaybookExportMarkdown writes frontmatter followed by content', () => {
    expect(
      buildPlaybookExportMarkdown({
        name: 'Research assistant',
        storageMode: 'markdown-file',
        description: 'Generate a research plan',
        category: 'analysis',
        tags: 'research, planning',
        agent: 'planner',
        global: true,
        content: 'Draft the plan',
      }),
    ).toBe(
      '---\nname: "Research assistant"\ndescription: "Generate a research plan"\ncategory: "analysis"\ntags:\n  - research\n  - planning\nagent: "planner"\nglobal: true\nassetType: playbook\nruntimeMode: slash-command\n---\n\nDraft the plan',
    );
  });

  test('buildPlaybookFilename normalizes the downloaded file name', () => {
    expect(buildPlaybookFilename('Copy of Research / Plan?')).toBe(
      'Copy-of-Research---Plan-.md',
    );
  });

  test('formatPlaybookStatsSummary includes runs and quality score when present', () => {
    expect(
      formatPlaybookStatsSummary({
        id: 'pb-1',
        name: 'Research assistant',
        content: 'Draft the plan',
        stats: {
          runs: 3,
          successes: 2,
          failures: 1,
          qualityScore: 67,
        },
        createdAt: '2026-04-11T10:00:00Z',
        updatedAt: '2026-04-11T11:00:00Z',
      } as Playbook),
    ).toBe('3 runs · 67% success');
  });

  test('formatPlaybookProvenanceSummary describes the last authoring source', () => {
    expect(
      formatPlaybookProvenanceSummary({
        id: 'pb-1',
        name: 'Research assistant',
        content: 'Draft the plan',
        provenance: {
          updatedFrom: {
            kind: 'agent',
            agentSlug: 'planner',
          },
        },
        createdAt: '2026-04-11T10:00:00Z',
        updatedAt: '2026-04-11T11:00:00Z',
      } as Playbook),
    ).toBe('refined by planner');
  });
});
