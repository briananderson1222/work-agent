import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { AgentSummary } from '../types';
import {
  buildAgentsViewEmptyContent,
  buildAgentsViewItems,
} from '../views/agent-editor/agentsViewHelpers';

describe('agents view helpers', () => {
  test('buildAgentsViewItems preserves standalone, layout, and ACP ordering', () => {
    const agents = [
      {
        slug: 'alpha',
        name: 'Alpha',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        slug: 'workspace:beta',
        name: 'Beta',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        slug: 'acp-agent',
        name: 'ACP Agent',
        updatedAt: '2026-01-01T00:00:00Z',
        source: 'acp',
      },
    ] satisfies AgentSummary[];

    const items = buildAgentsViewItems(agents, [
      {
        id: 'conn-1',
        name: 'ACP One',
        icon: '/acp.svg',
        modes: [{}, {}, {}],
      },
    ]);

    expect(items.map((item) => item.id)).toEqual([
      'alpha',
      'workspace:beta',
      '__acp:conn-1',
    ]);
    expect(items[0].name).toBe('Alpha');
    expect(isValidElement(items[0].icon)).toBe(true);
    expect(isValidElement(items[2].icon)).toBe(true);
    expect(items[2].subtitle).toBe('3 agents · ACP');
  });

  test('buildAgentsViewEmptyContent renders onboarding and empty-state copy', () => {
    const onboarding = renderToStaticMarkup(
      buildAgentsViewEmptyContent({
        agentsCount: 0,
        templates: [
          {
            id: 'template-1',
            icon: '✨',
            label: 'Template One',
            description: 'Template description',
            source: 'custom',
            form: { name: 'Template One' },
          },
        ],
        onCreateFromTemplate: () => {},
        onCreateBlank: () => {},
      }),
    );

    expect(onboarding).toContain('Get started');
    expect(onboarding).toContain('Create your first agent from a template');
    expect(onboarding).toContain('Template One');
    expect(onboarding).toContain('Template description');
    expect(onboarding).toContain('custom');

    const emptyState = renderToStaticMarkup(
      buildAgentsViewEmptyContent({
        agentsCount: 2,
        templates: [],
        onCreateFromTemplate: () => {},
        onCreateBlank: () => {},
      }),
    );

    expect(emptyState).toContain('No agent selected');
    expect(emptyState).toContain('Create new agent');
  });
});
