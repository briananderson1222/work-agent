import { describe, expect, test } from 'vitest';
import {
  buildContextOptions,
  buildNewChatModalViewModel,
  filterContextOptions,
  getRecentAgentSlugsForContext,
  GLOBAL_CONTEXT,
} from '../components/new-chat-modal-utils';

describe('new-chat-modal-utils', () => {
  test('buildContextOptions prepends global and preserves project metadata', () => {
    expect(
      buildContextOptions([
        {
          slug: 'project-a',
          name: 'Project A',
          icon: '🧪',
          workingDirectory: '/work/a',
        } as any,
      ]),
    ).toEqual([
      { value: GLOBAL_CONTEXT, label: 'Global', icon: '🌐' },
      {
        value: 'project-a',
        label: 'Project A',
        icon: '🧪',
        workingDirectory: '/work/a',
      },
    ]);
  });

  test('filterContextOptions matches labels case-insensitively', () => {
    const options = buildContextOptions([
      { slug: 'project-a', name: 'Alpha Project' } as any,
      { slug: 'project-b', name: 'Beta Project' } as any,
    ]);

    expect(filterContextOptions(options, '')).toBe(options);
    expect(filterContextOptions(options, 'beta').map((o) => o.value)).toEqual([
      'project-b',
    ]);
  });

  test('getRecentAgentSlugsForContext prefers active chats before stored history', () => {
    expect(
      getRecentAgentSlugsForContext(
        {
          s1: {
            agentSlug: 'alpha',
            messages: [{}],
            projectSlug: undefined,
            lastActivity: 3000,
          },
          s2: {
            agentSlug: 'beta',
            messages: [{}],
            projectSlug: 'project-a',
            lastActivity: 2000,
          },
          s3: {
            agentSlug: 'gamma',
            messages: [{}],
            projectSlug: 'project-a',
            lastActivity: 1000,
          },
        },
        'project-a',
        ['delta', 'beta', 'epsilon', 'zeta'],
      ),
    ).toEqual(['beta', 'gamma', 'delta', 'epsilon', 'zeta']);

    expect(
      getRecentAgentSlugsForContext(
        {
          s1: {
            agentSlug: 'alpha',
            messages: [{}],
            projectSlug: undefined,
            lastActivity: 3000,
          },
          s2: {
            agentSlug: 'beta',
            messages: [{}],
            projectSlug: 'project-a',
            lastActivity: 2000,
          },
        },
        GLOBAL_CONTEXT,
        ['stored-a'],
      ),
    ).toEqual(['alpha', 'stored-a']);
  });

  test('buildNewChatModalViewModel groups runtime, layout, ACP, and global agents', () => {
    const viewModel = buildNewChatModalViewModel({
      agents: [
        {
          slug: 'alpha',
          name: 'Alpha',
          source: 'local',
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
        {
          slug: 'layout:beta',
          name: 'Beta',
          source: 'local',
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
        {
          slug: 'acp:gamma',
          name: 'Gamma',
          source: 'acp',
          connectionName: 'ACP One',
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
      ],
      projects: [
        { slug: 'project-a', name: 'Project A', layoutCount: 1 } as any,
      ],
      runtimeConnections: [
        {
          id: 'bedrock-runtime',
          kind: 'runtime',
          type: 'bedrock-runtime',
          name: 'Bedrock Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          prerequisites: [],
        } as any,
      ],
      activeChats: {
        s1: {
          agentSlug: 'alpha',
          messages: [{}],
          projectSlug: undefined,
          lastActivity: 1000,
        },
      },
      selectedContext: GLOBAL_CONTEXT,
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: ['layout:beta'],
      layoutName: 'Workspace Layout',
      layoutIcon: '🧩',
      recentSlugs: ['alpha'],
    });

    expect(viewModel.isGlobal).toBe(true);
    expect(viewModel.currentContextOption?.value).toBe(GLOBAL_CONTEXT);
    expect(viewModel.contextOptions[0]).toEqual({
      value: GLOBAL_CONTEXT,
      label: 'Global',
      icon: '🌐',
    });
    expect(viewModel.filteredContextOptions).toHaveLength(2);
    expect(viewModel.groups.map((group) => group.label)).toEqual([
      'Recent',
      'Runtime Chat',
      'Workspace Layout',
      'ACP One',
    ]);
    expect(viewModel.flatList.map((agent) => agent.slug)).toEqual([
      'alpha',
      '__runtime:bedrock-runtime',
      'layout:beta',
      'acp:gamma',
    ]);
  });
});
