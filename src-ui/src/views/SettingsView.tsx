import { QRDisplay, useConnections, useHostUrl } from '@stallion-ai/connect';
import './SettingsView.css';
import './page-layout.css';
import { useInvalidateQuery } from '@stallion-ai/sdk';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
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
      <div className="settings__pairing-content">
        {isDetecting ? (
          <div className="settings__pairing-detecting">Detecting local IP…</div>
        ) : (
          <QRDisplay url={hostUrl} size={160} label={hostUrl} />
        )}
        {isLocalhost && !isDetecting && (
          <div className="settings__pairing-warning">
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

interface Prerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'error' | 'missing';
  category: 'required' | 'optional';
  source?: string;
  installGuide?: { steps: string[]; commands?: string[] };
}

function EnvironmentStatus({ apiBase }: { apiBase: string }) {
  const [expanded, setExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState<Set<string>>(new Set());

  const { data: prerequisites = [], isLoading: loading } = useQuery<
    Prerequisite[]
  >({
    queryKey: ['system-status'],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/system/status`);
      const data = await r.json();
      return Array.isArray(data.prerequisites) ? data.prerequisites : [];
    },
    enabled: !!apiBase,
  });

  useEffect(() => {
    if (
      Array.isArray(prerequisites) &&
      prerequisites.some(
        (p) => p.category === 'required' && p.status !== 'installed',
      )
    ) {
      setExpanded(true);
    }
  }, [prerequisites]);

  if (loading || !Array.isArray(prerequisites) || prerequisites.length === 0)
    return null;

  const allRequiredMet = prerequisites
    .filter((p) => p.category === 'required')
    .every((p) => p.status === 'installed');
  const missingCount = prerequisites.filter(
    (p) => p.status !== 'installed',
  ).length;

  const toggleGuide = (id: string) =>
    setGuideOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const icon = (status: string) =>
    status === 'installed' ? '✓' : status === 'error' ? '⚠' : '✗';

  const stripClass = allRequiredMet
    ? 'settings__env'
    : 'settings__env settings__env--error';

  // Group by source
  const grouped = new Map<string, Prerequisite[]>();
  for (const p of prerequisites) {
    const src = p.source || 'Core';
    if (!grouped.has(src)) grouped.set(src, []);
    grouped.get(src)!.push(p);
  }

  const renderItem = (p: Prerequisite) => (
    <div key={p.id}>
      <div
        className={`settings__env-item${p.status !== 'installed' && p.installGuide ? ' settings__env-item--clickable' : ''}`}
        onClick={() =>
          p.status !== 'installed' && p.installGuide && toggleGuide(p.id)
        }
      >
        <span
          className={`settings__env-status settings__env-status--${p.status}`}
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
          {(p.installGuide.commands?.length ?? 0) > 0 && (
            <div className="settings__env-guide-cmds">
              {p.installGuide.commands?.map((cmd: string, i: number) => (
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
  const [restarting, setRestarting] = useState(false);

  const {
    data: status,
    isFetching: checking,
    error: checkError,
    refetch: check,
  } = useQuery<any>({
    queryKey: ['core-update-check'],
    queryFn: async ({ signal }) => {
      const res = await fetch(`${apiBase}/api/system/core-update`, { signal });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: false,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/system/core-update`, {
        method: 'POST',
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.restarting) {
        setRestarting(true);
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`${apiBase}/api/system/status`, {
              signal: AbortSignal.timeout(2000),
            });
            if (r.ok) {
              clearInterval(poll);
              setRestarting(false);
              check();
            }
          } catch {
            /* still restarting */
          }
        }, 1500);
      } else if (data.success) {
        check();
      }
    },
  });

  const message = restarting
    ? 'Updated — server restarting…'
    : updateMutation.error
      ? (updateMutation.error as Error).message
      : checkError
        ? (checkError as Error).message
        : null;

  return (
    <div>
      <div className="settings__update-row">
        <button
          type="button"
          className="settings__update-btn settings__update-btn--check"
          onClick={() => check()}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check for Updates'}
        </button>
        {status?.updateAvailable && (
          <button
            type="button"
            className="settings__update-btn settings__update-btn--apply"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || restarting}
          >
            {restarting
              ? 'Restarting…'
              : updateMutation.isPending
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
              <span className="settings__update-text--success">
                Latest: {status.remoteHash}
              </span>
            </>
          )}
          {!status.updateAvailable && status.ahead > 0 && (
            <>
              <span>·</span>
              <span className="settings__update-text--warning">
                {status.ahead} commit{status.ahead !== 1 ? 's' : ''} ahead
              </span>
            </>
          )}
          {!status.updateAvailable && !status.ahead && status.currentHash && (
            <>
              <span>·</span>
              <span
                className={`settings__update-text--${status.noUpstream ? 'muted' : 'success'}`}
              >
                {status.noUpstream ? 'No upstream configured' : 'Up to date ✓'}
              </span>
            </>
          )}
        </div>
      )}
      {message && (
        <div
          className={`settings__update-msg settings__update-msg--${restarting ? 'warning' : message.includes('Updated') ? 'success' : 'error'}`}
        >
          {message}
        </div>
      )}
      <span className="settings__field-hint">
        Pull latest changes from the git remote. Server restarts automatically
        after update.
      </span>
    </div>
  );
}

