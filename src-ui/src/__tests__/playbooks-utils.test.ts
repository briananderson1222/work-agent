import type { Playbook } from '@stallion-ai/contracts/catalog';
import { describe, expect, test } from 'vitest';
import {
  buildPlaybookExportMarkdown,
  buildPlaybookFilename,
  buildPlaybookPayload,
  extractTemplateVariables,
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
        description: '',
        category: '',
        tags: ' alpha, beta , , gamma ',
        agent: '',
        global: false,
      }),
    ).toEqual({
      name: 'Research assistant',
      content: 'Draft the plan',
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
        description: 'Generate a research plan',
        category: 'analysis',
        content: 'Draft the plan',
      }),
    ).toBe(
      '---\nname: "Research assistant"\ndescription: "Generate a research plan"\ncategory: "analysis"\n---\n\nDraft the plan',
    );
  });

  test('buildPlaybookFilename normalizes the downloaded file name', () => {
    expect(buildPlaybookFilename('Copy of Research / Plan?')).toBe(
      'Copy-of-Research---Plan-.md',
    );
  });
});
