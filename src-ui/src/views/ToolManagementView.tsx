import { useState, useEffect } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { Tool } from '../types';

export interface ToolManagementViewProps {
  apiBase: string;
  agentSlug: string;
  agentName: string;
  onBack: () => void;
}

interface AgentToolConfig {
  tools: string[];
  allowed?: string[];
  aliases?: Record<string, string>;
}

export function ToolManagementView({ apiBase, agentSlug, agentName, onBack }: ToolManagementViewProps) {
  const [globalTools, setGlobalTools] = useState<Tool[]>([]);
  const [agentConfig, setAgentConfig] = useState<AgentToolConfig>({ tools: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolToRemove, setToolToRemove] = useState<string | null>(null);
  const [allowListText, setAllowListText] = useState('');
  const [aliasEditMode, setAliasEditMode] = useState<Record<string, boolean>>({});
  const [aliasValues, setAliasValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [agentSlug]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [toolsResponse, agentResponse] = await Promise.all([
        fetch(`${apiBase}/tools`),
        fetch(`${apiBase}/agents`),
      ]);

      if (!toolsResponse.ok) throw new Error('Failed to load tools');
      if (!agentResponse.ok) throw new Error('Failed to load agent');

      const toolsData = await toolsResponse.json();
      const agentData = await agentResponse.json();

      const agent = (agentData.data || []).find(
        (a: any) => a.slug === agentSlug || a.id === agentSlug
      );
      if (!agent) throw new Error('Agent not found');

      setGlobalTools(toolsData.data || []);
      const config: AgentToolConfig = {
        tools: agent.tools || [],
        allowed: agent.allowed,
        aliases: agent.aliases,
      };
      setAgentConfig(config);
      setAllowListText((config.allowed || []).join(', '));
      setAliasValues(config.aliases || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addTool = async (toolId: string) => {
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add tool');
      }
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeTool = async (toolId: string) => {
    try {
      setIsSaving(true);
      setError(null);
      setToolToRemove(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools/${toolId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove tool');
      }
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveAllowList = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const allowed = allowListText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools/allowed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update allow list');
      }
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveAliases = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/tools/aliases`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: aliasValues }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update aliases');
      }
      await loadData();
      setAliasEditMode({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAliasEdit = (toolId: string) => {
    setAliasEditMode((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const updateAlias = (toolId: string, value: string) => {
    setAliasValues((prev) => ({
      ...prev,
      [toolId]: value,
    }));
  };

  if (isLoading) {
    return (
      <div className="management-view">
        <div className="management-view__header">
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
          <h2>Manage Tools: {agentName}</h2>
        </div>
        <div className="management-view__loading">Loading tools...</div>
      </div>
    );
  }

  const enabledTools = globalTools.filter((tool) => agentConfig.tools.includes(tool.id));
  const availableTools = globalTools.filter((tool) => !agentConfig.tools.includes(tool.id));

  return (
    <>
      <div className="management-view">
        <div className="management-view__header">
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
          <h2>Manage Tools: {agentName}</h2>
        </div>

        {error && <div className="management-view__error">{error}</div>}

        <div className="tool-management">
          <div className="tool-management__column">
            <h3>Global Tool Catalog</h3>
            <p className="column-help">Available tools that can be added to this agent</p>
            {availableTools.length === 0 ? (
              <div className="empty-state-small">
                <p>All available tools have been added to this agent.</p>
              </div>
            ) : (
              <div className="tool-list">
                {availableTools.map((tool) => (
                  <div key={tool.id} className="tool-card">
                    <div className="tool-card__info">
                      <h4>{tool.name}</h4>
                      {tool.description && <p>{tool.description}</p>}
                      <div className="tool-card__meta">
                        <span className="tool-badge tool-badge--kind">{tool.kind}</span>
                        {tool.transport && (
                          <span className="tool-badge tool-badge--transport">{tool.transport}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button--small button--secondary"
                      onClick={() => addTool(tool.id)}
                      disabled={isSaving}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tool-management__column">
            <h3>Agent Tools</h3>
            <p className="column-help">Tools enabled for this agent</p>
            {enabledTools.length === 0 ? (
              <div className="empty-state-small">
                <p>No tools enabled. Add tools from the catalog.</p>
              </div>
            ) : (
              <div className="tool-list">
                {enabledTools.map((tool) => (
                  <div key={tool.id} className="tool-card tool-card--enabled">
                    <div className="tool-card__info">
                      <h4>{tool.name}</h4>
                      {tool.description && <p>{tool.description}</p>}
                      <div className="tool-card__meta">
                        <span className="tool-badge tool-badge--kind">{tool.kind}</span>
                        {tool.transport && (
                          <span className="tool-badge tool-badge--transport">{tool.transport}</span>
                        )}
                      </div>
                      {aliasEditMode[tool.id] ? (
                        <div className="tool-alias-editor">
                          <input
                            type="text"
                            value={aliasValues[tool.id] || ''}
                            onChange={(e) => updateAlias(tool.id, e.target.value)}
                            placeholder="Alias name"
                          />
                          <button
                            type="button"
                            className="button button--small button--primary"
                            onClick={saveAliases}
                            disabled={isSaving}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        aliasValues[tool.id] && (
                          <div className="tool-alias">
                            Alias: <strong>{aliasValues[tool.id]}</strong>
                            <button
                              type="button"
                              className="button--link"
                              onClick={() => toggleAliasEdit(tool.id)}
                            >
                              Edit
                            </button>
                          </div>
                        )
                      )}
                      {!aliasEditMode[tool.id] && !aliasValues[tool.id] && (
                        <button
                          type="button"
                          className="button--link"
                          onClick={() => toggleAliasEdit(tool.id)}
                        >
                          Add alias
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="button button--small button--danger"
                      onClick={() => setToolToRemove(tool.id)}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="tool-allow-list">
              <h4>Allow List</h4>
              <p className="form-help">
                Comma-separated list of allowed tool names. Leave empty to allow all.
              </p>
              <div className="allow-list-editor">
                <input
                  type="text"
                  value={allowListText}
                  onChange={(e) => setAllowListText(e.target.value)}
                  placeholder="tool1, tool2, tool3"
                />
                <button
                  type="button"
                  className="button button--primary"
                  onClick={saveAllowList}
                  disabled={isSaving}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!toolToRemove}
        title="Remove Tool"
        message={`Are you sure you want to remove "${globalTools.find((t) => t.id === toolToRemove)?.name}" from this agent?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => toolToRemove && removeTool(toolToRemove)}
        onCancel={() => setToolToRemove(null)}
      />
    </>
  );
}