/* ── Section wrapper ── */

const ACCENT_PRESETS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
];
const ACCENT_STORAGE_KEY = 'stallion-accent-color';

function AccentColorPicker() {
  const [color, setColor] = useState(
    () => localStorage.getItem(ACCENT_STORAGE_KEY) || '',
  );

  const apply = (c: string) => {
    setColor(c);
    if (c) {
      localStorage.setItem(ACCENT_STORAGE_KEY, c);
      document.documentElement.style.setProperty('--accent-primary', c);
    } else {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
      document.documentElement.style.removeProperty('--accent-primary');
    }
  };

  return (
    <div className="settings__field">
      <label className="settings__field-label">Accent Color</label>
      <div className="settings__accent-row">
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`settings__accent-swatch${color === c ? ' settings__accent-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => apply(c)}
            aria-label={`Accent color ${c}`}
          />
        ))}
        <input
          type="color"
          className="settings__accent-custom"
          value={color || '#6366f1'}
          onChange={(e) => apply(e.target.value)}
          aria-label="Custom accent color"
        />
        {color && (
          <button
            type="button"
            className="settings__accent-reset"
            onClick={() => apply('')}
          >
            Reset
          </button>
        )}
      </div>
      <span className="settings__field-hint">
        Customize the UI accent color. Resets to default on clear.
      </span>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id?: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="settings__section">
      <div className="settings__section-head">
        <span className="settings__section-icon" aria-hidden="true">
          {icon}
        </span>
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
    key: 'voiceS2SEnabled',
    label: 'Voice pill (speech-to-speech)',
    description:
      'Show the floating voice pill for full-duplex speech-to-speech sessions with app control.',
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
  const descId = `feature-desc-${featureKey}`;
  return (
    <div
      className="settings__feature-toggle"
      onClick={() => onToggle(featureKey)}
    >
      <Toggle
        checked={checked}
        onChange={() => {}}
        size="sm"
        describedBy={descId}
      />
      <div>
        <div className="settings__toggle-name">{label}</div>
        <div className="settings__toggle-detail" id={descId}>
          {description}
        </div>
        {privacyNote && (
          <div className="settings__toggle-privacy">{privacyNote}</div>
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
    <div className="settings__notif-subscribe">
      {notifs.subscribed ? (
        <div className="settings__notif-subscribed">
          <span className="settings__notif-status">
            ✓ Subscribed to push notifications
          </span>
          <Button variant="secondary" size="sm" onClick={notifs.unsubscribe}>
            Unsubscribe
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={notifs.subscribe}
          disabled={notifs.permission === 'denied'}
        >
          {notifs.permission === 'denied'
            ? 'Notifications blocked by browser'
            : 'Enable push notifications'}
        </Button>
      )}
      {notifs.error && (
        <div className="settings__notif-error">{notifs.error}</div>
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
    <Section icon="🎙" title="Voice & Features" id="section-voice">
      {/* STT provider */}
      <div className="voice-provider-section">
        <label className="voice-provider-section__label" htmlFor="stt-provider">
          Speech-to-text (microphone input)
        </label>
        <select
          id="stt-provider"
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
        <label className="voice-provider-section__label" htmlFor="tts-provider">
          Text-to-speech (agent readback)
        </label>
        <select
          id="tts-provider"
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
              <Toggle checked={p.enabled} onChange={() => {}} size="sm" />
              <div>
                <div className="settings__toggle-name">{p.name}</div>
                {p.description && (
                  <div className="settings__toggle-detail">{p.description}</div>
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
      <span className="form-help settings__form-help-block">
        Voice provider selection and context settings are saved in this browser
        only. Install plugins to add ElevenLabs or Nova Sonic providers.
      </span>
    </Section>
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
  const { updateConfig, isSaving } = useConfigActions();
  const invalidate = useInvalidateQuery();

  const [config, setConfig] = useState<AppConfig>(
    (configData as AppConfig) || {},
  );
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'failed'
  >('idle');
  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${currentApiBase}/api/agents`);
      if (!res.ok) throw new Error('Connection failed');
    },
    onMutate: () => setTestStatus('testing'),
    onSuccess: () => {
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    },
    onError: () => {
      setTestStatus('failed');
      setTimeout(() => setTestStatus('idle'), 3000);
    },
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [apiBaseError, setApiBaseError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { settings: featureSettings, toggle: toggleFeature } =
    useFeatureSettings();

  const configJson = JSON.stringify(config);
  const baselineJson = JSON.stringify(configData || {});
  const hasChanges = configJson !== baselineJson;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-sync when server data changes, not on local edits
  useEffect(() => {
    if (configData && configJson === baselineJson) {
      setConfig(configData as AppConfig);
    }
  }, [configData]);

  useCloseShortcut(onBack);

  // ── Validation ──
  const validationErrors: Record<string, string> = {};
  if (config.region && !/^[a-z]{2}(-[a-z]+-\d+)?$/.test(config.region)) {
    validationErrors.region = 'Invalid region format (e.g. us-east-1)';
  }
  if ((config.systemPrompt || '').length > 10000) {
    validationErrors.systemPrompt = 'Exceeds 10,000 character limit';
  }
  for (const v of config.templateVariables || []) {
    if (!v.key.trim()) {
      validationErrors.templateVars = 'Variable names cannot be empty';
      break;
    }
    if (/\s/.test(v.key)) {
      validationErrors.templateVars = 'Variable names cannot contain spaces';
      break;
    }
  }
  const isValid = Object.keys(validationErrors).length === 0;

  const SECTION_TERMS: Record<string, string> = {
    'section-ai': 'ai models default model system prompt template variables',
    'section-appearance': 'appearance theme dark light font size accent color',
    'section-notifications': 'notifications push alerts subscribe',
    'section-connection': 'connection api url backend region test',
    'section-voice':
      'voice speech text tts stt features geolocation timezone mobile pairing offline queue',
    'section-system':
      'system update log level export import backup restore reset defaults',
  };
  const sectionVisible = (id: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return SECTION_TERMS[id]?.includes(q) ?? true;
  };

  const validationWarnings: Record<string, string> = {};
  for (const v of config.templateVariables || []) {
    if (v.type === 'static' && !v.value?.trim()) {
      validationWarnings.templateVarValues =
        'Static variables with empty values will resolve to blank';
      break;
    }
  }

  const saveConfig = async () => {
    if (!isValid) return;
    try {
      setError(null);
      await updateConfig(config);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetToDefaults = async () => {
    setShowResetModal(false);
    try {
      setError(null);
      await updateConfig({});
      invalidate(['config']);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!configData) {
    return (
      <div className="settings page page--narrow">
        <div className="page__header">
          <div className="page__header-text">
            <div className="page__label">settings</div>
            <h1 className="page__title">Settings</h1>
          </div>
        </div>
        <div className="settings__skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="settings__skeleton-section" />
          ))}
        </div>
      </div>
    );
  }

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

        {error && (
          <div className="settings__error-banner">
            <span className="settings__error-banner-msg">{error}</span>
            <button
              type="button"
              className="settings__error-banner-retry"
              onClick={saveConfig}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Section Nav ── */}
        <input
          type="text"
          className="settings__search"
          placeholder="Filter settings…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter settings"
        />
        <nav className="settings__section-nav" aria-label="Settings sections">
          {[
            ['#section-ai', 'AI & Models'],
            ['#section-appearance', 'Appearance'],
            ['#section-notifications', 'Notifications'],
            ['#section-connection', 'Connection'],
            ['#section-voice', 'Voice & Features'],
            ['#section-system', 'System'],
          ].map(([href, label]) => {
            const id = href.slice(1);
            if (!sectionVisible(id)) return null;
            return (
              <a key={id} href={href}>
                {label}
              </a>
            );
          })}
        </nav>

        {/* ── Environment Status ── */}
        <EnvironmentStatus apiBase={currentApiBase} />

        {/* ── AI & Models ── */}
        {sectionVisible('section-ai') && (
          <Section icon="◆" title="AI & Models" id="section-ai">
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
              <div
                className="settings__char-count"
                aria-live="polite"
                aria-atomic="true"
              >
                {(config.systemPrompt || '').length.toLocaleString()} / 10,000
              </div>
              {validationErrors.systemPrompt && (
                <span className="settings__field-error">
                  {validationErrors.systemPrompt}
                </span>
              )}
              <span className="settings__field-hint">
                Agents can override this with their own instructions. Supports
                template variables like {'{{date}}'}, {'{{time}}'}, or custom
                variables below.
              </span>
            </div>

            <div className="settings__field">
              <label className="settings__field-label">
                Template Variables
              </label>
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
                    {variable.type === 'static' ||
                    variable.type === 'custom' ? (
                      <input
                        type="text"
                        value={variable.value || ''}
                        onChange={(e) => {
                          const updated = [...(config.templateVariables || [])];
                          updated[index] = {
                            ...variable,
                            value: e.target.value,
                          };
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
                {validationErrors.templateVars && (
                  <span className="settings__field-error">
                    {validationErrors.templateVars}
                  </span>
                )}
                {validationWarnings.templateVarValues && (
                  <span className="settings__field-warning">
                    {validationWarnings.templateVarValues}
                  </span>
                )}
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
                    <code>{'{{iso_date}}'}</code> ISO ·{' '}
                    <code>{'{{year}}'}</code> <code>{'{{month}}'}</code>{' '}
                    <code>{'{{day}}'}</code> <code>{'{{weekday}}'}</code>
                  </li>
                </ul>
              </div>
            </div>
          </Section>
        )}

        {/* ── Appearance ── */}
        {sectionVisible('section-appearance') && (
          <Section icon="◐" title="Appearance" id="section-appearance">
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
            <div className="settings__field">
              <label className="settings__field-label">Theme</label>
              <div className="settings__theme-row">
                <ThemeToggle />
                <span className="settings__field-hint">
                  Toggle between light and dark mode.
                </span>
              </div>
            </div>
            <AccentColorPicker />
          </Section>
        )}

        {/* ── Notifications ── */}
        {sectionVisible('section-notifications') && (
          <Section icon="◉" title="Notifications" id="section-notifications">
            <label className="settings__toggle-row">
              <Toggle
                checked={featureSettings.pushNotificationsEnabled}
                onChange={() => toggleFeature('pushNotificationsEnabled')}
                describedBy="notif-desc"
              />
              <div>
                <div className="settings__toggle-label">Push notifications</div>
                <div className="settings__toggle-desc" id="notif-desc">
                  Browser push notifications for tool approvals and
                  high-priority alerts
                </div>
              </div>
            </label>
            {featureSettings.pushNotificationsEnabled && (
              <NotificationSubscribeButton apiBase={currentApiBase} />
            )}
          </Section>
        )}

        {/* ── Connection ── */}
        {sectionVisible('section-connection') && (
          <Section icon="◇" title="Connection" id="section-connection">
            <div className="settings__field">
              <label className="settings__field-label" htmlFor="apiBase">
                Backend API Base URL
              </label>
              <div className="settings__conn-row">
                <input
                  id="apiBase"
                  type="text"
                  value={currentApiBase}
                  onChange={(e) => {
                    const val = e.target.value;
                    try {
                      if (val) new URL(val);
                      setApiBaseError(null);
                      setApiBase(val);
                    } catch {
                      setApiBaseError('Invalid URL format');
                    }
                  }}
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
              {apiBaseError && (
                <span className="settings__field-error">{apiBaseError}</span>
              )}
              <span className="settings__field-hint">
                Changes take effect immediately.
                {isCustom && (
                  <span className="settings__conn-custom-warning">
                    {' '}
                    Using custom URL.
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-live="polite"
                className={`settings__conn-test${testStatus === 'success' ? ' settings__conn-test--ok' : testStatus === 'failed' ? ' settings__conn-test--fail' : ''}`}
                disabled={testStatus === 'testing'}
                onClick={() => testConnection.mutate()}
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
                className={
                  validationErrors.region ? 'settings__field--invalid' : ''
                }
                value={config.region || ''}
                onChange={(e) =>
                  setConfig({ ...config, region: e.target.value })
                }
                placeholder="us-east-1"
              />
              {validationErrors.region && (
                <span className="settings__field-error">
                  {validationErrors.region}
                </span>
              )}
              <span className="settings__field-hint">
                Region for Bedrock API calls.
              </span>
            </div>
          </Section>
        )}

        {sectionVisible('section-voice') && <VoiceFeaturesSection />}

        {/* ── System ── */}
        {sectionVisible('section-system') && (
          <Section icon="⚙" title="System" id="section-system">
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
                  setConfig({
                    ...config,
                    logLevel: e.target.value as AppConfig['logLevel'],
                  })
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

            <div className="settings__field">
              <label className="settings__field-label">Backup & Restore</label>
              <div className="settings__export-row">
                <button
                  type="button"
                  className="settings__secondary-btn"
                  onClick={() => {
                    const LOCAL_KEYS = [
                      'theme',
                      'stallion-feature-settings',
                      'stallion-stt-provider',
                      'stallion-tts-provider',
                    ];
                    const localSettings: Record<string, string> = {};
                    for (const k of LOCAL_KEYS) {
                      const v = localStorage.getItem(k);
                      if (v) localSettings[k] = v;
                    }
                    const full = { ...config, _localStorage: localSettings };
                    const blob = new Blob([JSON.stringify(full, null, 2)], {
                      type: 'application/json',
                    });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'stallion-settings.json';
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  Export Settings
                </button>
                <label className="settings__secondary-btn settings__import-label">
                  Import Settings
                  <input
                    type="file"
                    accept=".json"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const imported = JSON.parse(text);
                        const { _localStorage, ...serverConfig } = imported;
                        if (
                          _localStorage &&
                          typeof _localStorage === 'object'
                        ) {
                          for (const [k, v] of Object.entries(_localStorage)) {
                            if (typeof v === 'string')
                              localStorage.setItem(k, v);
                          }
                        }
                        setConfig({ ...config, ...serverConfig });
                      } catch {
                        setError('Invalid settings file');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <span className="settings__field-hint">
                Export current settings as JSON or import from a backup.
                Imported settings appear as unsaved changes.
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
        )}

        <div className="settings__build">
          {typeof __BUILD_HASH__ !== 'undefined'
            ? `build ${__BUILD_HASH__}`
            : ''}
        </div>
      </div>

      {hasChanges && (
        <div className="settings__save-pill" role="status" aria-live="polite">
          <span className="settings__save-pill-text">Unsaved changes</span>
          <button
            type="button"
            className="settings__save-pill-discard"
            onClick={() => setConfig((configData as AppConfig) || {})}
          >
            Discard
          </button>
          <button
            type="button"
            className="settings__save-pill-btn"
            onClick={saveConfig}
            disabled={isSaving || !isValid}
          >
            {isSaving ? 'Saving…' : !isValid ? 'Fix errors' : 'Save'}
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
