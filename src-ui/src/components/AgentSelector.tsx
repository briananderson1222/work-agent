import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentSummary } from '../types';

export interface AgentSelectorProps {
  agents: AgentSummary[];
  selectedAgent: AgentSummary | null;
  onSelect: (slug: string) => void;
  onCreateAgent: () => void;
  onEditAgent: (slug: string) => void;
  onManageTools: (slug: string) => void;
  onManageWorkflows: (slug: string) => void;
}

const formatRelativeTime = (iso: string | undefined) => {
  if (!iso) return 'Unknown update';
  const updated = new Date(iso);
  if (Number.isNaN(updated.valueOf())) return 'Unknown update';

  const diffMs = Date.now() - updated.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Updated just now';
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Updated yesterday';
  if (diffDays < 7) return `Updated ${diffDays}d ago`;
  return updated.toLocaleDateString();
};

export function AgentSelector({
  agents,
  selectedAgent,
  onSelect,
  onCreateAgent,
  onEditAgent,
  onManageTools,
  onManageWorkflows,
}: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => setIsOpen((prev) => !prev);

  const close = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const agentOptions = useMemo(() => agents, [agents]);

  const handleSelect = (slug: string) => {
    onSelect(slug);
    close();
  };

  const handleCreate = () => {
    close();
    onCreateAgent();
  };

  const handleEdit = () => {
    if (!selectedAgent) return;
    close();
    onEditAgent(selectedAgent.slug);
  };

  const handleManageTools = () => {
    if (!selectedAgent) return;
    close();
    onManageTools(selectedAgent.slug);
  };

  const handleManageWorkflows = () => {
    if (!selectedAgent) return;
    close();
    onManageWorkflows(selectedAgent.slug);
  };

  return (
    <div className={`agent-selector ${isOpen ? 'is-open' : ''}`} ref={menuRef}>
      <button type="button" className="agent-selector__trigger" onClick={handleToggle}>
        <div className="agent-selector__current">
          <span className="agent-selector__current-label">Agent</span>
          <span className="agent-selector__current-name">{selectedAgent?.name || 'Select an agent'}</span>
          {selectedAgent?.model && <span className="agent-selector__current-model">{typeof selectedAgent.model === 'string' ? selectedAgent.model : selectedAgent.model.modelId}</span>}
        </div>
        <span className="agent-selector__chevron" aria-hidden="true">
          {isOpen ? '^' : 'v'}
        </span>
      </button>

      {isOpen && (
        <div className="agent-selector__menu" role="menu">
          <div className="agent-selector__section">
            <span className="agent-selector__section-title">Agents</span>
            {agentOptions.length === 0 ? (
              <p className="agent-selector__empty">No agents found. Create one to get started.</p>
            ) : (
              <ul>
                {agentOptions.map((agent) => (
                  <li key={agent.slug}>
                    <button
                      type="button"
                      className="agent-selector__option"
                      onClick={() => handleSelect(agent.slug)}
                    >
                      <span className="agent-selector__option-name">{agent.name}</span>
                      <span className="agent-selector__option-meta">
                        {agent.model ? (typeof agent.model === 'string' ? agent.model : agent.model.modelId) : 'Default model'} · {formatRelativeTime(agent.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="agent-selector__section agent-selector__section--manage">
            <span className="agent-selector__section-title">Manage</span>
            <div className="agent-selector__actions">
              <button type="button" onClick={handleCreate} className="agent-selector__manage-button">
                New Agent
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="agent-selector__manage-button"
                disabled={!selectedAgent}
              >
                Edit Agent
              </button>
              <button
                type="button"
                onClick={handleManageTools}
                className="agent-selector__manage-button"
                disabled={!selectedAgent}
              >
                Manage Tools
              </button>
              <button
                type="button"
                onClick={handleManageWorkflows}
                className="agent-selector__manage-button"
                disabled={!selectedAgent}
              >
                Manage Workflows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
