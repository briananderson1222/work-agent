import {
  useProjectLayoutQuery,
  useProjectQuery,
  useRuntimeConnectionsQuery,
} from '@stallion-ai/sdk';
import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { activeChatsStore } from '../contexts/ActiveChatsContext';
import type { AgentData } from '../contexts/AgentsContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectMetadata } from '../contexts/ProjectsContext';
import {
  getRecentAgentSlugs,
  trackRecentAgent,
} from '../hooks/useRecentAgents';
import { AgentIcon } from './AgentIcon';
import {
  buildNewChatModalViewModel,
  GLOBAL_CONTEXT,
  getRecentAgentSlugsForContext,
} from './new-chat-modal-utils';

interface NewChatModalProps {
  agents: AgentData[];
  projects: ProjectMetadata[];
  activeProjectSlug?: string | null;
  onSelect: (
    agent: AgentData,
    projectSlug?: string,
    projectName?: string,
  ) => void;
  onClose: () => void;
}

/** "Global" sentinel for the context picker */
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

  const { selectedProject: activeLayoutProject, selectedProjectLayout } =
    useNavigation();
  const { data: layout } = useProjectLayoutQuery(
    activeLayoutProject || '',
    selectedProjectLayout || '',
    {
      enabled: !!activeLayoutProject && !!selectedProjectLayout,
    },
  );
  const { data: runtimeConnections = [] } =
    useRuntimeConnectionsQuery() as {
      data?: ConnectionConfig[];
    };

  // Fetch project config for agent scoping
  const selectedProjectSlug =
    selectedContext !== GLOBAL_CONTEXT ? selectedContext : null;
  const { data: selectedProjectConfig } = useProjectQuery(
    selectedProjectSlug ?? '',
    {
      enabled: !!selectedProjectSlug,
    },
  ) as {
    data?: {
      agents?: string[];
    };
  };
  const projectAgentFilter = selectedProjectConfig?.agents;

  const activeChatsSnapshot = activeChatsStore.getSnapshot();

  const viewModel = useMemo(
    () =>
      buildNewChatModalViewModel({
        agents,
        projects,
        runtimeConnections,
        selectedContext,
        contextSearch,
        agentSearch,
        selectedProjectAgentFilter: projectAgentFilter,
        layoutAvailableAgents: layout?.availableAgents || [],
        layoutName: layout?.name,
        layoutIcon: layout?.icon,
        recentSlugs: getRecentAgentSlugsForContext(
          activeChatsSnapshot,
          selectedContext,
          getRecentAgentSlugs(),
        ),
      }),
    [
      activeChatsSnapshot,
      agentSearch,
      agents,
      contextSearch,
      layout?.availableAgents,
      layout?.icon,
      layout?.name,
      projectAgentFilter,
      projects,
      runtimeConnections,
      selectedContext,
    ],
  );
  const {
    isGlobal,
    selectedProject,
    currentContextOption,
    filteredContextOptions,
    groups,
    flatList,
  } = viewModel;
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
            <label className="new-chat-modal__context-label-text">
              Context
            </label>
            <button
              className="new-chat-modal__context-button"
              onClick={() => {
                setContextOpen((v) => !v);
                setContextSearch('');
              }}
            >
              {currentContextOption?.icon && (
                <span className="new-chat-modal__context-icon">
                  {currentContextOption.icon}
                </span>
              )}
              <span className="new-chat-modal__context-label">
                {currentContextOption?.label || 'Select context'}
              </span>
              {!isGlobal && selectedProject?.workingDirectory && (
                <span className="new-chat-modal__context-dir">
                  <CwdBreadcrumb path={selectedProject.workingDirectory} />
                </span>
              )}
              {!isGlobal &&
                selectedProject &&
                !selectedProject.workingDirectory && (
                  <span className="new-chat-modal__context-dir new-chat-modal__context-dir--fallback">
                    ~ (defaults to home)
                  </span>
                )}
              {isGlobal && (
                <span className="new-chat-modal__context-dir new-chat-modal__context-dir--fallback">
                  ~ (home directory)
                </span>
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
                      <span>
                        {opt.icon} {opt.label}
                      </span>
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
                setSelectedAgentIndex((p) =>
                  Math.min(p + 1, flatList.length - 1),
                );
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
          {flatList.length === 0 && (
            <div className="new-chat-modal__group-label">
              No chat-capable agents or runtimes are ready.
            </div>
          )}
          {groups.map((group, gi) => (
            <React.Fragment key={group.label}>
              <div
                className={`new-chat-modal__group-label ${group.icon === '🔌' ? 'new-chat-modal__group-label--acp' : ''}`}
                style={{
                  borderTop:
                    gi > 0 ? '1px solid var(--border-primary)' : undefined,
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
