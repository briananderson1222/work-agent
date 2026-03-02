/**
 * @vitest-environment jsdom
 *
 * useTTS — tests for the hook's integration with VoiceProviderContext.
 *
 * We test the underlying voiceRegistry directly since useTTS is a thin
 * wrapper over useVoiceProviderContext which subscribes to the registry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── voiceRegistry tests (pure module, no React) ───────────────────────────────

// We test the registry directly here since the hook is a thin wrapper.
// Full React integration tests for hook rendering require heavy mocking of
// localStorage, useServerCapabilities, etc.

async function getRegistry() {
  vi.resetModules();
  const mod = await import('@stallion-ai/sdk');
  return mod.voiceRegistry;
}

function makeTTSProvider(id: string, speaking = false) {
  return {
    id,
    name: `TTS ${id}`,
    isSupported: true,
    speaking,
    speak: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    destroy: vi.fn(),
  };
}

describe('voiceRegistry (backing useTTS)', () => {
  it('getAvailableTTS returns [] when no providers registered', async () => {
    const registry = await getRegistry();
    expect(registry.getAvailableTTS()).toEqual([]);
  });

  it('getAvailableTTS returns provider after registration', async () => {
    const registry = await getRegistry();
    const provider = makeTTSProvider('webspeech');
    registry.registerTTS(provider);

    const available = registry.getAvailableTTS();
    expect(available.length).toBe(1);
    expect(available[0].id).toBe('webspeech');
  });

  it('subscribers notified on TTS registration', async () => {
    const registry = await getRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    registry.registerTTS(makeTTSProvider('tts-2'));
    expect(listener).toHaveBeenCalled();
  });

  it('multiple providers — all returned by getAvailableTTS', async () => {
    const registry = await getRegistry();
    registry.registerTTS(makeTTSProvider('p1'));
    registry.registerTTS(makeTTSProvider('p2'));

    const available = registry.getAvailableTTS();
    const ids = available.map((p) => p.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('getAvailableSTT works independently', async () => {
    const registry = await getRegistry();
    expect(registry.getAvailableSTT()).toEqual([]);
  });
});
