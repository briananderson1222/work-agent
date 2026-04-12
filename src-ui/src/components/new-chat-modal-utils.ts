import type { RuntimeConnectionView } from '@stallion-ai/contracts/tool';
import type { AgentData } from '../contexts/AgentsContext';
import type { ProjectMetadata } from '../contexts/ProjectsContext';
import {
  buildRuntimeChatAgent,
  canAgentStartChat,
  connectionStatusLabel,
  isRuntimeConnectionSelectable,
  runtimeCatalogSourceLabel,
} from '../utils/execution';

export const GLOBAL_CONTEXT = '__global__';

export interface NewChatModalContextOption {
  value: string;
  label: string;
  icon?: string;
  workingDirectory?: string;
}

export interface NewChatModalAgentGroup {
  label: string;
  icon?: string;
  agents: AgentData[];
}

export interface NewChatModalViewModel {
  isGlobal: boolean;
  selectedProject: ProjectMetadata | undefined;
  contextOptions: NewChatModalContextOption[];
  filteredContextOptions: NewChatModalContextOption[];
  currentContextOption: NewChatModalContextOption | undefined;
  groups: NewChatModalAgentGroup[];
  flatList: AgentData[];
  compatibilityMessage?: string;
}

type ActiveChatSnapshot = Record<
  string,
  {
    agentSlug?: string;
    messages?: unknown[];
    projectSlug?: string;
    lastActivity?: number;
  }
>;

export function buildContextOptions(
  projects: ProjectMetadata[],
): NewChatModalContextOption[] {
  const options: NewChatModalContextOption[] = [
    { value: GLOBAL_CONTEXT, label: 'Global', icon: '🌐' },
  ];
  for (const project of projects) {
    options.push({
      value: project.slug,
      label: project.name,
      icon: project.icon || '📁',
      workingDirectory: project.workingDirectory,
    });
  }
  return options;
}

export function filterContextOptions(
  contextOptions: NewChatModalContextOption[],
  contextSearch: string,
): NewChatModalContextOption[] {
  if (!contextSearch) return contextOptions;
  const query = contextSearch.toLowerCase();
  return contextOptions.filter((option) =>
    option.label.toLowerCase().includes(query),
  );
}

export function getRecentAgentSlugsForContext(
  chats: ActiveChatSnapshot,
  context: string,
  storedRecentSlugs: string[],
): string[] {
  const isGlobal = context === GLOBAL_CONTEXT;
  const slugs: string[] = [];

  const entries = Object.values(chats)
    .filter((chat) => {
      if (!chat.agentSlug || !chat.messages?.length) return false;
      if (isGlobal) return !chat.projectSlug;
      return chat.projectSlug === context;
    })
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

  for (const chat of entries) {
    const agentSlug = chat.agentSlug;
    if (agentSlug && !slugs.includes(agentSlug)) {
      slugs.push(agentSlug);
    }
    if (slugs.length >= 3) break;
  }

  for (const slug of storedRecentSlugs) {
    if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
    if (slugs.length >= 5) break;
  }

  return slugs;
}

