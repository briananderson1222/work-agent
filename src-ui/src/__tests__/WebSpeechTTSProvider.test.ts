/**
 * @vitest-environment jsdom
 *
 * WebSpeechTTSProvider — unit tests for speaking state and error handling.
 *
 * SpeechSynthesis is mocked as a controllable stub so tests can drive
 * state transitions without a real browser speech engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── SpeechSynthesis mock ─────────────────────────────────────────────────────

interface MockUtterance {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  _fireStart(): void;
  _fireEnd(): void;
  _fireError(): void;
}

function makeMockUtterance(text: string): MockUtterance {
  const utt: MockUtterance = {
    text,
    lang: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: null,
    onend: null,
    onerror: null,
    _fireStart() {
      utt.onstart?.();
    },
    _fireEnd() {
      utt.onend?.();
    },
    _fireError() {
      utt.onerror?.();
    },
  };
  return utt;
}

let lastUtterance: MockUtterance | null = null;
const mockSpeechSynthesis = {
  speak: vi.fn((utt: MockUtterance) => {
    lastUtterance = utt;
  }),
  cancel: vi.fn(),
};

// Import AFTER setting up window so isSupported is computed correctly
async function getProvider() {
  vi.resetModules();
  const mod = await import('../providers/voice/WebSpeechTTSProvider');
  return mod.webSpeechTTSProvider;
}

beforeEach(() => {
  lastUtterance = null;
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.cancel.mockClear();

  // Patch SpeechSynthesisUtterance on window
  (globalThis as any).window = {
    speechSynthesis: mockSpeechSynthesis,
  };
  (globalThis as any).SpeechSynthesisUtterance = vi.fn((text: string) =>
    makeMockUtterance(text),
  );
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).SpeechSynthesisUtterance;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebSpeechTTSProvider', () => {
  it('initial state — speaking is false', async () => {
    const p = await getProvider();
    expect(p.speaking).toBe(false);
  });

  it('speak() → onstart fires → speaking:true notified', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);

    p.speak('Hello');
    lastUtterance!._fireStart();

    expect(p.speaking).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('speak() → onend fires → speaking:false notified', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);

    p.speak('Hello');
    lastUtterance!._fireStart();
    listener.mockClear();

    lastUtterance!._fireEnd();
    expect(p.speaking).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('cancel() while speaking → calls speechSynthesis.cancel(), speaking:false', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);

    p.speak('Hello');
    lastUtterance!._fireStart();
    expect(p.speaking).toBe(true);
    listener.mockClear();

    p.cancel();
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(p.speaking).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('cancel() while not speaking → no crash, no spurious notification', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    p.subscribe(listener);

    // cancel without speaking
    expect(() => p.cancel()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe() → unsubscribe() → no longer notified after unsub', async () => {
    const p = await getProvider();
    const listener = vi.fn();
    const unsub = p.subscribe(listener);
    unsub();

    p.speak('Hello');
    lastUtterance!._fireStart();
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple speak() calls — cancels previous utterance via cancel()', async () => {
    const p = await getProvider();

    p.speak('First');
    p.speak('Second');

    // speechSynthesis.cancel is called at start of each speak()
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  it('speak() with no speechSynthesis API → graceful degradation (no crash)', async () => {
    // Remove speechSynthesis
    (globalThis as any).window = {};

    const p = await getProvider();
    expect(() => p.speak('Hello')).not.toThrow();
  });
});
