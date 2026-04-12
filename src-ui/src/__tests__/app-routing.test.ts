import { describe, expect, test } from 'vitest';
import { getPathForView, resolveViewFromPath } from '../app-shell/routing';

describe('app-shell routing', () => {
  test('resolveViewFromPath maps agent, connection, and project routes', () => {
    expect(resolveViewFromPath('/agents/new')).toEqual({ type: 'agent-new' });
    expect(resolveViewFromPath('/connections/providers/demo')).toEqual({
      type: 'connections-provider-edit',
      id: 'demo',
    });
    expect(resolveViewFromPath('/projects/demo/layouts/coding')).toEqual({
      type: 'layout',
      projectSlug: 'demo',
      layoutSlug: 'coding',
    });
  });

  test('resolveViewFromPath falls back to last project state', () => {
    expect(
      resolveViewFromPath('/', {
        lastProject: 'alpha',
        lastProjectLayout: 'coding',
      }),
    ).toEqual({
      type: 'layout',
      projectSlug: 'alpha',
      layoutSlug: 'coding',
    });
    expect(
      resolveViewFromPath('/', {
        lastProject: 'alpha',
      }),
    ).toEqual({
      type: 'project',
      slug: 'alpha',
    });
  });

  test('getPathForView serializes navigable views', () => {
    expect(getPathForView({ type: 'agents' })).toBe('/agents');
    expect(getPathForView({ type: 'agent-tools', slug: 'planner' })).toBe(
      '/agents/planner/tools',
    );
    expect(
      getPathForView({
        type: 'layout',
        projectSlug: 'alpha',
        layoutSlug: 'coding',
      }),
    ).toBe('/projects/alpha/layouts/coding');
  });
});
