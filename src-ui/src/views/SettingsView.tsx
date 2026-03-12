import { QRDisplay, useConnections, useHostUrl } from '@stallion-ai/connect';
import './SettingsView.css';
import './page-layout.css';
import { useInvalidateQuery } from '@stallion-ai/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ModelSelector } from '../components/ModelSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { Toggle } from '../components/Toggle';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useConfig, useConfigActions } from '../contexts/ConfigContext';
import { useMessageContextContext } from '../contexts/MessageContextContext';
import { useVoiceProviderContext } from '../contexts/VoiceProviderContext';
import { useCloseShortcut } from '../hooks/useCloseShortcut';
import type { FeatureSettings } from '../hooks/useFeatureSettings';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { AppConfig, NavigationView } from '../types';
import './SettingsView.css';

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
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
            Showing localhost — your device may not be able to reach this
            address. Make sure both devices are on the same network and use your
            computer's LAN IP.
          </div>
        )}
        <span className="form-help">
          Scan this QR code with the mobile app to connect to this server
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
}

/* ── Environment Status ── */

function EnvironmentStatus({ apiBase }: { apiBase: string }) {
  const [expanded, setExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState<Set<string>>(new Set());

  const { data: prerequisites = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['system-status'],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/system/status`);
      const data = await r.json();
      return data.prerequisites || [];
    },
    enabled: !!apiBase,
  });

  useEffect(() => {
    if (!Array.isArray(prerequisites)) {
      console.warn(
        '[EnvironmentStatus] prerequisites is not an array:',
        typeof prerequisites,
        prerequisites,
      );
      return;
    }
    if (
      prerequisites.some(
        (p: any) => p.category === 'required' && p.status !== 'installed',
      )
    ) {
      setExpanded(true);
    }
  }, [prerequisites]);

  if (loading || !Array.isArray(prerequisites) || prerequisites.length === 0)
    return null;

  const allRequiredMet = prerequisites
    .filter((p: any) => p.category === 'required')
    .every((p: any) => p.status === 'installed');
  const missingCount = prerequisites.filter(
    (p: any) => p.status !== 'installed',
  ).length;

  const toggleGuide = (id: string) =>
    setGuideOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const icon = (status: string) =>
    status === 'installed' ? '✓' : status === 'error' ? '⚠' : '✗';
  const iconColor = (status: string) =>
    status === 'installed'
      ? 'var(--success-text)'
      : status === 'error'
        ? 'var(--warning-text)'
        : 'var(--error-text)';

  const stripClass = allRequiredMet
    ? 'settings__env'
    : 'settings__env settings__env--error';

  // Group by source
  const grouped = new Map<string, any[]>();
  for (const p of prerequisites) {
    const src = p.source || 'Core';
    if (!grouped.has(src)) grouped.set(src, []);
    grouped.get(src)!.push(p);
  }

  const renderItem = (p: any) => (
    <div key={p.id}>
      <div
        className="settings__env-item"
        style={{
          cursor:
            p.status !== 'installed' && p.installGuide ? 'pointer' : 'default',
        }}
        onClick={() =>
          p.status !== 'installed' && p.installGuide && toggleGuide(p.id)
        }
      >
        <span
          className="settings__env-status"
          style={{ color: iconColor(p.status) }}
        >
          {icon(p.status)}
        </span>
        <span>
          <span className="settings__env-name">{p.name}</span>
          <span className="settings__env-desc"> — {p.description}</span>
          {p.category === 'optional' && (
            <span className="settings__env-optional"> (optional)</span>
          )}
        </span>
      </div>
      {guideOpen.has(p.id) && p.installGuide && (
        <div className="settings__env-guide">
          <ol>
            {p.installGuide.steps.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {p.installGuide.commands?.length > 0 && (
            <div className="settings__env-guide-cmds">
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
    <>
      <div className={stripClass}>
        <span className="settings__env-icon">{allRequiredMet ? '●' : '○'}</span>
        <span className="settings__env-label">
          {allRequiredMet
            ? 'Environment Ready'
            : `${missingCount} issue${missingCount !== 1 ? 's' : ''} to resolve`}
        </span>
        <button
          type="button"
          className="settings__env-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="settings__env-panel">
          {[...grouped.entries()].map(([source, items]) => (
            <div key={source}>
              <div className="settings__env-source">{source}</div>
              {items.map(renderItem)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Core Update Check ── */

function CoreUpdateCheck({ apiBase }: { apiBase: string }) {
  const [status, setStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setMessage(null);
    setStatus(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${apiBase}/api/system/core-update`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
      } else {
        setStatus(data);
      }
    } catch (e: any) {
      setMessage(
        e.name === 'AbortError'
          ? 'Timed out — could not reach git remote'
          : e.message,
      );
    } finally {
      clearTimeout(timeout);
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
      <div className="settings__update-row">
        <button
          type="button"
          className="settings__update-btn settings__update-btn--check"
          onClick={check}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check for Updates'}
        </button>
        {status?.updateAvailable && (
          <button
            type="button"
            className="settings__update-btn settings__update-btn--apply"
            onClick={update}
            disabled={updating}
          >
            {updating
              ? 'Updating…'
              : `Update (${status.behind} commit${status.behind !== 1 ? 's' : ''} behind)`}
          </button>
        )}
      </div>
      {checking && (
        <div className="settings__update-meta">
          <span>Fetching from remote…</span>
        </div>
      )}
      {status && (
        <div className="settings__update-meta">
          <span>Branch: {status.branch}</span>
          <span>·</span>
          <span>Current: {status.currentHash}</span>
          {status.updateAvailable && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--success-text)' }}>
                Latest: {status.remoteHash}
              </span>
            </>
          )}
          {!status.updateAvailable && status.ahead > 0 && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--warning-text)' }}>
                {status.ahead} commit{status.ahead !== 1 ? 's' : ''} ahead
              </span>
            </>
          )}
          {!status.updateAvailable && !status.ahead && status.currentHash && (
            <>
              <span>·</span>
              <span
                style={{
                  color: status.noUpstream
                    ? 'var(--text-muted)'
                    : 'var(--success-text)',
                }}
              >
                {status.noUpstream ? 'No upstream configured' : 'Up to date ✓'}
              </span>
            </>
          )}
        </div>
      )}
      {message && (
        <div
          className="settings__update-msg"
          style={{
            color: message.includes('Restart')
              ? 'var(--success-text)'
              : 'var(--error-text)',
          }}
        >
          {message}
        </div>
      )}
      <span className="settings__field-hint">
        Pull latest changes from the git remote. Requires a server restart.
      </span>
    </div>
  );
}

