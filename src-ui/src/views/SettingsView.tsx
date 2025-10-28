import { useState, useEffect } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { AppConfig } from '../types';

export interface SettingsViewProps {
  apiBase: string;
  onBack: () => void;
  onSaved?: () => void;
}

export function SettingsView({ apiBase, onBack, onSaved }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'advanced' | 'debug'>('general');
  const [config, setConfig] = useState<AppConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/config/app`);
      if (!response.ok) throw new Error('Failed to load configuration');
      const data = await response.json();
      setConfig(data.data || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
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
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
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
              disabled={isSaving}
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
          >
            General
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'advanced' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'debug' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('debug')}
          >
            Debug
          </button>
        </div>

        <div className="settings-content">
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
                <input
                  id="defaultModel"
                  type="text"
                  value={config.defaultModel || ''}
                  onChange={(e) => setConfig({ ...config, defaultModel: e.target.value })}
                  placeholder="anthropic.claude-3-7-sonnet-20250219-v1:0"
                />
                <span className="form-help">
                  Default model ID for agents that don't specify one.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="systemPrompt">Global System Prompt</label>
                <textarea
                  id="systemPrompt"
                  value={config.systemPrompt || ''}
                  onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                  placeholder="You are a Work Agent, an AI assistant designed to help users..."
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
                      <input
                        type="text"
                        value={variable.value || ''}
                        onChange={(e) => {
                          const updated = [...(config.templateVariables || [])];
                          updated[index] = { ...variable, value: e.target.value };
                          setConfig({ ...config, templateVariables: updated });
                        }}
                        placeholder={variable.type === 'static' || variable.type === 'custom' ? 'Value' : 'Format (optional)'}
                      />
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
    </>
  );
}
