/**
 * useFeatureSettings — localStorage-backed per-feature toggles.
 *
 * Each feature is independently enable/disable and defaults to conservative
 * settings (privacy-sensitive features like location are off by default).
 * Stored per-browser in localStorage so settings travel with the device.
 */
import { useCallback, useState } from 'react';

export interface FeatureSettings {
  /** Text-to-speech readback of the latest agent response via the active TTS provider. */
  ttsReadbackEnabled: boolean;
  /** Cache pending messages in IndexedDB when offline; flush on reconnect. */
  offlineQueueEnabled: boolean;
  /** Subscribe to Web Push notifications for high-priority alerts. */
  pushNotificationsEnabled: boolean;
  /** Show the global voice pill for speech-to-speech (S2S) sessions. */
  voiceS2SEnabled: boolean;
  /** Show mobile pairing QR code and network discovery in Settings. */
  mobilePairingEnabled: boolean;
}

const STORAGE_KEY = 'stallion-feature-settings';

const DEFAULTS: FeatureSettings = {
  ttsReadbackEnabled: false,
  offlineQueueEnabled: true,
  pushNotificationsEnabled: false,
  voiceS2SEnabled: false,
  mobilePairingEnabled: false,
};

function load(): FeatureSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(s: FeatureSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage may be full — ignore
  }
}

export function useFeatureSettings() {
  const [settings, setSettings] = useState<FeatureSettings>(load);

  const update = useCallback((changes: Partial<FeatureSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes };
      save(next);
      return next;
    });
  }, []);

  const toggle = useCallback((key: keyof FeatureSettings) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      save(next);
      return next;
    });
  }, []);

  return { settings, update, toggle };
}
