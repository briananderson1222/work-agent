import { describe, expect, test } from 'vitest';
import { findMatchingPlaybookCommand } from '../utils/playbook-commands';

const playbooks = [
  {
    id: 'global',
    name: 'Research Plan',
    content: 'Global content',
    global: true,
    createdAt: '2026-04-11T00:00:00Z',
    updatedAt: '2026-04-11T00:00:00Z',
  },
  {
    id: 'agent-only',
    name: 'Coding Review',
    content: 'Agent content',
    agent: 'coder',
    createdAt: '2026-04-11T00:00:00Z',
    updatedAt: '2026-04-11T00:00:00Z',
  },
];

describe('playbook command matching', () => {
  test('matches global playbooks by slugified command name', () => {
    expect(
      findMatchingPlaybookCommand(playbooks as any, 'research-plan', null),
    ).toMatchObject({
      id: 'global',
      content: 'Global content',
    });
  });

  test('matches agent-scoped playbooks only for the selected agent', () => {
    expect(
      findMatchingPlaybookCommand(playbooks as any, 'coding-review', 'coder'),
    ).toMatchObject({
      id: 'agent-only',
    });
    expect(
      findMatchingPlaybookCommand(playbooks as any, 'coding-review', 'writer'),
    ).toBeUndefined();
  });

  test('prefers an agent-scoped playbook over a global playbook with the same slug', () => {
    const collisions = [
      {
        id: 'global-1',
        name: 'Deploy Plan',
        content: 'Global deploy content',
        global: true,
        createdAt: '2026-04-11T00:00:00Z',
        updatedAt: '2026-04-11T00:00:00Z',
      },
      {
        id: 'agent-1',
        name: 'Deploy Plan',
        content: 'Agent deploy content',
        agent: 'coder',
        createdAt: '2026-04-11T00:00:00Z',
        updatedAt: '2026-04-11T00:00:00Z',
      },
    ];

    expect(
      findMatchingPlaybookCommand(collisions as any, 'deploy-plan', 'coder'),
    ).toMatchObject({
      id: 'agent-1',
      content: 'Agent deploy content',
    });
  });
});
