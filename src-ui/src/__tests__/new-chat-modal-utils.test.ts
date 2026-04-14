import { describe, expect, test } from 'vitest';
import {
  buildContextOptions,
  buildNewChatModalViewModel,
  filterContextOptions,
  GLOBAL_CONTEXT,
  getRecentAgentSlugsForContext,
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
          name: 'Managed Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: { source: 'live', models: [], fallbackModels: [] },
          prerequisites: [],
        } as any,
      ],
      selectedContext: GLOBAL_CONTEXT,
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: ['layout:beta'],
      layoutName: 'Workspace Layout',
      layoutIcon: '🧩',
      providerManagedAgentSlugs: [],
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
      'Workspace Layout',
      'Runtime Chat',
      'ACP One',
    ]);
    expect(viewModel.flatList.map((agent) => agent.slug)).toEqual([
      'alpha',
      'layout:beta',
      '__runtime:bedrock-runtime',
      'acp:gamma',
    ]);
    expect(viewModel.compatibilityMessage).toBeUndefined();
  });

  test('dedupes runtime chat agents when agents already include matching runtime entries', () => {
    const viewModel = buildNewChatModalViewModel({
      agents: [
        {
          slug: '__runtime:claude-runtime',
          name: 'Claude Runtime',
          description: 'server-backed claude runtime row',
          source: 'local',
          execution: { runtimeConnectionId: 'claude-runtime' },
        } as any,
        {
          slug: '__runtime:codex-runtime',
          name: 'Codex Runtime',
          description: 'server-backed codex runtime row',
          source: 'local',
          execution: { runtimeConnectionId: 'codex-runtime' },
        } as any,
        {
          slug: 'stallion',
          name: 'Stallion',
          source: 'local',
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
      ],
      projects: [],
      runtimeConnections: [
        {
          id: 'claude-runtime',
          kind: 'runtime',
          type: 'claude-runtime',
          name: 'Claude Runtime',
          description: 'connection-backed claude runtime row',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: { source: 'live', models: [], fallbackModels: [] },
          prerequisites: [],
        } as any,
        {
          id: 'codex-runtime',
          kind: 'runtime',
          type: 'codex-runtime',
          name: 'Codex Runtime',
          description: 'connection-backed codex runtime row',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: {
            source: 'fallback',
            models: [],
            fallbackModels: [],
          },
          prerequisites: [],
        } as any,
        {
          id: 'bedrock-runtime',
          kind: 'runtime',
          type: 'bedrock-runtime',
          name: 'Managed Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: { source: 'live', models: [], fallbackModels: [] },
          prerequisites: [],
        } as any,
      ],
      selectedContext: GLOBAL_CONTEXT,
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: [],
      layoutName: undefined,
      layoutIcon: undefined,
      providerManagedAgentSlugs: [],
      recentSlugs: [],
    });

    const runtimeGroup = viewModel.groups.find(
      (group) => group.label === 'Runtime Chat',
    );

    expect(runtimeGroup?.agents.map((agent) => agent.slug)).toEqual([
      '__runtime:claude-runtime',
      '__runtime:codex-runtime',
      '__runtime:bedrock-runtime',
    ]);
    expect(
      viewModel.flatList.filter(
        (agent) => agent.slug === '__runtime:claude-runtime',
      ),
    ).toHaveLength(1);
    expect(
      viewModel.flatList.filter(
        (agent) => agent.slug === '__runtime:codex-runtime',
      ),
    ).toHaveLength(1);
    expect(
      runtimeGroup?.agents.find(
        (agent) => agent.slug === '__runtime:claude-runtime',
      )?.description,
    ).toBe('server-backed claude runtime row');
    expect(
      runtimeGroup?.agents.find(
        (agent) => agent.slug === '__runtime:codex-runtime',
      )?.description,
    ).toBe('server-backed codex runtime row');
    expect(
      viewModel.groups.find((group) => group.label === 'Global')?.agents,
    ).toEqual([expect.objectContaining({ slug: 'stallion' })]);
  });

  test('shows provider-managed default agent in project context without runtime readiness', () => {
    const viewModel = buildNewChatModalViewModel({
      agents: [
        {
          slug: 'default',
          name: 'Stallion',
          source: 'local',
          model: 'llama3.2',
          execution: {
            runtimeConnectionId: 'bedrock-runtime',
            runtimeOptions: {
              executionMode: 'provider-managed',
              executionScope: 'project',
              providerId: 'ollama-local',
              providerKind: 'ollama',
              displayModel: 'llama3.2',
            },
          },
        } as any,
      ],
      projects: [
        { slug: 'project-a', name: 'Project A', layoutCount: 0 } as any,
      ],
      runtimeConnections: [],
      selectedContext: 'project-a',
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: [],
      layoutName: undefined,
      layoutIcon: undefined,
      providerManagedAgentSlugs: ['default'],
      recentSlugs: [],
    });

    expect(viewModel.groups.map((group) => group.label)).toEqual(['Global']);
    expect(viewModel.flatList.map((agent) => agent.slug)).toEqual(['default']);
    expect(viewModel.groups[0]?.agents[0]).toEqual(
      expect.objectContaining({ slug: 'default', name: 'Stallion' }),
    );
  });

  test('hides recent runtime agents from the runtime section and keeps runtime chat last', () => {
    const viewModel = buildNewChatModalViewModel({
      agents: [
        {
          slug: '__runtime:codex-runtime',
          name: 'Codex Runtime',
          source: 'local',
          execution: { runtimeConnectionId: 'codex-runtime' },
        } as any,
        {
          slug: 'default',
          name: 'Stallion',
          source: 'local',
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
      ],
      projects: [],
      runtimeConnections: [
        {
          id: 'codex-runtime',
          kind: 'runtime',
          type: 'codex-runtime',
          name: 'Codex Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: { source: 'live', models: [], fallbackModels: [] },
          prerequisites: [],
        } as any,
        {
          id: 'claude-runtime',
          kind: 'runtime',
          type: 'claude-runtime',
          name: 'Claude Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'ready',
          runtimeCatalog: { source: 'cached', models: [], fallbackModels: [] },
          prerequisites: [],
        } as any,
      ],
      selectedContext: GLOBAL_CONTEXT,
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: [],
      layoutName: undefined,
      layoutIcon: undefined,
      providerManagedAgentSlugs: [],
      recentSlugs: ['__runtime:codex-runtime'],
    });

    expect(viewModel.groups.map((group) => group.label)).toEqual([
      'Recent',
      'Runtime Chat',
    ]);
    expect(viewModel.groups[0]?.agents.map((agent) => agent.slug)).toEqual([
      '__runtime:codex-runtime',
    ]);
    expect(viewModel.groups[1]?.agents.map((agent) => agent.slug)).toEqual([
      '__runtime:claude-runtime',
    ]);
  });

  test('surfaces degraded runtime compatibility messaging', () => {
    const viewModel = buildNewChatModalViewModel({
      agents: [],
      projects: [],
      runtimeConnections: [
        {
          id: 'codex-runtime',
          kind: 'runtime',
          type: 'codex-runtime',
          name: 'Codex Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'degraded',
          runtimeCatalog: {
            source: 'fallback',
            reason: 'Live catalog unavailable.',
            models: [],
            fallbackModels: [],
          },
          prerequisites: [],
        } as any,
      ],
      selectedContext: GLOBAL_CONTEXT,
      contextSearch: '',
      agentSearch: '',
      selectedProjectAgentFilter: undefined,
      layoutAvailableAgents: [],
      layoutName: undefined,
      layoutIcon: undefined,
      providerManagedAgentSlugs: [],
      recentSlugs: [],
    });

    expect(viewModel.compatibilityMessage).toContain(
      'Codex Runtime: Degraded · Catalog Fallback',
    );
  });
});