/* ── Section wrapper ── */

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings__section">
      <div className="settings__section-head">
        <span className="settings__section-icon">{icon}</span>
        <span className="settings__section-title">{title}</span>
      </div>
      <div className="settings__section-body">{children}</div>
    </div>
  );
}

// ─── Voice & Features Section ────────────────────────────────────────────────

/** Non-voice feature flags that remain in useFeatureSettings */
const FEATURE_META: Array<{
  key: keyof FeatureSettings;
  label: string;
  description: string;
  privacyNote?: string;
}> = [
  {
    key: 'voiceInputEnabled',
    label: 'Voice input',
    description:
      'Show the microphone button for speech-to-text input in chat and the global voice button.',
  },
  {
    key: 'mobilePairingEnabled',
    label: 'Mobile pairing & network discovery',
    description:
      'Show QR code and LAN discovery for connecting mobile devices to this server.',
    privacyNote: 'Detects your local IP address via WebRTC when enabled.',
  },
  {
    key: 'ttsReadbackEnabled',
    label: 'Read agent responses aloud (TTS)',
    description:
      'Automatically reads the latest assistant response via the selected TTS provider after each reply.',
  },
  {
    key: 'offlineQueueEnabled',
    label: 'Offline command queue',
    description:
      'Save messages in IndexedDB when the server is unreachable; auto-sends them when connectivity returns.',
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
  featureKey: keyof FeatureSettings;
  label: string;
  description: string;
  privacyNote?: string;
  checked: boolean;
  onToggle: (key: keyof FeatureSettings) => void;
}) {
  return (
    <div
      className="settings__feature-toggle"
      onClick={() => onToggle(featureKey)}
    >
      <Toggle
        checked={checked}
        onChange={() => onToggle(featureKey)}
        size="sm"
      />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
        {privacyNote && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-warning, #eab308)',
              marginTop: 3,
            }}
          >
            {privacyNote}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationSubscribeButton({ apiBase }: { apiBase: string }) {
  const { settings } = useFeatureSettings();
  const notifs = usePushNotifications({
    enabled: settings.pushNotificationsEnabled,
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
        <div
          style={{
            fontSize: 12,
            color: 'var(--error-text, #ef4444)',
            marginTop: 4,
          }}
        >
          {notifs.error}
        </div>
      )}
    </div>
  );
}

