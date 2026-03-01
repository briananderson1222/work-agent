/**
 * useMobileSettings — localStorage-backed per-feature toggles.
 *
 * Each feature is independently enable/disable and defaults to conservative
 * settings (privacy-sensitive features like location are off by default).
 * Stored per-browser in localStorage so settings travel with the device.
 */
import { useCallback, useState } from 'react';

export interface MobileSettings {
  /** Text-to-speech readback of the latest agent response via the active TTS provider. */
  ttsReadbackEnabled: boolean;
  /** Cache pending messages in IndexedDB when offline; flush on reconnect. */
  offlineQueueEnabled: boolean;
  /** Subscribe to Web Push notifications for tool-approval requests. */
  approvalNotificationsEnabled: boolean;
}

const STORAGE_KEY = 'stallion-feature-settings';

const DEFAULTS: MobileSettings = {
  ttsReadbackEnabled: false,
  offlineQueueEnabled: true,
  approvalNotificationsEnabled: false,
};

function load(): MobileSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(s: MobileSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage may be full — ignore
  }
}

export function useMobileSettings() {
  const [settings, setSettings] = useState<MobileSettings>(load);

  const update = useCallback((changes: Partial<MobileSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...changes };
      save(next);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (key: keyof MobileSettings) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        save(next);
        return next;
      });
    },
    [],
  );

  return { settings, update, toggle };
}
