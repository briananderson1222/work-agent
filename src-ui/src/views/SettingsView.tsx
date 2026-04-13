import './SettingsView.css';
import './page-layout.css';
import { useInvalidateQuery } from '@stallion-ai/sdk';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ThemeToggle } from '../components/ThemeToggle';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useConfig, useConfigActions } from '../contexts/ConfigContext';
import { useCloseShortcut } from '../hooks/useCloseShortcut';
import { checkServerHealth } from '../lib/serverHealth';
import type { AppConfig, NavigationView } from '../types';
import { AccentColorPicker } from './settings/AccentColorPicker';
import { AIModelsSection } from './settings/AIModelsSection';
import { ConnectionSection } from './settings/ConnectionSection';
import { EnvironmentStatus } from './settings/EnvironmentStatus';
import { SettingsSection as Section } from './settings/SettingsSection';
import { SystemSection } from './settings/SystemSection';
import {
  buildSettingsExportPayload,
  getSettingsValidation,
  isSettingsSectionVisible,
  parseImportedSettingsFile,
} from './settings/utils';
import {
  NotificationsSection,
  VoiceFeaturesSection,
} from './settings/VoiceFeaturesSection';

export interface SettingsViewProps {
  onBack: () => void;
  onSaved?: () => void;
  onNavigate?: (view: NavigationView) => void;
}

function isBedrockScopedModel(modelId: string | undefined): boolean {
  if (!modelId) return false;
  return (
    /^(us|eu|ap|sa|ca|af|me)\./.test(modelId) ||
    /^(anthropic|amazon|meta|mistral|cohere|ai21)\./.test(modelId)
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
      const healthy = await checkServerHealth(currentApiBase);
      if (!healthy) throw new Error('Connection failed');
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
  const configJson = JSON.stringify(config);
  const baselineJson = JSON.stringify(configData || {});
  const hasChanges = configJson !== baselineJson;
  const showBedrockRegion =
    config.defaultLLMProvider === 'bedrock' ||
    (!config.defaultLLMProvider && isBedrockScopedModel(config.defaultModel));

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-sync when server data changes, not on local edits
  useEffect(() => {
    if (configData && configJson === baselineJson) {
      setConfig(configData as AppConfig);
    }
  }, [configData]);

  useCloseShortcut(onBack);

  const {
    errors: validationErrors,
    warnings: validationWarnings,
    isValid,
  } = getSettingsValidation(config);

  const exportSettings = () => {
    const payload = buildSettingsExportPayload(config);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'stallion-settings.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importSettings = async (file: File) => {
    try {
      const { serverConfig } = await parseImportedSettingsFile(file);
      setConfig({ ...config, ...serverConfig });
    } catch {
      setError('Invalid settings file');
    }
  };

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
            <div className="settings__header-shortcuts">
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
            if (!isSettingsSectionVisible(id, searchQuery)) return null;
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
        {isSettingsSectionVisible('section-ai', searchQuery) && (
          <AIModelsSection
            config={config}
            validationErrors={validationErrors}
            validationWarnings={validationWarnings}
            onChange={setConfig}
          />
        )}

        {/* ── Appearance ── */}
        {isSettingsSectionVisible('section-appearance', searchQuery) && (
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
        {isSettingsSectionVisible('section-notifications', searchQuery) && (
          <NotificationsSection apiBase={currentApiBase} />
        )}

        {/* ── Connection ── */}
        {isSettingsSectionVisible('section-connection', searchQuery) && (
          <ConnectionSection
            currentApiBase={currentApiBase}
            isCustom={isCustom}
            apiBaseError={apiBaseError}
            testStatus={testStatus}
            region={config.region || ''}
            regionError={validationErrors.region}
            showRegion={showBedrockRegion}
            onApiBaseChange={(value) => {
              try {
                if (value) new URL(value);
                setApiBaseError(null);
                setApiBase(value);
              } catch {
                setApiBaseError('Invalid URL format');
              }
            }}
            onResetApiBase={resetToDefault}
            onTestConnection={() => testConnection.mutate()}
            onRegionChange={(value) => setConfig({ ...config, region: value })}
          />
        )}

        {isSettingsSectionVisible('section-voice', searchQuery) && (
          <VoiceFeaturesSection />
        )}

        {/* ── System ── */}
        {isSettingsSectionVisible('section-system', searchQuery) && (
          <SystemSection
            apiBase={currentApiBase}
            config={config}
            onChange={setConfig}
            onExport={exportSettings}
            onImport={importSettings}
            onResetToDefaults={() => setShowResetModal(true)}
          />
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
