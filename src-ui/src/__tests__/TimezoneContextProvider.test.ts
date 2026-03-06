/**
 * TimezoneContextProvider — unit tests.
 *
 * Pure Node environment — uses Intl.DateTimeFormat.
 */
import { describe, it, expect, vi } from 'vitest';

async function getProvider() {
  vi.resetModules();
  const mod = await import('../providers/context/TimezoneContextProvider');
  return mod.timezoneContextProvider;
}

describe('TimezoneContextProvider', () => {
  it('id and name are correct', async () => {
    const p = await getProvider();
    expect(p.id).toBe('timezone');
    expect(typeof p.name).toBe('string');
    expect(p.name.length).toBeGreaterThan(0);
  });

  it('enabled is false by default', async () => {
    const p = await getProvider();
    expect(p.enabled).toBe(false);
  });

  it('getContext() returns null when disabled', async () => {
    const p = await getProvider();
    expect(p.getContext()).toBeNull();
  });

  it('getContext() returns non-null string when enabled', async () => {
    const p = await getProvider();
    p.enabled = true;
    const ctx = p.getContext();
    expect(ctx).not.toBeNull();
    expect(typeof ctx).toBe('string');
  });

  it('getContext() format matches [Timezone: <tz>]', async () => {
    const p = await getProvider();
    p.enabled = true;
    const ctx = p.getContext();
    expect(ctx).toMatch(/^\[Timezone: .+\]$/);
  });

  it('disable → getContext() returns null even if was enabled', async () => {
    const p = await getProvider();
    p.enabled = true;
    expect(p.getContext()).not.toBeNull();
    p.enabled = false;
    expect(p.getContext()).toBeNull();
  });

  it('subscribe/unsubscribe — cleanup works', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    const unsub = p.subscribe(listener);

    p.enabled = true; // triggers notify
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    p.enabled = false; // should NOT call listener anymore
    expect(listener).toHaveBeenCalledOnce(); // still only once
  });

  it('destroy() — no crash, cleans up', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);

    expect(() => p.destroy()).not.toThrow();

    // After destroy, further mutations should not notify
    p.enabled = true;
    expect(listener).not.toHaveBeenCalled();
  });
});
