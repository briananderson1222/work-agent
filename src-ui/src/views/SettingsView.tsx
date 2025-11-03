import { useState, useEffect } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { AppConfig } from '../types';
import { getWorkspaceIcon, getAgentIcon } from '../utils/workspace';
import { useAppData } from '../contexts/AppDataContext';
import { ModelSelector } from '../components/ModelSelector';
import { useTabKeyboardShortcuts } from '../hooks/useTabKeyboardShortcuts';
import { useCloseShortcut } from '../hooks/useCloseShortcut';

export interface SettingsViewProps {
  apiBase: string;
  onBack: () => void;
  onSaved?: () => void;
  onEditAgent?: (slug: string) => void;
  onCreateAgent?: () => void;
  onEditWorkspace?: (slug: string) => void;
  onCreateWorkspace?: () => void;
}

export function SettingsView({ apiBase, onBack, onSaved, onEditAgent, onCreateAgent, onEditWorkspace, onCreateWorkspace }: SettingsViewProps) {
  const { models: availableModels } = useAppData();
  const [activeTab, setActiveTab] = useState<'general' | 'agents' | 'workspaces' | 'prompts' | 'notifications' | 'advanced' | 'debug'>(() => {
    const hash = window.location.hash.slice(1);
    return (hash && ['general', 'agents', 'workspaces', 'prompts', 'notifications', 'advanced', 'debug'].includes(hash)) 
      ? hash as any 
      : 'general';
  });
  const [config, setConfig] = useState<AppConfig>({});
  const [originalConfig, setOriginalConfig] = useState<AppConfig>({});
  const [agents, setAgents] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [qAgents, setQAgents] = useState<any[]>([]);
  const [selectedQAgent, setSelectedQAgent] = useState<any>(null);
  const [importForm, setImportForm] = useState({ name: '', slug: '' });
  const [editingPrompt, setEditingPrompt] = useState<any>(null);

  const tabs = ['general', 'agents', 'workspaces', 'prompts', 'notifications', 'advanced', 'debug'] as const;

  useTabKeyboardShortcuts(tabs, activeTab, setActiveTab);
  useCloseShortcut(onBack);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  // Update hash when tab changes
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    loadConfig();
    loadAgents();
    loadWorkspaces();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/config/app`);
      if (!response.ok) throw new Error('Failed to load configuration');
      const data = await response.json();
      const loadedConfig = data.data || {};
      setConfig(loadedConfig);
      setOriginalConfig(loadedConfig);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const response = await fetch(`${apiBase}/api/agents`);
      if (!response.ok) throw new Error('Failed to load agents');
      const data = await response.json();
      setAgents(data.data || []);
    } catch (err: any) {
      console.error('Failed to load agents:', err);
    }
  };

  const loadWorkspaces = async () => {
    try {
      const response = await fetch(`${apiBase}/workspaces`);
      if (!response.ok) throw new Error('Failed to load workspaces');
      const data = await response.json();
      setWorkspaces(data.data || []);
    } catch (err: any) {
      console.error('Failed to load workspaces:', err);
    }
  };

  const saveConfig = async () => {
    try {
      setIsSaving(true);
      setError(null);
      
      const response = await fetch(`${apiBase}/config/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }
      
      // Update original config after successful save
      setOriginalConfig(config);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const response = await fetch(`${apiBase}/agents`);
      if (response.ok) {
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('failed');
        setTimeout(() => setTestStatus('idle'), 3000);
      }
    } catch {
      setTestStatus('failed');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const resetToDefaults = async () => {
    setShowResetModal(false);
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch(`${apiBase}/config/app`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('Failed to reset configuration');
      await loadConfig();
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="management-view">
        <div className="management-view__header">
          <h2>Settings</h2>
        </div>
        <div className="management-view__loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <>
      <div className="management-view">
        <div className="management-view__header">
          <h2>Settings</h2>
          <div className="management-view__header-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={testConnection}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing'
                ? 'Testing...'
                : testStatus === 'success'
                  ? 'Connection OK'
                  : testStatus === 'failed'
                    ? 'Connection Failed'
                    : 'Test Connection'}
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={saveConfig}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {error && <div className="management-view__error">{error}</div>}

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${activeTab === 'general' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('general')}
            title="General (⌘1)"
          >
            General <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘1</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'agents' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('agents')}
            title="Agents (⌘2)"
          >
            Agents <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘2</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'workspaces' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('workspaces')}
            title="Workspaces (⌘3)"
          >
            Workspaces <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘3</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'prompts' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('prompts')}
            title="Prompts (⌘4)"
          >
            Prompts <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘4</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'notifications' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('notifications')}
            title="Notifications (⌘5)"
          >
            Notifications <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘5</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'advanced' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('advanced')}
            title="Advanced (⌘6)"
          >
            Advanced <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘6</span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'debug' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('debug')}
            title="Debug (⌘7)"
          >
            Debug <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘7</span>
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'agents' && (
            <div className="settings-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Agents</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Manage AI agents with custom prompts, models, and tools
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setShowImportModal(true)}
                  >
                    Import from Q
                  </button>
                  {onCreateAgent && (
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={onCreateAgent}
                    >
                      + New Agent
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {agents.map((agent) => (
                  <div
                    key={agent.slug}
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    onClick={() => onEditAgent?.(agent.slug)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{agent.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {agent.slug}
                        </div>
                      </div>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'var(--accent-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                        }}
                      >
                        {getAgentIcon(agent).display}
                      </div>
                    </div>
                    {agent.description && (
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {agent.description.length > 100 ? `${agent.description.substring(0, 100)}...` : agent.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                      {(agent.model || config.defaultModel) && (() => {
                        const modelId = typeof agent.model === 'string' ? agent.model : config.defaultModel;
                        const isInherited = !agent.model && config.defaultModel;
                        const modelInfo = availableModels.find(m => m.id === modelId);
                        
                        return (
                          <div
                            style={{
                              fontSize: '12px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'var(--color-bg)',
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              alignItems: 'flex-start'
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>
                              {modelInfo?.name || modelId?.split('.').pop()?.split('-')[0] || 'model'}
                              {isInherited && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>(inherited)</span>}
                            </div>
                            <div style={{ fontSize: '10px', opacity: 0.6 }}>
                              {modelId}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'workspaces' && (
            <div className="settings-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Workspaces</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Organize your work with custom layouts and quick prompts
                  </p>
                </div>
                {onCreateWorkspace && (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={onCreateWorkspace}
                  >
                    + New Workspace
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {workspaces.map((workspace) => (
                  <div
                    key={workspace.slug}
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    onClick={() => onEditWorkspace?.(workspace.slug)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: 'var(--accent-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: getWorkspaceIcon(workspace).isCustomIcon ? '24px' : '16px',
                          fontWeight: getWorkspaceIcon(workspace).isCustomIcon ? 'normal' : 600,
                          flexShrink: 0,
                          color: getWorkspaceIcon(workspace).isCustomIcon ? 'inherit' : 'var(--color-bg)',
                        }}
                      >
                        {getWorkspaceIcon(workspace).display}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{workspace.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {workspace.tabCount} tab{workspace.tabCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    {workspace.description && (
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        {workspace.description.length > 100 ? `${workspace.description.substring(0, 100)}...` : workspace.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'prompts' && (
            <div className="settings-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Global Prompts</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Create reusable prompts for workspaces and agent commands
                  </p>
                </div>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setEditingPrompt({ id: '', name: '', prompt: '', params: [] })}
                >
                  + New Prompt
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {prompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    onClick={() => setEditingPrompt(prompt)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{prompt.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {prompt.id}
                        </div>
                      </div>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'var(--accent-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                        }}
                      >
                        💬
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {prompt.prompt.length > 100 ? `${prompt.prompt.substring(0, 100)}...` : prompt.prompt}
                    </div>
                    {prompt.params && prompt.params.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {prompt.params.map((param: any) => (
                          <span
                            key={param.name}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'var(--color-bg)',
                              color: 'var(--text-secondary)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {'{{'}{param.name}{'}}'}{param.required === false ? '?' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {prompts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                  <p>No prompts yet. Create your first reusable prompt.</p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'general' && (
            <div className="settings-panel">
              <div className="form-group">
                <label htmlFor="apiEndpoint">API Endpoint</label>
                <input
                  id="apiEndpoint"
                  type="text"
                  value={config.apiEndpoint || ''}
                  onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
                  placeholder="http://localhost:3141"
                />
                <span className="form-help">
                  Base URL for the backend API. Leave empty to use default.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="defaultModel">Default Model</label>
                <ModelSelector
                  value={config.defaultModel || ''}
                  onChange={(modelId) => setConfig({ ...config, defaultModel: modelId })}
                  placeholder="Select a model..."
                />
                <span className="form-help">
                  Default model for agents that don't specify one.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="systemPrompt">Global System Prompt</label>
                <textarea
                  id="systemPrompt"
                  value={config.systemPrompt || ''}
                  onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                  placeholder="You are Project Stallion, an AI assistant designed to help users..."
                  rows={8}
                />
                <span className="form-help">
                  Global instructions prepended to all agent prompts. Agents can override this with their own instructions.
                  Use template variables like {'{{date}}'}, {'{{time}}'}, or custom variables defined below.
                </span>
              </div>

              <div className="form-group">
                <label>Template Variables</label>
                <div className="template-variables-list">
                  {(config.templateVariables || []).map((variable, index) => (
                    <div key={index} className="template-variable-item">
                      <input
                        type="text"
                        value={variable.key}
                        onChange={(e) => {
                          const updated = [...(config.templateVariables || [])];
                          updated[index] = { ...variable, key: e.target.value };
                          setConfig({ ...config, templateVariables: updated });
                        }}
                        placeholder="variable_name"
                      />
                      <select
                        value={variable.type}
                        onChange={(e) => {
                          const updated = [...(config.templateVariables || [])];
                          updated[index] = { ...variable, type: e.target.value as any };
                          setConfig({ ...config, templateVariables: updated });
                        }}
                      >
                        <option value="static">Static</option>
                        <option value="date">Date</option>
                        <option value="time">Time</option>
                        <option value="datetime">DateTime</option>
                        <option value="custom">Custom</option>
                      </select>
                      {(variable.type === 'static' || variable.type === 'custom') ? (
                        <input
                          type="text"
                          value={variable.value || ''}
                          onChange={(e) => {
                            const updated = [...(config.templateVariables || [])];
                            updated[index] = { ...variable, value: e.target.value };
                            setConfig({ ...config, templateVariables: updated });
                          }}
                          placeholder="Value"
                        />
                      ) : (
                        <input
                          type="text"
                          value={variable.format || ''}
                          onChange={(e) => {
                            const updated = [...(config.templateVariables || [])];
                            updated[index] = { ...variable, format: e.target.value };
                            setConfig({ ...config, templateVariables: updated });
                          }}
                          placeholder="Format (optional)"
                        />
                      )}
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => {
                          const updated = (config.templateVariables || []).filter((_, i) => i !== index);
                          setConfig({ ...config, templateVariables: updated });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => {
                      const updated = [...(config.templateVariables || []), { key: '', type: 'static' as const, value: '' }];
                      setConfig({ ...config, templateVariables: updated });
                    }}
                  >
                    Add Variable
                  </button>
                </div>
                <div className="form-help">
                  <strong>Built-in variables (always available):</strong>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    <li><code>{'{{date}}'}</code> - Full date (e.g., "Monday, January 27, 2025")</li>
                    <li><code>{'{{time}}'}</code> - Current time (e.g., "11:52:00 PM")</li>
                    <li><code>{'{{datetime}}'}</code> - Date and time combined</li>
                    <li><code>{'{{iso_date}}'}</code> - ISO date (e.g., "2025-01-27")</li>
                    <li><code>{'{{year}}'}</code>, <code>{'{{month}}'}</code>, <code>{'{{day}}'}</code>, <code>{'{{weekday}}'}</code></li>
                  </ul>
                  <strong style={{ display: 'block', marginTop: '12px' }}>Custom variable types:</strong>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    <li><strong>Static:</strong> Fixed text value (e.g., company name, version)</li>
                    <li><strong>Date/Time/DateTime:</strong> Dynamic date/time with optional format JSON</li>
                    <li><strong>Custom:</strong> For future extensibility (environment variables, API calls)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="settings-panel">
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Meeting Notifications</h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Configure when and how you receive notifications for upcoming meetings
                </p>
              </div>

              <div className="form-group">
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '16px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: '1px solid var(--color-border)',
                  transition: 'all 0.2s ease'
                }}>
                  <input
                    type="checkbox"
                    checked={config.meetingNotifications?.enabled !== false}
                    onChange={(e) => setConfig({
                      ...config,
                      meetingNotifications: {
                        ...config.meetingNotifications,
                        enabled: e.target.checked
                      }
                    })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>Enable meeting notifications</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Show toast notifications when viewing a different date and you have upcoming meetings today
                    </div>
                  </div>
                </label>
              </div>

              {config.meetingNotifications?.enabled !== false && (
                <div className="form-group" style={{ marginTop: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500 }}>
                    Notification Timing
                  </label>
                  <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Select when to show notifications before meetings start
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                    {[30, 15, 10, 5, 1].map(threshold => (
                      <label 
                        key={threshold} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '10px',
                          padding: '12px 16px',
                          background: (config.meetingNotifications?.thresholds || [30, 10, 1]).includes(threshold)
                            ? 'var(--color-primary-alpha)'
                            : 'var(--color-bg-secondary)',
                          border: `1px solid ${(config.meetingNotifications?.thresholds || [30, 10, 1]).includes(threshold)
                            ? 'var(--color-primary)'
                            : 'var(--color-border)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(config.meetingNotifications?.thresholds || [30, 10, 1]).includes(threshold)}
                          onChange={(e) => {
                            const current = config.meetingNotifications?.thresholds || [30, 10, 1];
                            const updated = e.target.checked
                              ? [...current, threshold].sort((a, b) => b - a)
                              : current.filter(t => t !== threshold);
                            setConfig({
                              ...config,
                              meetingNotifications: {
                                ...config.meetingNotifications,
                                thresholds: updated
                              }
                            });
                          }}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 500 }}>{threshold} min</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="settings-panel">
              <div className="form-group">
                <label htmlFor="region">AWS Region</label>
                <input
                  id="region"
                  type="text"
                  value={config.region || ''}
                  onChange={(e) => setConfig({ ...config, region: e.target.value })}
                  placeholder="us-east-1"
                />
                <span className="form-help">AWS region for Bedrock API calls.</span>
              </div>

              <div className="form-group">
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => setShowResetModal(true)}
                >
                  Reset to Defaults
                </button>
                <span className="form-help">
                  Restore all settings to factory defaults. This action cannot be undone.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="settings-panel">
              <div className="form-group">
                <label htmlFor="logLevel">Log Level</label>
                <select
                  id="logLevel"
                  value={config.logLevel || 'info'}
                  onChange={(e) => setConfig({ ...config, logLevel: e.target.value })}
                >
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                  <option value="trace">Trace</option>
                </select>
                <span className="form-help">
                  Logging verbosity level. Higher levels include more details.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showResetModal}
        title="Reset to Defaults"
        message="Are you sure you want to reset all settings to factory defaults? This action cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={resetToDefaults}
        onCancel={() => setShowResetModal(false)}
      />

      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
              <h3 style={{ margin: 0 }}>Import Agent from Q Developer</h3>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {!selectedQAgent ? (
                <div>
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Select an agent from Q Developer CLI to import
                  </p>
                  <button
                    type="button"
                    className="button button--secondary"
                    style={{ marginBottom: '16px' }}
                    onClick={async () => {
                      try {
                        const response = await fetch(`${apiBase}/q-agents`);
                        const data = await response.json();
                        if (!data.success) {
                          alert(data.error || 'Failed to load Q agents. Make sure Q Developer CLI is configured at ~/.aws/amazonq/cli-agents.json');
                          return;
                        }
                        setQAgents(data.agents || []);
                        if (data.agents.length === 0) {
                          alert('No Q Developer agents found. Make sure you have agents configured in Q Developer CLI.');
                        }
                      } catch (err: any) {
                        alert('Error loading Q agents: ' + err.message);
                      }
                    }}
                  >
                    Load Q Agents
                  </button>
                  {qAgents.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {qAgents.map((agent, idx) => (
                        <button
                          key={idx}
                          type="button"
                          style={{
                            padding: '12px',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            background: 'var(--bg-secondary)',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setSelectedQAgent(agent);
                            setImportForm({
                              name: agent.name,
                              slug: agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            });
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>{agent.name}</div>
                          <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {agent.instructions?.substring(0, 100)}...
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="form-group">
                    <label>Agent Name</label>
                    <input
                      type="text"
                      value={importForm.name}
                      onChange={(e) => setImportForm({ ...importForm, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Slug</label>
                    <input
                      type="text"
                      value={importForm.slug}
                      onChange={(e) => setImportForm({ ...importForm, slug: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-primary)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setShowImportModal(false);
                  setSelectedQAgent(null);
                  setQAgents([]);
                }}
              >
                Cancel
              </button>
              {selectedQAgent && (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={async () => {
                    try {
                      const response = await fetch(`${apiBase}/agents`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          slug: importForm.slug,
                          name: importForm.name,
                          prompt: selectedQAgent.instructions,
                        }),
                      });
                      if (!response.ok) throw new Error('Import failed');
                      setShowImportModal(false);
                      setSelectedQAgent(null);
                      setQAgents([]);
                      loadAgents();
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                >
                  Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editingPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setEditingPrompt(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
              <h3 style={{ margin: 0 }}>{editingPrompt.id ? 'Edit Prompt' : 'New Prompt'}</h3>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div className="form-group">
                <label>Prompt ID</label>
                <input
                  type="text"
                  value={editingPrompt.id}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, id: e.target.value })}
                  placeholder="my-prompt"
                  disabled={!!editingPrompt.id}
                />
                <span className="form-help">Unique identifier (lowercase, hyphens only)</span>
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editingPrompt.name}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                  placeholder="My Prompt"
                />
              </div>
              <div className="form-group">
                <label>Prompt Template</label>
                <textarea
                  value={editingPrompt.prompt}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
                  placeholder="Enter your prompt template. Use {{paramName}} for parameters."
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
                <span className="form-help">Use {'{{'} and {'}}'}  for parameters</span>
              </div>
            </div>
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-primary)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditingPrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  // TODO: Save prompt to backend
                  alert('Prompt saving not yet implemented - backend endpoint needed');
                  setEditingPrompt(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
