import { describe, expect, test } from 'vitest';
import { getPathForView, resolveViewFromPath } from '../app-shell/routing';

describe('app-shell routing', () => {
  test('resolveViewFromPath maps agent, connection, and project routes', () => {
    expect(resolveViewFromPath('/agents/new')).toEqual({ type: 'agent-new' });
    expect(resolveViewFromPath('/skills')).toEqual({ type: 'skills' });
    expect(resolveViewFromPath('/connections/providers/demo')).toEqual({
      type: 'connections-provider-edit',
      id: 'demo',
    });
    expect(resolveViewFromPath('/connections/runtimes')).toEqual({
      type: 'connections-runtimes',
    });
    expect(resolveViewFromPath('/connections/acp')).toEqual({
      type: 'connections-acp',
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
    expect(getPathForView({ type: 'connections-runtimes' })).toBe(
      '/connections/runtimes',
    );
    expect(getPathForView({ type: 'connections-acp' })).toBe(
      '/connections/acp',
    );
  });
});