export function buildNewChatModalViewModel({
  agents,
  projects,
  runtimeConnections,
  selectedContext,
  contextSearch,
  agentSearch,
  selectedProjectAgentFilter,
  layoutAvailableAgents,
  layoutName,
  layoutIcon,
  providerManagedAgentSlugs = [],
  recentSlugs,
}: {
  agents: AgentData[];
  projects: ProjectMetadata[];
  runtimeConnections: RuntimeConnectionView[];
  selectedContext: string;
  contextSearch: string;
  agentSearch: string;
  selectedProjectAgentFilter?: string[];
  layoutAvailableAgents: string[];
  layoutName?: string;
  layoutIcon?: string;
  providerManagedAgentSlugs?: string[];
  recentSlugs: string[];
}): NewChatModalViewModel {
  const contextOptions = buildContextOptions(projects);
  const filteredContextOptions = filterContextOptions(
    contextOptions,
    contextSearch,
  );
  const selectedProject = projects.find(
    (project) => project.slug === selectedContext,
  );
  const currentContextOption = contextOptions.find(
    (option) => option.value === selectedContext,
  );
  const isGlobal = selectedContext === GLOBAL_CONTEXT;

  const query = agentSearch.toLowerCase();
  const chatReadyAgents = agents.filter(
    (agent) =>
      canAgentStartChat(agent, runtimeConnections) &&
      (!selectedProjectAgentFilter ||
        selectedProjectAgentFilter.length === 0 ||
        selectedProjectAgentFilter.includes(agent.slug)),
  );
  const providerManagedSet = new Set(providerManagedAgentSlugs);
  const providerManagedAgents = agents.filter(
    (agent) =>
      providerManagedSet.has(agent.slug) &&
      (!selectedProjectAgentFilter ||
        selectedProjectAgentFilter.length === 0 ||
        selectedProjectAgentFilter.includes(agent.slug)),
  );
  const existingRuntimeChatSlugs = new Set(
    chatReadyAgents
      .filter((agent) => agent.slug.startsWith('__runtime:'))
      .map((agent) => agent.slug),
  );
  const runtimeChats = runtimeConnections
    .filter(
      (connection) =>
        connection.type !== 'acp' && isRuntimeConnectionSelectable(connection),
    )
    .map((connection) => buildRuntimeChatAgent(connection) as AgentData)
    .filter((agent) => !existingRuntimeChatSlugs.has(agent.slug));
  const runtimeChatSlugs = new Set(
    [...runtimeChats, ...chatReadyAgents]
      .filter((agent) => agent.slug.startsWith('__runtime:'))
      .map((agent) => agent.slug),
  );
  const eligibleAgents = new Map<string, AgentData>();
  for (const agent of [
    ...chatReadyAgents,
    ...providerManagedAgents,
    ...runtimeChats,
  ]) {
    if (!eligibleAgents.has(agent.slug)) {
      eligibleAgents.set(agent.slug, agent);
    }
  }
  const filtered = [...eligibleAgents.values()].filter(
    (agent) =>
      agent.name.toLowerCase().includes(query) ||
      agent.slug.toLowerCase().includes(query),
  );

  const isLayoutAgent = (agent: AgentData) => {
    if (agent.source === 'acp') return false;
    if (layoutAvailableAgents.includes(agent.slug)) return true;
    if (agent.slug.includes(':')) return true;
    return false;
  };

  const runtimeAgents = filtered.filter((agent) =>
    runtimeChatSlugs.has(agent.slug),
  );
  const wsAgents = filtered.filter(
    (agent) => !runtimeChatSlugs.has(agent.slug) && isLayoutAgent(agent),
  );
  const globalAgents = filtered.filter(
    (agent) =>
      agent.source !== 'acp' &&
      !runtimeChatSlugs.has(agent.slug) &&
      !isLayoutAgent(agent),
  );
  const acpAgents = filtered.filter((agent) => agent.source === 'acp');

  const acpGroups = new Map<string, AgentData[]>();
  for (const agent of acpAgents) {
    const conn = (agent as any).connectionName || 'ACP';
    const existing = acpGroups.get(conn);
    if (existing) {
      existing.push(agent);
    } else {
      acpGroups.set(conn, [agent]);
    }
  }

  const recentAgents = agentSearch
    ? []
    : (recentSlugs
        .map((slug) => filtered.find((agent) => agent.slug === slug))
        .filter(Boolean) as AgentData[]);
  const recentSet = new Set(recentSlugs);

  const groups: NewChatModalAgentGroup[] = [];

  if (recentAgents.length > 0) {
    groups.push({ label: 'Recent', icon: '🕐', agents: recentAgents });
  }
  const visibleRuntimeAgents = runtimeAgents.filter(
    (agent) => !recentSet.has(agent.slug) || !!agentSearch,
  );

  const showLayoutAgents = isGlobal || (selectedProject?.layoutCount ?? 0) > 0;
  if (showLayoutAgents && wsAgents.length > 0) {
    groups.push({
      label: layoutName || 'Layout',
      icon: layoutIcon,
      agents: wsAgents.filter(
        (agent) => !recentSet.has(agent.slug) || !!agentSearch,
      ),
    });
  }

  if (visibleRuntimeAgents.length > 0) {
    groups.push({
      label: 'Runtime Chat',
      icon: '⚡',
      agents: visibleRuntimeAgents,
    });
  }

  for (const [connectionName, connectionAgents] of acpGroups) {
    const visible = connectionAgents.filter(
      (agent) => !recentSet.has(agent.slug) || !!agentSearch,
    );
    if (visible.length > 0) {
      groups.push({ label: connectionName, icon: '🔌', agents: visible });
    }
  }

  if (globalAgents.length > 0) {
    groups.push({
      label: 'Global',
      icon: '🌐',
      agents: globalAgents.filter(
        (agent) => !recentSet.has(agent.slug) || !!agentSearch,
      ),
    });
  }

  const visibleGroups = groups.filter((group) => group.agents.length > 0);
  const degradedRuntime = runtimeConnections.find(
    (connection) =>
      connection.type !== 'acp' &&
      connection.enabled &&
      connection.capabilities.includes('agent-runtime') &&
      connection.status !== 'ready',
  );
  const compatibilityMessage = degradedRuntime
    ? `${degradedRuntime.name}: ${connectionStatusLabel(
        degradedRuntime.status,
      )} · Catalog ${runtimeCatalogSourceLabel(
        degradedRuntime.runtimeCatalog?.source ?? 'none',
      )}${degradedRuntime.runtimeCatalog?.reason ? ` — ${degradedRuntime.runtimeCatalog.reason}` : ''}`
    : undefined;
  return {
    isGlobal,
    selectedProject,
    contextOptions,
    filteredContextOptions,
    currentContextOption,
    groups: visibleGroups,
    flatList: visibleGroups.flatMap((group) => group.agents),
    compatibilityMessage,
  };
}
