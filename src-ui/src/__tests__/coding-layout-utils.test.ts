import { describe, expect, test } from 'vitest';
import type { ACPConnectionInfo } from '../hooks/useACPConnections';
import { buildNewTerminalItems } from '../components/coding-layout/utils';

const connections: ACPConnectionInfo[] = [
  {
    id: 'kiro',
    name: 'Kiro',
    enabled: true,
    status: 'available',
    modes: ['dev', 'review'],
    sessionId: null,
    mcpServers: [],
    currentModel: null,
  },
  {
    id: 'claude',
    name: 'Claude',
    enabled: true,
    status: 'offline',
    modes: ['planner'],
    sessionId: null,
    mcpServers: [],
    currentModel: null,
  },
];

describe('coding-layout utils', () => {
  test('buildNewTerminalItems includes shell and recent agents first', () => {
    expect(
      buildNewTerminalItems(connections, '', ['kiro-review', 'kiro-dev']),
    ).toEqual([
      {
        key: 'shell',
        type: 'shell',
        label: 'Shell',
        hint: 'Default terminal',
      },
      {
        key: 'recent-kiro-dev',
        type: 'agent',
        label: 'dev',
        hint: 'Kiro · Recent',
        slug: 'kiro-dev',
        connectionId: 'kiro',
        section: 'recent',
      },
      {
        key: 'recent-kiro-review',
        type: 'agent',
        label: 'review',
        hint: 'Kiro · Recent',
        slug: 'kiro-review',
        connectionId: 'kiro',
        section: 'recent',
      },
    ]);
  });

  test('buildNewTerminalItems filters by agent label and hides shell when unmatched', () => {
    expect(buildNewTerminalItems(connections, 'rev', [])).toEqual([
      {
        key: 'kiro-review',
        type: 'agent',
        label: 'review',
        hint: 'Kiro',
        slug: 'kiro-review',
        connectionId: 'kiro',
      },
    ]);
  });
});
