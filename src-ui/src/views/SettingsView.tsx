import { QRDisplay, useConnections, useHostUrl } from '@stallion-ai/connect';
import './SettingsView.css';
import { useInvalidateQuery } from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ModelSelector } from '../components/ModelSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useConfig, useConfigActions } from '../contexts/ConfigContext';
import { useMessageContextContext } from '../contexts/MessageContextContext';
import { useVoiceProviderContext } from '../contexts/VoiceProviderContext';
import { useApprovalNotifications } from '../hooks/useApprovalNotifications';
import { useCloseShortcut } from '../hooks/useCloseShortcut';
import type { MobileSettings } from '../hooks/useMobileSettings';
import { useMobileSettings } from '../hooks/useMobileSettings';
import { useTabKeyboardShortcuts } from '../hooks/useTabKeyboardShortcuts';
import type { AppConfig, NavigationView } from '../types';

function MobilePairingSection() {
  const { activeConnection } = useConnections();
  const serverPort = (() => {
    try {
      const url = new URL(activeConnection?.url || 'http://localhost:3141');
      return Number(url.port) || 3141;
    } catch {
      return 3141;
    }
  })();
  const { hostUrl, isDetecting } = useHostUrl({
    port: serverPort,
    fallback: activeConnection?.url || `http://localhost:${serverPort}`,
  });
  const isLocalhost =
    hostUrl.includes('localhost') || hostUrl.includes('127.0.0.1');

  return (
    <div className="form-group">
      <label>Mobile Pairing</label>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        {isDetecting ? (
          <div
            style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
          >
            Detecting local IP…
          </div>
        ) : (
          <QRDisplay url={hostUrl} size={160} label={hostUrl} />
        )}
        {isLocalhost && !isDetecting && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--color-warning, #eab308)',
              maxWidth: 320,
            }}
          >
            Showing localhost — your Android device may not be able to reach
            this address. Make sure both devices are on the same network and
            use your computer's LAN IP.
          </div>
        )}
        <span className="form-help">
          Scan this QR code with the Android app to connect to this server
          automatically.
        </span>
      </div>
    </div>
  );
}

export interface SettingsViewProps {
  onBack: () => void;
  onSaved?: () => void;
  onNavigate?: (view: NavigationView) => void;
  chatFontSize?: number;
  onChatFontSizeChange?: (size: number) => void;
}

function CoreUpdateCheck({ apiBase }: { apiBase: string }) {
  const [status, setStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/system/core-update`);
      setStatus(await res.json());
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setChecking(false);
    }
  };

  const update = async () => {
    setUpdating(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/system/core-update`, {
        method: 'POST',
      });
      const data = await res.json();
      setMessage(data.success ? data.message : data.error || 'Update failed');
      if (data.success) check();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={check}
          disabled={checking}
        >
          {checking ? 'Checking...' : 'Check for Updates'}
        </button>
        {status?.updateAvailable && (
          <button
            type="button"
            className="button button--primary button--small"
            onClick={update}
            disabled={updating}
          >
            {updating
              ? 'Updating...'
              : `Update (${status.behind} commit${status.behind !== 1 ? 's' : ''} behind)`}
          </button>
        )}
      </div>
      {status && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span>Branch: {status.branch || 'unknown'}</span>
          <span style={{ margin: '0 8px' }}>•</span>
          <span>Current: {status.currentHash || 'unknown'}</span>
          {status.updateAvailable && (
            <>
              <span style={{ margin: '0 8px' }}>•</span>
              <span style={{ color: '#22c55e' }}>
                Latest: {status.remoteHash}
              </span>
            </>
          )}
          {!status.updateAvailable && status.ahead > 0 && (
            <>
              <span style={{ margin: '0 8px' }}>•</span>
              <span style={{ color: '#eab308' }}>
                {status.ahead} commit{status.ahead !== 1 ? 's' : ''} ahead of
                remote
              </span>
            </>
          )}
          {!status.updateAvailable && !status.ahead && status.currentHash && (
            <>
              <span style={{ margin: '0 8px' }}>•</span>
              <span style={{ color: '#22c55e' }}>Up to date ✓</span>
            </>
          )}
        </div>
      )}
      {message && (
        <div
          style={{
            fontSize: '12px',
            marginTop: '6px',
            color: message.includes('Restart') ? '#22c55e' : '#ef4444',
          }}
        >
          {message}
        </div>
      )}
      <span
        className="form-help"
        style={{ marginTop: '8px', display: 'block' }}
      >
        Pull latest changes from the git remote. Requires a server restart to
        take effect.
      </span>
    </div>
  );
}

