import { QRDisplay, useConnections, useHostUrl } from '@stallion-ai/connect';
import { Toggle } from '../../components/Toggle';
import { useMessageContextContext } from '../../contexts/MessageContextContext';
import { useVoiceProviderContext } from '../../contexts/VoiceProviderContext';
import type { FeatureSettings } from '../../hooks/useFeatureSettings';
import { useFeatureSettings } from '../../hooks/useFeatureSettings';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { SettingsSection } from './SettingsSection';

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
            computer&apos;s LAN IP.
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
  const notifications = usePushNotifications({
    enabled: settings.pushNotificationsEnabled,
    apiBase,
  });

  if (!notifications.supported) return null;

  return (
    <div className="settings__notif-subscribe">
      {notifications.subscribed ? (
        <div className="settings__notif-subscribed">
          <span className="settings__notif-status">
            ✓ Subscribed to push notifications
          </span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={notifications.unsubscribe}
          >
            Unsubscribe
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={notifications.subscribe}
          disabled={notifications.permission === 'denied'}
        >
          {notifications.permission === 'denied'
            ? 'Notifications blocked by browser'
            : 'Enable push notifications'}
        </button>
      )}
      {notifications.error && (
        <div className="settings__notif-error">{notifications.error}</div>
      )}
    </div>
  );
}

export function VoiceFeaturesSection() {
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
    <SettingsSection icon="🎙" title="Voice & Features" id="section-voice">
      <div className="voice-provider-section">
        <label className="voice-provider-section__label" htmlFor="stt-provider">
          Speech-to-text (microphone input)
        </label>
        <select
          id="stt-provider"
          className="voice-provider-section__select"
          data-testid="stt-provider-select"
          value={activeSTT?.id ?? ''}
          onChange={(event) => setSTTProvider(event.target.value)}
        >
          {availableSTT.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
              {provider.isSupported ? '' : ' (not available)'}
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

      <div className="voice-provider-section">
        <label className="voice-provider-section__label" htmlFor="tts-provider">
          Text-to-speech (agent readback)
        </label>
        <select
          id="tts-provider"
          className="voice-provider-section__select"
          data-testid="tts-provider-select"
          value={activeTTS?.id ?? ''}
          onChange={(event) => setTTSProvider(event.target.value)}
        >
          {availableTTS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
              {provider.isSupported ? '' : ' (not available)'}
            </option>
          ))}
          {availableTTS.length === 0 && (
            <option value="">No TTS providers registered</option>
          )}
        </select>
      </div>

      {contextProviders.length > 0 && (
        <div className="context-provider-section">
          <div className="context-provider-section__label">Message Context</div>
          {contextProviders.map((provider) => (
            <div
              key={provider.id}
              className="settings__feature-toggle"
              onClick={() => toggleProvider(provider.id)}
            >
              <Toggle
                checked={provider.enabled}
                onChange={() => {}}
                size="sm"
              />
              <div>
                <div className="settings__toggle-name">{provider.name}</div>
                {provider.description && (
                  <div className="settings__toggle-detail">
                    {provider.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        {FEATURE_META.map((feature) => (
          <FeatureToggle
            key={feature.key}
            featureKey={feature.key}
            label={feature.label}
            description={feature.description}
            privacyNote={feature.privacyNote}
            checked={settings[feature.key]}
            onToggle={toggle}
          />
        ))}
      </div>

      {settings.mobilePairingEnabled && <MobilePairingSection />}

      <span className="form-help settings__form-help-block">
        Voice provider selection and context settings are saved in this browser
        only. Install plugins to add ElevenLabs or Nova Sonic providers.
      </span>
    </SettingsSection>
  );
}

export function NotificationsSection({ apiBase }: { apiBase: string }) {
  const { settings: featureSettings, toggle: toggleFeature } =
    useFeatureSettings();

  return (
    <SettingsSection icon="◉" title="Notifications" id="section-notifications">
      <label className="settings__toggle-row">
        <Toggle
          checked={featureSettings.pushNotificationsEnabled}
          onChange={() => toggleFeature('pushNotificationsEnabled')}
          describedBy="notif-desc"
        />
        <div>
          <div className="settings__toggle-label">Push notifications</div>
          <div className="settings__toggle-desc" id="notif-desc">
            Browser push notifications for tool approvals and high-priority
            alerts
          </div>
        </div>
      </label>
      {featureSettings.pushNotificationsEnabled && (
        <NotificationSubscribeButton apiBase={apiBase} />
      )}
    </SettingsSection>
  );
}
