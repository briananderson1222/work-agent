/**
 * GeolocationContextProvider — unit tests.
 *
 * Node environment. Mock navigator.geolocation so we can drive position
 * updates and error callbacks without a real browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Navigator mock ────────────────────────────────────────────────────────────

type PositionCallback = (pos: { coords: { latitude: number; longitude: number } }) => void;
type ErrorCallback = () => void;

interface MockGeolocation {
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  _firePosition(lat: number, lng: number): void;
  _fireError(): void;
}

function makeMockGeolocation(): MockGeolocation {
  let successCb: PositionCallback | null = null;
  let errorCb: ErrorCallback | null = null;
  let watchIdCounter = 1;

  const geo: MockGeolocation = {
    watchPosition: vi.fn((success, error) => {
      successCb = success as PositionCallback;
      errorCb = error as ErrorCallback;
      return watchIdCounter++;
    }) as ReturnType<typeof vi.fn>,
    clearWatch: vi.fn(),
    _firePosition(lat: number, lng: number) {
      successCb?.({ coords: { latitude: lat, longitude: lng } });
    },
    _fireError() {
      errorCb?.();
    },
  };

  return geo;
}

let mockGeo: MockGeolocation;

async function getProvider() {
  vi.resetModules();
  const mod = await import('../providers/context/GeolocationContextProvider');
  return mod.geolocationContextProvider;
}

function setNavigator(value: any) {
  try {
    (globalThis as any).navigator = value;
  } catch {
    // navigator may be read-only in Node; use defineProperty
    Object.defineProperty(globalThis, 'navigator', {
      value,
      writable: true,
      configurable: true,
    });
  }
}

function clearNavigator() {
  try {
    delete (globalThis as any).navigator;
  } catch {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

beforeEach(() => {
  mockGeo = makeMockGeolocation();
  setNavigator({ geolocation: mockGeo });
});

afterEach(() => {
  clearNavigator();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeolocationContextProvider', () => {
  it('getContext() with no position yet → null', async () => {
    const p = await getProvider();
    p.enabled = true; // start watch but no position fired yet
    expect(p.getContext()).toBeNull();
  });

  it('watchPosition fires → getContext() returns [My location: lat, lng]', async () => {
    const p = await getProvider();
    p.enabled = true;
    mockGeo._firePosition(37.7749, -122.4194);

    const ctx = p.getContext();
    expect(ctx).toMatch(/^\[My location: 37\.77490, -122\.41940\]$/);
  });

  it('enabled is false by default', async () => {
    const p = await getProvider();
    expect(p.enabled).toBe(false);
  });

  it('disable → getContext() returns null even with position', async () => {
    const p = await getProvider();
    p.enabled = true;
    mockGeo._firePosition(0, 0);
    expect(p.getContext()).not.toBeNull();

    p.enabled = false;
    expect(p.getContext()).toBeNull();
  });

  it('geolocation not available → getContext() returns null, no crash', async () => {
    setNavigator({}); // no geolocation property

    const p = await getProvider();
    p.enabled = true; // _startWatch is a no-op when not supported
    expect(() => p.getContext()).not.toThrow();
    expect(p.getContext()).toBeNull();
  });

  it('watchPosition error callback → stays null, no crash', async () => {
    const p = await getProvider();
    p.enabled = true;
    expect(() => mockGeo._fireError()).not.toThrow();
    expect(p.getContext()).toBeNull();
  });

  it('destroy() → calls clearWatch', async () => {
    const p = await getProvider();
    p.enabled = true; // starts the watch
    p.destroy();

    expect(mockGeo.clearWatch).toHaveBeenCalled();
  });

  it('subscribers notified on position update', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);
    p.enabled = true;
    listener.mockClear(); // clear the initial notify from setting enabled

    mockGeo._firePosition(10, 20);
    expect(listener).toHaveBeenCalled();
  });
});