function OnboardingChecklist({ apiBase }: { apiBase: string }) {
  const [prerequisites, setPrerequisites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${apiBase}/api/system/status`)
      .then((r) => r.json())
      .then((data) => setPrerequisites(data.prerequisites || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  if (loading || prerequisites.length === 0) return null;

  const required = prerequisites.filter((p: any) => p.category === 'required');
  const optional = prerequisites.filter((p: any) => p.category === 'optional');
  const allRequiredMet = required.every((p: any) => p.status === 'installed');

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statusIcon = (status: string) => {
    if (status === 'installed')
      return <span style={{ color: '#22c55e' }}>✓</span>;
    if (status === 'error') return <span style={{ color: '#eab308' }}>⚠</span>;
    return <span style={{ color: '#ef4444' }}>✗</span>;
  };

  const renderItem = (p: any) => (
    <div key={p.id} style={{ marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor:
            p.status !== 'installed' && p.installGuide ? 'pointer' : 'default',
        }}
        onClick={() =>
          p.status !== 'installed' && p.installGuide && toggleExpand(p.id)
        }
      >
        {statusIcon(p.status)}
        <span style={{ fontWeight: 500 }}>{p.name}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {p.description}
        </span>
        {p.status !== 'installed' && p.installGuide && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              marginLeft: 'auto',
            }}
          >
            {expanded.has(p.id) ? '▾' : '▸'}
          </span>
        )}
      </div>
      {expanded.has(p.id) && p.installGuide && (
        <div
          style={{
            marginLeft: '24px',
            marginTop: '6px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          <ol style={{ margin: '0 0 6px 0', paddingLeft: '18px' }}>
            {p.installGuide.steps.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {p.installGuide.commands?.length > 0 && (
            <div
              style={{
                background: 'var(--color-bg-secondary)',
                padding: '6px 10px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {p.installGuide.commands.map((cmd: string, i: number) => (
                <div key={i}>$ {cmd}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="form-group">
      <label>
        {allRequiredMet ? '✓ Environment Ready' : 'Environment Setup'}
      </label>
      {required.length > 0 && (
        <div style={{ marginBottom: optional.length > 0 ? '12px' : 0 }}>
          {required.map(renderItem)}
        </div>
      )}
      {optional.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
              fontWeight: 500,
            }}
          >
            Optional
          </div>
          {optional.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ─── Voice & Features Section ────────────────────────────────────────────────

/** Non-voice feature flags that remain in useMobileSettings */
const FEATURE_META: Array<{
  key: keyof MobileSettings;
  label: string;
  description: string;
  privacyNote?: string;
}> = [
  {
    key: 'ttsReadbackEnabled',
    label: 'Read agent responses aloud (TTS)',
    description: "Automatically reads the latest assistant response via the selected TTS provider after each reply.",
  },
  {
    key: 'offlineQueueEnabled',
    label: 'Offline command queue',
    description: 'Save messages in IndexedDB when the server is unreachable; auto-sends them when connectivity returns.',
  },
  {
    key: 'approvalNotificationsEnabled',
    label: 'Tool-approval push notifications',
    description: 'Receive browser push notifications (with Allow/Deny buttons) when an agent needs your approval to run a tool.',
    privacyNote: 'Requires notification permission and HTTPS. See server docs to configure VAPID keys.',
  },
];

function FeatureToggle({
  featureKey,
  label,
  description,
  privacyNote,
  checked,
  onToggle,
}: {
  featureKey: keyof MobileSettings;
  label: string;
  description: string;
  privacyNote?: string;
  checked: boolean;
  onToggle: (key: keyof MobileSettings) => void;
}) {
  const id = `feature-${featureKey}`;
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--border-primary)',
        cursor: 'pointer',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(featureKey)}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {description}
        </div>
        {privacyNote && (
          <div style={{ fontSize: 11, color: 'var(--color-warning, #eab308)', marginTop: 3 }}>
            {privacyNote}
          </div>
        )}
      </div>
    </label>
  );
}

function NotificationSubscribeButton({ apiBase }: { apiBase: string }) {
  const { settings } = useMobileSettings();
  const notifs = useApprovalNotifications({
    enabled: settings.approvalNotificationsEnabled,
    apiBase,
  });

  if (!notifs.supported) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {notifs.subscribed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--success-text, #22c55e)' }}>
            ✓ Subscribed to push notifications
          </span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={notifs.unsubscribe}
          >
            Unsubscribe
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={notifs.subscribe}
          disabled={notifs.permission === 'denied'}
        >
          {notifs.permission === 'denied'
            ? 'Notifications blocked by browser'
            : 'Enable push notifications'}
        </button>
      )}
      {notifs.error && (
        <div style={{ fontSize: 12, color: 'var(--error-text, #ef4444)', marginTop: 4 }}>
          {notifs.error}
        </div>
      )}
    </div>
  );
}

function VoiceFeaturesSection({ apiBase }: { apiBase: string }) {
  const { settings, toggle } = useMobileSettings();
  const { availableSTT, availableTTS, activeSTT, activeTTS, setSTTProvider, setTTSProvider } =
    useVoiceProviderContext();
  const { providers: contextProviders, toggleProvider } = useMessageContextContext();

  return (
    <div className="form-group">
      <label>Voice Providers</label>

      {/* STT provider */}
      <div className="voice-provider-section">
        <div className="voice-provider-section__label">
          Speech-to-text (microphone input)
        </div>
        <select
          className="voice-provider-section__select"
          data-testid="stt-provider-select"
          value={activeSTT?.id ?? ''}
          onChange={(e) => setSTTProvider(e.target.value)}
        >
          {availableSTT.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isSupported ? '' : ' (not available)'}
            </option>
          ))}
          {availableSTT.length === 0 && (
            <option value="">No STT providers registered</option>
          )}
        </select>
        <div className="voice-provider-section__hint">
          Using WisprFlow? Focus the chat input and press your hotkey — it injects text naturally.
        </div>
      </div>

      {/* TTS provider */}
      <div className="voice-provider-section">
        <div className="voice-provider-section__label">
          Text-to-speech (agent readback)
        </div>
        <select
          className="voice-provider-section__select"
          data-testid="tts-provider-select"
          value={activeTTS?.id ?? ''}
          onChange={(e) => setTTSProvider(e.target.value)}
        >
          {availableTTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isSupported ? '' : ' (not available)'}
            </option>
          ))}
          {availableTTS.length === 0 && (
            <option value="">No TTS providers registered</option>
          )}
        </select>
      </div>

      {/* Context providers */}
      {contextProviders.length > 0 && (
        <div className="context-provider-section">
          <div className="context-provider-section__label">
            Message Context
          </div>
          {contextProviders.map((p) => (
            <label key={p.id} className="context-provider-toggle">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={() => toggleProvider(p.id)}
              />
              {p.name}
            </label>
          ))}
        </div>
      )}

      {/* Remaining feature flags */}
      <div>
        {FEATURE_META.map((f) => (
          <FeatureToggle
            key={f.key}
            featureKey={f.key}
            label={f.label}
            description={f.description}
            privacyNote={f.privacyNote}
            checked={settings[f.key]}
            onToggle={toggle}
          />
        ))}
      </div>
      {settings.approvalNotificationsEnabled && (
        <NotificationSubscribeButton apiBase={apiBase} />
      )}
      <span className="form-help" style={{ marginTop: 8, display: 'block' }}>
        Voice provider selection and context settings are saved in this browser only.
        Install plugins to add ElevenLabs or Nova Sonic providers.
      </span>
    </div>
  );
}

export function SettingsView({
  onBack,
  onSaved,
  onNavigate,
  chatFontSize = 14,
  onChatFontSizeChange,
}: SettingsViewProps) {
  const {
    apiBase: currentApiBase,
    setApiBase,
    resetToDefault,
    isCustom,
  } = useApiBase();

  const configData = useConfig();
  const { updateConfig } = useConfigActions();
  const invalidate = useInvalidateQuery();

  const [activeTab, setActiveTab] = useState<
    'general' | 'notifications' | 'advanced' | 'debug'
  >(() => {
    const hash = window.location.hash.slice(1);
    const validTabs = [
      'general',
      'notifications',
      'advanced',
      'debug',
    ] as const;
    return hash && validTabs.includes(hash as (typeof validTabs)[number])
      ? (hash as (typeof validTabs)[number])
      : 'general';
  });
  const [config, setConfig] = useState<AppConfig>(configData || {});
  const [originalConfig, setOriginalConfig] = useState<AppConfig>(
    configData || {},
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'failed'
  >('idle');
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    if (configData) {
      setConfig(configData);
      setOriginalConfig(configData);
    }
  }, [configData]);

  const tabs = ['general', 'notifications', 'advanced', 'debug'] as const;

  useTabKeyboardShortcuts(tabs, activeTab, setActiveTab);
  useCloseShortcut(onBack);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  useEffect(() => {
    if (window.location.pathname.includes('/settings')) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  const saveConfig = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await updateConfig(config);
      setOriginalConfig(config);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = async () => {
    setShowResetModal(false);
    try {
      setIsSaving(true);
      setError(null);
      await updateConfig({});
      invalidate(['config']);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="management-view">
        <div className="management-view__header">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flex: 1,
            }}
          >
            <h2>Settings</h2>
            <ThemeToggle />
          </div>
          <div className="management-view__header-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onNavigate?.({ type: 'monitoring' })}
              title="Monitoring"
            >
              Monitoring
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
            General{' '}
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>
              ⌘1
            </span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'notifications' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('notifications')}
            title="Notifications (⌘2)"
          >
            Notifications{' '}
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>
              ⌘2
            </span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'advanced' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('advanced')}
            title="Advanced (⌘3)"
          >
            Advanced{' '}
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>
              ⌘3
            </span>
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'debug' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('debug')}
            title="Debug (⌘4)"
          >
            Debug{' '}
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>
              ⌘4
            </span>
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-panel">
              <OnboardingChecklist apiBase={currentApiBase} />
              <div className="form-group">
                <label htmlFor="defaultModel">Default Model</label>
                <ModelSelector
                  value={config.defaultModel || ''}
                  onChange={(modelId) =>
                    setConfig({ ...config, defaultModel: modelId })
                  }
                  placeholder="Select a model..."
                />
                <span className="form-help">
                  Default model for agents that don't specify one.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="chatFontSize">Chat Font Size</label>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
                >
                  <input
                    id="chatFontSize"
                    type="range"
                    min="10"
                    max="24"
                    value={chatFontSize}
                    onChange={(e) => {
                      const newSize = parseInt(e.target.value, 10);
                      onChatFontSizeChange?.(newSize);
                      setConfig({ ...config, defaultChatFontSize: newSize });
                    }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: '3rem', textAlign: 'right' }}>
                    {chatFontSize}px
                  </span>
                </div>
                <span className="form-help">
                  Default font size for chat messages (10-24px).
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="systemPrompt">Global System Prompt</label>
                <textarea
                  id="systemPrompt"
                  value={config.systemPrompt || ''}
                  onChange={(e) =>
                    setConfig({ ...config, systemPrompt: e.target.value })
                  }
                  placeholder="You are Project Stallion, an AI assistant designed to help users..."
                  rows={8}
                />
                <span className="form-help">
                  Global instructions prepended to all agent prompts. Agents can
                  override this with their own instructions. Use template
                  variables like {'{{date}}'}, {'{{time}}'}, or custom variables
                  defined below.
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
                          updated[index] = {
                            ...variable,
                            type: e.target.value as
                              | 'static'
                              | 'date'
                              | 'time'
                              | 'datetime'
                              | 'custom',
                          };
                          setConfig({ ...config, templateVariables: updated });
                        }}
                      >
                        <option value="static">Static</option>
                        <option value="date">Date</option>
                        <option value="time">Time</option>
                        <option value="datetime">DateTime</option>
                        <option value="custom">Custom</option>
                      </select>
                      {variable.type === 'static' ||
                      variable.type === 'custom' ? (
                        <input
                          type="text"
                          value={variable.value || ''}
                          onChange={(e) => {
                            const updated = [
                              ...(config.templateVariables || []),
                            ];
                            updated[index] = {
                              ...variable,
                              value: e.target.value,
                            };
                            setConfig({
                              ...config,
                              templateVariables: updated,
                            });
                          }}
                          placeholder="Value"
                        />
                      ) : (
                        <input
                          type="text"
                          value={variable.format || ''}
                          onChange={(e) => {
                            const updated = [
                              ...(config.templateVariables || []),
                            ];
                            updated[index] = {
                              ...variable,
                              format: e.target.value,
                            };
                            setConfig({
                              ...config,
                              templateVariables: updated,
                            });
                          }}
                          placeholder="Format (optional)"
                        />
                      )}
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => {
                          const updated = (
                            config.templateVariables || []
                          ).filter((_, i) => i !== index);
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
                      const updated = [
                        ...(config.templateVariables || []),
                        { key: '', type: 'static' as const, value: '' },
                      ];
                      setConfig({ ...config, templateVariables: updated });
                    }}
                  >
                    Add Variable
                  </button>
                </div>
                <div className="form-help">
                  <strong>Built-in variables (always available):</strong>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    <li>
                      <code>{'{{date}}'}</code> - Full date (e.g., "Monday,
                      January 27, 2025")
                    </li>
                    <li>
                      <code>{'{{time}}'}</code> - Current time (e.g., "11:52:00
                      PM")
                    </li>
                    <li>
                      <code>{'{{datetime}}'}</code> - Date and time combined
                    </li>
                    <li>
                      <code>{'{{iso_date}}'}</code> - ISO date (e.g.,
                      "2025-01-27")
                    </li>
                    <li>
                      <code>{'{{year}}'}</code>, <code>{'{{month}}'}</code>,{' '}
                      <code>{'{{day}}'}</code>, <code>{'{{weekday}}'}</code>
                    </li>
                  </ul>
                  <strong style={{ display: 'block', marginTop: '12px' }}>
                    Custom variable types:
                  </strong>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    <li>
                      <strong>Static:</strong> Fixed text value (e.g., company
                      name, version)
                    </li>
                    <li>
                      <strong>Date/Time/DateTime:</strong> Dynamic date/time
                      with optional format JSON
                    </li>
                    <li>
                      <strong>Custom:</strong> For future extensibility
                      (environment variables, API calls)
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="settings-panel">
              <div style={{ marginBottom: '32px' }}>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '18px',
                    fontWeight: 600,
                  }}
                >
                  Meeting Notifications
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Configure when and how you receive notifications for upcoming
                  meetings
                </p>
              </div>

              <div className="form-group">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: '1px solid var(--color-border)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={config.meetingNotifications?.enabled !== false}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        meetingNotifications: {
                          ...config.meetingNotifications,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                      Enable meeting notifications
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Show toast notifications when viewing a different date and
                      you have upcoming meetings today
                    </div>
                  </div>
                </label>
              </div>

              {config.meetingNotifications?.enabled !== false && (
                <div className="form-group" style={{ marginTop: '24px' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '12px',
                      fontWeight: 500,
                    }}
                  >
                    Notification Timing
                  </label>
                  <p
                    style={{
                      margin: '0 0 16px 0',
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Select when to show notifications before meetings start
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {[30, 15, 10, 5, 1].map((threshold) => (
                      <label
                        key={threshold}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '12px 16px',
                          background: (
                            config.meetingNotifications?.thresholds || [
                              30, 10, 1,
                            ]
                          ).includes(threshold)
                            ? 'var(--color-primary-alpha)'
                            : 'var(--color-bg-secondary)',
                          border: `1px solid ${
                            (
                              config.meetingNotifications?.thresholds || [
                                30, 10, 1,
                              ]
                            ).includes(threshold)
                              ? 'var(--color-primary)'
                              : 'var(--color-border)'
                          }`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(
                            config.meetingNotifications?.thresholds || [
                              30, 10, 1,
                            ]
                          ).includes(threshold)}
                          onChange={(e) => {
                            const current = config.meetingNotifications
                              ?.thresholds || [30, 10, 1];
                            const updated = e.target.checked
                              ? [...current, threshold].sort((a, b) => b - a)
                              : current.filter((t) => t !== threshold);
                            setConfig({
                              ...config,
                              meetingNotifications: {
                                ...config.meetingNotifications,
                                thresholds: updated,
                              },
                            });
                          }}
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                          }}
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
                <label htmlFor="apiBase">Backend API Base URL</label>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                  }}
                >
                  <input
                    id="apiBase"
                    type="text"
                    value={currentApiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder="http://localhost:3141"
                    style={{ flex: 1 }}
                  />
                  {isCustom && (
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={resetToDefault}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <span className="form-help">
                  Base URL for the backend API. Changes take effect immediately.
                  {isCustom && (
                    <span style={{ color: 'var(--color-warning)' }}>
                      {' '}
                      Using custom URL.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  style={{ marginTop: '8px' }}
                  disabled={testStatus === 'testing'}
                  onClick={async () => {
                    setTestStatus('testing');
                    try {
                      const res = await fetch(`${currentApiBase}/agents`);
                      setTestStatus(res.ok ? 'success' : 'failed');
                    } catch {
                      setTestStatus('failed');
                    }
                    setTimeout(() => setTestStatus('idle'), 3000);
                  }}
                >
                  {testStatus === 'testing'
                    ? 'Testing...'
                    : testStatus === 'success'
                      ? '✓ Connected'
                      : testStatus === 'failed'
                        ? '✗ Failed'
                        : 'Test Connection'}
                </button>
              </div>

              <MobilePairingSection />

              <VoiceFeaturesSection apiBase={currentApiBase} />

              <div className="form-group">
                <label htmlFor="region">AWS Region</label>
                <input
                  id="region"
                  type="text"
                  value={config.region || ''}
                  onChange={(e) =>
                    setConfig({ ...config, region: e.target.value })
                  }
                  placeholder="us-east-1"
                />
                <span className="form-help">
                  AWS region for Bedrock API calls.
                </span>
              </div>

              <div className="form-group">
                <label>Core App Updates</label>
                <CoreUpdateCheck apiBase={currentApiBase} />
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
                  Restore all settings to factory defaults. This action cannot
                  be undone.
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
                  onChange={(e) =>
                    setConfig({ ...config, logLevel: e.target.value })
                  }
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

      <div
        style={{
          padding: '12px 24px',
          textAlign: 'right',
          fontSize: '10px',
          color: 'var(--text-muted)',
          opacity: 0.4,
          fontFamily: 'monospace',
        }}
      >
        {typeof __BUILD_HASH__ !== 'undefined' ? `build ${__BUILD_HASH__}` : ''}
      </div>
    </>
  );
}