function VoiceFeaturesSection() {
  const { settings, toggle } = useFeatureSettings();
  const {
    availableSTT,
    availableTTS,
    activeSTT,
    activeTTS,
    setSTTProvider,
    setTTSProvider,
  } = useVoiceProviderContext();
  const { providers: contextProviders, toggleProvider } =
    useMessageContextContext();

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
              {p.name}
              {p.isSupported ? '' : ' (not available)'}
            </option>
          ))}
          {availableSTT.length === 0 && (
            <option value="">No STT providers registered</option>
          )}
        </select>
        <div className="voice-provider-section__hint">
          Using WisprFlow? Focus the chat input and press your hotkey — it
          injects text naturally.
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
              {p.name}
              {p.isSupported ? '' : ' (not available)'}
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
          <div className="context-provider-section__label">Message Context</div>
          {contextProviders.map((p) => (
            <div
              key={p.id}
              className="settings__feature-toggle"
              onClick={() => toggleProvider(p.id)}
            >
              <Toggle
                checked={p.enabled}
                onChange={() => toggleProvider(p.id)}
                size="sm"
              />
              <div>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                {p.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {p.description}
                  </div>
                )}
              </div>
            </div>
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
      {settings.mobilePairingEnabled && <MobilePairingSection />}
      <span className="form-help" style={{ marginTop: 8, display: 'block' }}>
        Voice provider selection and context settings are saved in this browser
        only. Install plugins to add ElevenLabs or Nova Sonic providers.
      </span>
    </div>
  );
}

