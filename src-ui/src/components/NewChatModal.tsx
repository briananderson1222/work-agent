import { useLayoutQuery } from '@stallion-ai/sdk';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { activeChatsStore } from '../contexts/ActiveChatsContext';
import type { AgentData } from '../contexts/AgentsContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectMetadata } from '../contexts/ProjectsContext';
import { getRecentAgentSlugs, trackRecentAgent } from '../hooks/useRecentAgents';
import { AgentIcon } from './AgentIcon';

interface NewChatModalProps {
  agents: AgentData[];
  projects: ProjectMetadata[];
  activeProjectSlug?: string | null;
  onSelect: (agent: AgentData, projectSlug?: string, projectName?: string) => void;
  onClose: () => void;
}

/** "Global" sentinel for the context picker */
const GLOBAL_CONTEXT = '__global__';

interface ContextOption {
  value: string; // project slug or GLOBAL_CONTEXT
  label: string;
  icon?: string;
  workingDirectory?: string;
}

interface AgentGroup {
  label: string;
  icon?: string;
  agents: AgentData[];
}

export function NewChatModal({
  agents,
  projects,
  activeProjectSlug,
  onSelect,
  onClose,
}: NewChatModalProps) {
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const [selectedContext, setSelectedContext] = useState<string>(
    activeProjectSlug || GLOBAL_CONTEXT,
  );
  const [contextSearch, setContextSearch] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const contextRef = useRef<HTMLDivElement>(null);
  const agentInputRef = useRef<HTMLInputElement>(null);

  const { selectedLayout } = useNavigation();
  const { data: layout } = useLayoutQuery(selectedLayout || '', {
    enabled: !!selectedLayout,
  });

  const isGlobal = selectedContext === GLOBAL_CONTEXT;
  const selectedProject = projects.find((p) => p.slug === selectedContext);

  // Build context options: Global + all projects
  const contextOptions = useMemo<ContextOption[]>(() => {
    const opts: ContextOption[] = [
      { value: GLOBAL_CONTEXT, label: 'Global', icon: '🌐' },
    ];
    for (const p of projects) {
      opts.push({
        value: p.slug,
        label: p.name,
        icon: p.icon || '📁',
        workingDirectory: p.workingDirectory,
      });
    }
    return opts;
  }, [projects]);

  const filteredContextOptions = useMemo(() => {
    if (!contextSearch) return contextOptions;
    const q = contextSearch.toLowerCase();
    return contextOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [contextOptions, contextSearch]);

  const currentContextOption = contextOptions.find((o) => o.value === selectedContext);

  // Close context dropdown on outside click
  useEffect(() => {
    if (!contextOpen) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node))
        setContextOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextOpen]);

  // Focus agent input on mount and when context dropdown closes
  useEffect(() => {
    if (!contextOpen) agentInputRef.current?.focus();
  }, [contextOpen]);

  const wsAgentSlugs = useMemo(
    () => new Set(layout?.availableAgents || []),
    [layout],
  );

  const { groups, flatList } = useMemo(() => {
    const filtered = (agents || []).filter(
      (a) =>
        a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
        a.slug.toLowerCase().includes(agentSearch.toLowerCase()),
    );

    const isLayoutAgent = (a: AgentData) => {
      if (a.source === 'acp') return false;
      if (wsAgentSlugs.has(a.slug)) return true;
      if (a.slug.includes(':')) return true;
      return false;
    };

    const wsAgents = filtered.filter((a) => isLayoutAgent(a));
    const globalAgents = filtered.filter(
      (a) => a.source !== 'acp' && !isLayoutAgent(a),
    );
    const acpAgents = filtered.filter((a) => a.source === 'acp');

    // Group ACP agents by connectionName
    const acpGroups = new Map<string, AgentData[]>();
    for (const a of acpAgents) {
      const conn = (a as any).connectionName || 'ACP';
      if (!acpGroups.has(conn)) acpGroups.set(conn, []);
      acpGroups.get(conn)!.push(a);
    }

    // Recent: from active chats + localStorage, scoped to selected context
    const recentSlugs = getRecentForContext(selectedContext);
    const recentAgents = agentSearch
      ? []
      : recentSlugs
          .map((s) => filtered.find((a) => a.slug === s))
          .filter(Boolean) as AgentData[];
    const recentSet = new Set(recentSlugs);

    const groups: AgentGroup[] = [];

    if (recentAgents.length > 0)
      groups.push({ label: 'Recent', icon: '🕐', agents: recentAgents });

    const showLayoutAgents = isGlobal || (selectedProject?.layoutCount ?? 0) > 0;

    const wsName = layout?.name;
    if (showLayoutAgents && wsAgents.length > 0)
      groups.push({
        label: wsName || 'Layout',
        icon: layout?.icon,
        agents: wsAgents.filter((a) => !recentSet.has(a.slug) || !!agentSearch),
      });

    for (const [conn, connAgents] of acpGroups) {
      const visible = connAgents.filter((a) => !recentSet.has(a.slug) || !!agentSearch);
      if (visible.length > 0)
        groups.push({ label: conn, icon: '🔌', agents: visible });
    }

    if (globalAgents.length > 0)
      groups.push({
        label: 'Global',
        icon: '🌐',
        agents: globalAgents.filter((a) => !recentSet.has(a.slug) || !!agentSearch),
      });

    const flatList = groups
      .filter((g) => g.agents.length > 0)
      .flatMap((g) => g.agents);
    return { groups: groups.filter((g) => g.agents.length > 0), flatList };
  }, [agents, agentSearch, wsAgentSlugs, layout?.icon, layout?.name, selectedContext, isGlobal, selectedProject?.layoutCount]);

  const handleSelect = (agent: AgentData) => {
    trackRecentAgent(agent.slug);
    if (isGlobal) {
      onSelect(agent);
    } else if (selectedProject) {
      onSelect(agent, selectedProject.slug, selectedProject.name);
    }
  };

  return (
    <div className="new-chat-modal__overlay" onClick={onClose}>
      <div className="new-chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="new-chat-modal__header">
          <h3 className="new-chat-modal__title">New Chat</h3>

          {/* Context picker */}
          <div className="new-chat-modal__context-picker" ref={contextRef}>
            <label className="new-chat-modal__context-label-text">Context</label>
            <button
              className="new-chat-modal__context-button"
              onClick={() => {
                setContextOpen((v) => !v);
                setContextSearch('');
              }}
            >
              {currentContextOption?.icon && (
                <span className="new-chat-modal__context-icon">{currentContextOption.icon}</span>
              )}
              <span className="new-chat-modal__context-label">
                {currentContextOption?.label || 'Select context'}
              </span>
              {!isGlobal && selectedProject?.workingDirectory && (
                <span className="new-chat-modal__context-dir">
                  <CwdBreadcrumb path={selectedProject.workingDirectory} />
                </span>
              )}
              {!isGlobal && selectedProject && !selectedProject.workingDirectory && (
                <span className="new-chat-modal__context-dir new-chat-modal__context-dir--fallback">~ (defaults to home)</span>
              )}
              {isGlobal && (
                <span className="new-chat-modal__context-dir new-chat-modal__context-dir--fallback">~ (home directory)</span>
              )}
              <span className="new-chat-modal__chevron">▾</span>
            </button>

            {contextOpen && (
              <div className="new-chat-modal__dropdown">
                <input
                  className="new-chat-modal__dropdown-search"
                  type="text"
                  placeholder="Filter..."
                  value={contextSearch}
                  onChange={(e) => setContextSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setContextOpen(false);
                  }}
                  autoFocus
                />
                {filteredContextOptions.map((opt) => (
                  <button
                    key={opt.value}
                    className={`new-chat-modal__dropdown-item ${opt.value === selectedContext ? 'new-chat-modal__dropdown-item--active' : ''}`}
                    onClick={() => {
                      setSelectedContext(opt.value);
                      setContextOpen(false);
                      setSelectedAgentIndex(0);
                    }}
                  >
                    <span className="new-chat-modal__dropdown-item-main">
                      <span>{opt.icon} {opt.label}</span>
                      {opt.workingDirectory && (
                        <span className="new-chat-modal__dropdown-item-dir">
                          <CwdBreadcrumb path={opt.workingDirectory} />
                        </span>
                      )}
                    </span>
                    {opt.value !== GLOBAL_CONTEXT && !opt.workingDirectory && (
                      <span className="new-chat-modal__no-cwd-badge">~/</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent search */}
          <input
            ref={agentInputRef}
            type="text"
            placeholder="Search agents..."
            value={agentSearch}
            onChange={(e) => {
              setAgentSearch(e.target.value);
              setSelectedAgentIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedAgentIndex((p) => Math.min(p + 1, flatList.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedAgentIndex((p) => Math.max(p - 1, 0));
              } else if (e.key === 'Enter' && flatList[selectedAgentIndex])
                handleSelect(flatList[selectedAgentIndex]);
              else if (e.key === 'Escape') onClose();
            }}
            autoFocus
            className="new-chat-modal__search"
          />
        </div>

        <div className="new-chat-modal__list">
          {groups.map((group, gi) => (
            <React.Fragment key={group.label}>
              <div
                className={`new-chat-modal__group-label ${group.icon === '🔌' ? 'new-chat-modal__group-label--acp' : ''}`}
                style={{
                  borderTop: gi > 0 ? '1px solid var(--border-primary)' : undefined,
                }}
              >
                {group.icon && <>{group.icon} </>}
                {group.label}
              </div>
              {group.agents.map((agent) => {
                const idx = flatList.indexOf(agent);
                return (
                  <AgentRow
                    key={agent.slug}
                    agent={agent}
                    isSelected={idx === selectedAgentIndex}
                    onSelect={() => handleSelect(agent)}
                    onHover={() => setSelectedAgentIndex(idx)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Working directory breadcrumb with leaf emphasis (matches chat dock style) */
function CwdBreadcrumb({ path }: { path: string }) {
  const parts = path.replace(/\/+$/, '').split('/');
  const leaf = parts.pop() || '';
  const parent = parts.length ? `${parts.join('/')}/` : '';
  return (
    <>
      <span className="new-chat-modal__dir-parent">{parent}</span>
      <span className="new-chat-modal__dir-leaf">{leaf}</span>
    </>
  );
}

/** Get recent agent slugs, optionally scoped to a project context */
function getRecentForContext(context: string): string[] {
  // From active chats
  const chats = activeChatsStore.getSnapshot();
  const slugs: string[] = [];
  const isGlobal = context === GLOBAL_CONTEXT;

  const entries = Object.values(chats)
    .filter((c: any) => {
      if (!c.agentSlug || !c.messages?.length) return false;
      if (isGlobal) return !c.projectSlug;
      return c.projectSlug === context;
    })
    .sort((a: any, b: any) => (b.lastActivity || 0) - (a.lastActivity || 0));

  for (const chat of entries) {
    if (!slugs.includes((chat as any).agentSlug))
      slugs.push((chat as any).agentSlug);
    if (slugs.length >= 3) break;
  }

  // Supplement from localStorage
  const stored = getRecentAgentSlugs();
  for (const s of stored) {
    if (!slugs.includes(s)) slugs.push(s);
    if (slugs.length >= 5) break;
  }

  return slugs;
}

function AgentRow({
  agent,
  isSelected,
  onSelect,
  onHover,
}: {
  agent: AgentData;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      className={`new-chat-modal__agent ${isSelected ? 'new-chat-modal__agent--selected' : ''}`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <div className="new-chat-modal__agent-header">
        <AgentIcon agent={agent} size="small" />
        <span className="new-chat-modal__agent-name">{agent.name}</span>
      </div>
      {agent.description && (
        <div className="new-chat-modal__agent-desc">{agent.description}</div>
      )}
    </button>
  );
}
