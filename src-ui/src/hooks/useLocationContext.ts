/**
 * useLocationContext — opt-in GPS context injection.
 *
 * When enabled, watches the device position via `navigator.geolocation` and
 * provides `getContextString()` which returns a short location annotation to
 * prepend to outgoing messages (e.g. "[Location: 37.7749, -122.4194]").
 *
 * Privacy defaults: feature is disabled by default (see useMobileSettings).
 * The browser will ask for permission on first use; if denied, `error` is set
 * and coordinates stay null — the app continues working without location.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Coords {
  lat: number;
  lng: number;
  accuracy: number; // meters
}

interface UseLocationContextOptions {
  enabled: boolean;
}

export interface UseLocationContextResult {
  /** Available on this device/browser. */
  supported: boolean;
  coords: Coords | null;
  error: string | null;
  /**
   * Returns a short annotation string to prepend to messages when location
   * is available, or null if disabled / no coordinates yet.
   */
  getContextString: () => string | null;
}

export function useLocationContext({
  enabled,
}: UseLocationContextOptions): UseLocationContextResult {
  const [supported] = useState(() => 'geolocation' in navigator);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !supported) {
      // Clear existing watch if feature turned off
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: 60_000, // accept cached positions up to 1 min old
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, supported]);

  const getContextString = useCallback((): string | null => {
    if (!enabled || !coords) return null;
    return `[My location: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]`;
  }, [enabled, coords]);

  return { supported, coords, error, getContextString };
}
