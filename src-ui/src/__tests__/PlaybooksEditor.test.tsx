/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../hooks/useAIEnrich', () => ({
  useAIEnrich: () => ({
    enrich: vi.fn(),
    isEnriching: false,
  }),
}));

import { PlaybooksEditor } from '../views/playbooks/PlaybooksEditor';

describe('PlaybooksEditor', () => {
  test('renders playbook quality and provenance summaries', () => {
    render(
      <PlaybooksEditor
        agents={[{ slug: 'planner', name: 'Planner' }]}
        categories={['analysis']}
        dirty={false}
        form={{
          name: 'Research assistant',
          content: 'Draft the plan',
          storageMode: 'json-inline',
          description: '',
          category: 'analysis',
          tags: '',
          agent: '',
          global: false,
        }}
        isNew={false}
        selectedId="pb-1"
        selectedPrompt={{
          id: 'pb-1',
          name: 'Research assistant',
          content: 'Draft the plan',
          provenance: {
            updatedFrom: { kind: 'agent', agentSlug: 'planner' },
          },
          stats: {
            runs: 4,
            successes: 3,
            failures: 1,
            qualityScore: 75,
          },
          createdAt: '2026-04-11T10:00:00Z',
          updatedAt: '2026-04-11T11:00:00Z',
        }}
        savePending={false}
        advancedOpen={false}
        touched={{}}
        onAdvancedOpenChange={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onExport={vi.fn()}
        onFieldBlur={vi.fn()}
        onFieldChange={vi.fn()}
        onGlobalChange={vi.fn()}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onPackageAsSkill={vi.fn()}
        onGenerateContent={vi.fn()}
        onGenerateDescription={vi.fn()}
      />,
    );

    expect(screen.getByText('4 runs · 75% success')).toBeTruthy();
    expect(screen.getByText('refined by planner')).toBeTruthy();
  });
});
