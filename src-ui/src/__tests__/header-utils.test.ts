import { describe, expect, test } from 'vitest';
import {
  getHeaderBreadcrumb,
  getHelpPrompts,
} from '../components/header/utils';

describe('header utils', () => {
  test('returns generic help prompts when no view is provided', () => {
    expect(getHelpPrompts()).toEqual([
      {
        label: 'What can you do?',
        prompt: 'What can you help me with? List your capabilities.',
      },
      {
        label: 'System health check',
        prompt:
          'Run a system health check and tell me if anything needs attention.',
      },
    ]);
  });

  test('prepends contextual help prompts for matching views', () => {
    expect(getHelpPrompts({ type: 'connections-tools' })[0]).toEqual({
      label: 'Add an MCP server',
      prompt:
        'Help me add a new MCP tool server. What popular ones are available?',
    });
  });

  test('resolves breadcrumb details only for layout views', () => {
    expect(
      getHeaderBreadcrumb({
        type: 'layout',
        projectSlug: 'alpha',
        layoutSlug: 'coding',
      }),
    ).toEqual({
      projectSlug: 'alpha',
      layoutSlug: 'coding',
    });
    expect(getHeaderBreadcrumb({ type: 'project', slug: 'alpha' })).toBeNull();
    expect(getHeaderBreadcrumb({ type: 'agents' })).toBeNull();
  });
});