export function SettingsView({
  onBack,
  onSaved,
  onNavigate,
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

  const [config, setConfig] = useState<AppConfig>(
    (configData as AppConfig) || {},
  );
  const [originalConfig, setOriginalConfig] = useState<AppConfig>(
    (configData as AppConfig) || {},
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'failed'
  >('idle');
  const [showResetModal, setShowResetModal] = useState(false);
  const { settings: featureSettings, toggle: toggleFeature } =
    useFeatureSettings();

  useEffect(() => {
    if (configData) {
      setConfig(configData as AppConfig);
      setOriginalConfig(configData as AppConfig);
    }
  }, [configData]);

  useCloseShortcut(onBack);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

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
      <div className="settings page page--narrow">
        {/* ── Header ── */}
        <div className="page__header">
          <div className="page__header-text">
            <div className="page__label">settings</div>
            <h1 className="page__title">Settings</h1>
          </div>
          <div className="page__actions">
            <button
              type="button"
              className="settings__secondary-btn"
              onClick={() => onNavigate?.({ type: 'monitoring' })}
            >
              Monitoring
            </button>
            <ThemeToggle />
          </div>
        </div>

        {error && <div className="settings__error">{error}</div>}

        {/* ── Environment Status ── */}
        <EnvironmentStatus apiBase={currentApiBase} />

        {/* ── AI & Models ── */}
        <Section icon="◆" title="AI & Models">
          <div className="settings__field">
            <label className="settings__field-label" htmlFor="defaultModel">
              Default Model
            </label>
            <ModelSelector
              value={config.defaultModel || ''}
              onChange={(modelId) =>
                setConfig({ ...config, defaultModel: modelId })
              }
              placeholder="Select a model…"
            />
            <span className="settings__field-hint">
              Default model for agents that don't specify one.
            </span>
          </div>

          <div className="settings__field">
            <label className="settings__field-label" htmlFor="systemPrompt">
              Global System Prompt
            </label>
            <textarea
              id="systemPrompt"
              value={config.systemPrompt || ''}
              onChange={(e) =>
                setConfig({ ...config, systemPrompt: e.target.value })
              }
              placeholder="Global instructions prepended to all agent prompts…"
              rows={6}
            />
            <span className="settings__field-hint">
              Agents can override this with their own instructions. Supports
              template variables like {'{{date}}'}, {'{{time}}'}, or custom
              variables below.
            </span>
          </div>

          <div className="settings__field">
            <label className="settings__field-label">Template Variables</label>
            <div className="settings__vars">
              {(config.templateVariables || []).map((variable, index) => (
                <div key={index} className="settings__var-row">
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
                  {variable.type === 'static' || variable.type === 'custom' ? (
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
                        updated[index] = {
                          ...variable,
                          format: e.target.value,
                        };
                        setConfig({ ...config, templateVariables: updated });
                      }}
                      placeholder="Format (optional)"
                    />
                  )}
                  <button
                    type="button"
                    className="settings__var-remove"
                    onClick={() => {
                      const updated = (config.templateVariables || []).filter(
                        (_, i) => i !== index,
                      );
                      setConfig({ ...config, templateVariables: updated });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="settings__var-add"
                onClick={() => {
                  const updated = [
                    ...(config.templateVariables || []),
                    { key: '', type: 'static' as const, value: '' },
                  ];
                  setConfig({ ...config, templateVariables: updated });
                }}
              >
                + Add Variable
              </button>
            </div>
            <div className="settings__var-ref">
              <strong>Built-in (always available):</strong>
              <ul>
                <li>
                  <code>{'{{date}}'}</code> Full date ·{' '}
                  <code>{'{{time}}'}</code> Current time ·{' '}
                  <code>{'{{datetime}}'}</code> Combined
                </li>
                <li>
                  <code>{'{{iso_date}}'}</code> ISO · <code>{'{{year}}'}</code>{' '}
                  <code>{'{{month}}'}</code> <code>{'{{day}}'}</code>{' '}
                  <code>{'{{weekday}}'}</code>
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* ── Appearance ── */}
        <Section icon="◐" title="Appearance">
          <div className="settings__field">
            <label className="settings__field-label" htmlFor="chatFontSize">
              Chat Font Size
            </label>
            <div className="settings__range-row">
              <input
                id="chatFontSize"
                type="range"
                min="10"
                max="24"
                value={config.defaultChatFontSize || 14}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    defaultChatFontSize: parseInt(e.target.value, 10),
                  })
                }
              />
              <span className="settings__range-value">
                {config.defaultChatFontSize || 14}px
              </span>
            </div>
            <span className="settings__field-hint">
              Font size for chat messages (10–24px).
            </span>
          </div>
        </Section>

        {/* ── Notifications ── */}
        <Section icon="◉" title="Notifications">
          <label className="settings__toggle-row">
            <Toggle
              checked={featureSettings.pushNotificationsEnabled}
              onChange={() => toggleFeature('pushNotificationsEnabled')}
            />
            <div>
              <div className="settings__toggle-label">Push notifications</div>
              <div className="settings__toggle-desc">
                Browser push notifications for tool approvals and high-priority
                alerts
              </div>
            </div>
          </label>
          {featureSettings.pushNotificationsEnabled && (
            <NotificationSubscribeButton apiBase={currentApiBase} />
          )}
        </Section>

        {/* ── Connection ── */}
        <Section icon="◇" title="Connection">
          <div className="settings__field">
            <label className="settings__field-label" htmlFor="apiBase">
              Backend API Base URL
            </label>
            <div className="settings__conn-row">
              <input
                id="apiBase"
                type="text"
                value={currentApiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="http://localhost:3141"
              />
              {isCustom && (
                <button
                  type="button"
                  className="settings__conn-reset"
                  onClick={resetToDefault}
                >
                  Reset
                </button>
              )}
            </div>
            <span className="settings__field-hint">
              Changes take effect immediately.
              {isCustom && (
                <span style={{ color: 'var(--warning-text)' }}>
                  {' '}
                  Using custom URL.
                </span>
              )}
            </span>
            <button
              type="button"
              className={`settings__conn-test${testStatus === 'success' ? ' settings__conn-test--ok' : testStatus === 'failed' ? ' settings__conn-test--fail' : ''}`}
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
                ? 'Testing…'
                : testStatus === 'success'
                  ? '✓ Connected'
                  : testStatus === 'failed'
                    ? '✗ Failed'
                    : 'Test Connection'}
            </button>
          </div>

          <div className="settings__field">
            <label className="settings__field-label" htmlFor="region">
              AWS Region
            </label>
            <input
              id="region"
              type="text"
              value={config.region || ''}
              onChange={(e) => setConfig({ ...config, region: e.target.value })}
              placeholder="us-east-1"
            />
            <span className="settings__field-hint">
              Region for Bedrock API calls.
            </span>
          </div>
        </Section>

        <VoiceFeaturesSection />

        {/* ── System ── */}
        <Section icon="⚙" title="System">
          <div className="settings__field">
            <label className="settings__field-label">Core App Updates</label>
            <CoreUpdateCheck apiBase={currentApiBase} />
          </div>

          <div className="settings__field">
            <label className="settings__field-label" htmlFor="logLevel">
              Log Level
            </label>
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
            <span className="settings__field-hint">
              Logging verbosity. Higher levels include more detail.
            </span>
          </div>

          <div className="settings__danger">
            <button
              type="button"
              className="settings__danger-btn"
              onClick={() => setShowResetModal(true)}
            >
              Reset to Defaults
            </button>
            <span className="settings__field-hint">
              Restore all settings to factory defaults. Cannot be undone.
            </span>
          </div>
        </Section>

        <div className="settings__build">
          {typeof __BUILD_HASH__ !== 'undefined'
            ? `build ${__BUILD_HASH__}`
            : ''}
        </div>
      </div>

      {hasChanges && (
        <div className="settings__save-pill">
          <span className="settings__save-pill-text">Unsaved changes</span>
          <button
            type="button"
            className="settings__save-pill-discard"
            onClick={() => setConfig(originalConfig)}
          >
            Discard
          </button>
          <button
            type="button"
            className="settings__save-pill-btn"
            onClick={saveConfig}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

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
