import { describe, expect, test } from 'vitest';
import {
  buildProjectForm,
  getKnowledgeTimeAgo,
} from '../views/project-settings/utils';

describe('project-settings utils', () => {
  test('buildProjectForm normalizes optional project fields', () => {
    expect(
      buildProjectForm({
        name: 'Demo',
        icon: undefined,
        description: undefined,
        defaultModel: undefined,
        workingDirectory: undefined,
        agents: undefined,
      } as any),
    ).toEqual({
      name: 'Demo',
      icon: '',
      description: '',
      defaultModel: '',
      workingDirectory: '',
      agents: [],
    });
  });

  test('getKnowledgeTimeAgo formats recent durations', () => {
    const now = new Date('2026-01-01T12:00:00.000Z').getTime();
    expect(getKnowledgeTimeAgo('2026-01-01T11:59:30.000Z', now)).toBe(
      'just now',
    );
    expect(getKnowledgeTimeAgo('2026-01-01T11:00:00.000Z', now)).toBe('1h ago');
  });
});
