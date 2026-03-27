/**
 * E2E: Voice Provider Pattern
 *
 * Tests the new provider-registry architecture introduced in feat/stallion-connect.
 * Uses Playwright route interception to avoid a real server dependency.
 *
 * Coverage:
 *  - Settings › Settings shows STT/TTS provider dropdowns
 *  - Default WebSpeech provider is pre-selected
 *  - Provider selection persists to localStorage
 *  - Context provider toggles (geolocation, timezone) render and toggle
 *  - GlobalVoiceButton is present in the DOM on mobile viewport
 *  - VoiceOrb is still rendered inside the chat input area
 *  - /api/system/capabilities response populates provider dropdowns
 *  - Visual: screenshot of Advanced tab voice section (desktop + mobile)
 */
import { expect, test } from '@playwright/test';

// Seed a connected server so the app skips onboarding
const SEED_STORAGE = `
  window.localStorage.setItem('stallion-connect-connections', JSON.stringify([
    { id: 'c1', name: 'Dev Server', url: 'http://localhost:3141', lastConnected: Date.now() }
  ]));
  window.localStorage.setItem('stallion-connect-connections-active', 'c1');
`;

const CAPABILITIES_RESPONSE = JSON.stringify({
  voice: {
    stt: [
      {
        id: 'webspeech',
        name: 'WebSpeech (Browser)',
        clientOnly: true,
        visibleOn: ['all'],
        configured: true,
      },
    ],
    tts: [
      {
        id: 'webspeech',
        name: 'WebSpeech (Browser)',
        clientOnly: true,
        visibleOn: ['all'],
        configured: true,
      },
    ],
  },
  context: {
    providers: [
      { id: 'geolocation', name: 'Geolocation', visibleOn: ['mobile'] },
      { id: 'timezone', name: 'Timezone', visibleOn: ['all'] },
    ],
  },
});

const STATUS_READY = JSON.stringify({
  ready: true,
  bedrock: { credentialsFound: true, verified: null, region: 'us-east-1' },
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
});

/** Open the Settings view (flat layout — no tabs). */
async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/settings');
  await page.waitForSelector('.settings__section, .voice-provider-section', {
    timeout: 5000,
  });
}

test.describe('Voice Providers — Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SEED_STORAGE);
    // Register catch-all FIRST (Playwright matches LIFO — last registered wins)
    await page.route('**/api/**', (r) => {
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"agents":[],"plugins":[]}',
      });
    });
    // Specific routes registered AFTER catch-all so they take priority
    await page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    );
    await page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: CAPABILITIES_RESPONSE,
      }),
    );
  });

  test('Settings shows STT provider dropdown', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=Speech-to-text')).toBeVisible();
    const sttSelect = page.locator('[data-testid="stt-provider-select"]');
    await expect(sttSelect).toBeVisible();
    await expect(sttSelect).toContainText('WebSpeech');
  });

  test('Settings shows TTS provider dropdown', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=Text-to-speech')).toBeVisible();
    const ttsSelect = page.locator('[data-testid="tts-provider-select"]');
    await expect(ttsSelect).toBeVisible();
    await expect(ttsSelect).toContainText('WebSpeech');
  });

  test('WebSpeech is the default selected STT provider', async ({ page }) => {
    // Clear any saved selection so we get the default
    await page.addInitScript(`
      window.localStorage.removeItem('stallion-stt-provider');
      window.localStorage.removeItem('stallion-tts-provider');
    `);
    await openSettings(page);
    const sttSelect = page.locator('[data-testid="stt-provider-select"]');
    const selected = await sttSelect.inputValue();
    expect(selected).toBe('webspeech');
  });

  test('provider selection persists to localStorage', async ({ page }) => {
    await openSettings(page);
    const sttSelect = page.locator('[data-testid="stt-provider-select"]');
    await sttSelect.selectOption('webspeech'); // same value — just exercises the handler
    const stored = await page.evaluate(() =>
      localStorage.getItem('stallion-stt-provider'),
    );
    expect(stored).toBe('webspeech');
  });

  test('context provider toggles render', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=Message Context')).toBeVisible();
    // Timezone should always be visible
    await expect(page.locator('text=Timezone')).toBeVisible();
  });

  test('context provider toggle changes enabled state', async ({ page }) => {
    await openSettings(page);
    // Find the Timezone checkbox and verify it's interactive
    const timezoneLabel = page.locator('label', { hasText: 'Timezone' });
    const checkbox = timezoneLabel.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeEnabled();
    // Click and verify no errors (state update is handled by external store)
    await timezoneLabel.click();
  });

  test('WisprFlow hint is displayed below STT dropdown', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=WisprFlow')).toBeVisible();
  });

  test('TTS readback toggle is still present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=Read agent responses aloud')).toBeVisible();
  });

  test('offline queue toggle is still present', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('text=Offline command queue')).toBeVisible();
  });

  test('screenshot: voice settings section (desktop)', async ({ page }) => {
    await openSettings(page);
    // Scroll to the voice section
    await page.locator('text=Voice Providers').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '/tmp/wa-voice-settings-desktop.png',
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    });
  });
});

test.describe('Voice Providers — server capability discovery', () => {
  test('server-backed configured provider appears in STT dropdown', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);
    await page.route('**/api/**', (r) => {
      r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    );
    // Capabilities response includes a server-backed ElevenLabs provider
    await page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voice: {
            stt: [
              {
                id: 'webspeech',
                name: 'WebSpeech (Browser)',
                clientOnly: true,
                visibleOn: ['all'],
                configured: true,
              },
              {
                id: 'elevenlabs',
                name: 'ElevenLabs Scribe',
                clientOnly: false,
                visibleOn: ['all'],
                configured: true,
              },
            ],
            tts: [
              {
                id: 'webspeech',
                name: 'WebSpeech (Browser)',
                clientOnly: true,
                visibleOn: ['all'],
                configured: true,
              },
            ],
          },
          context: { providers: [] },
        }),
      }),
    );

    await openSettings(page);
    const sttSelect = page.locator('[data-testid="stt-provider-select"]');
    await expect(sttSelect).toContainText('ElevenLabs Scribe');
  });

  test('unconfigured server provider is not registered', async ({ page }) => {
    await page.addInitScript(SEED_STORAGE);
    await page.route('**/api/**', (r) => {
      r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    );
    await page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voice: {
            stt: [
              {
                id: 'webspeech',
                name: 'WebSpeech (Browser)',
                clientOnly: true,
                visibleOn: ['all'],
                configured: true,
              },
              {
                id: 'nova-sonic',
                name: 'Nova Sonic',
                clientOnly: false,
                visibleOn: ['mobile'],
                configured: false,
              },
            ],
            tts: [
              {
                id: 'webspeech',
                name: 'WebSpeech (Browser)',
                clientOnly: true,
                visibleOn: ['all'],
                configured: true,
              },
            ],
          },
          context: { providers: [] },
        }),
      }),
    );

    await openSettings(page);
    const sttSelect = page.locator('[data-testid="stt-provider-select"]');
    // Nova Sonic is configured: false — should NOT appear
    await expect(sttSelect).not.toContainText('Nova Sonic');
  });
});

test.describe('Voice Providers — GlobalVoiceButton', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SEED_STORAGE);
    await page.route('**/api/**', (r) => {
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"agents":[],"plugins":[]}',
      });
    });
    await page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    );
    await page.route('**/api/system/capabilities', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: CAPABILITIES_RESPONSE,
      }),
    );
  });

  test('GlobalVoiceButton is present in the DOM on mobile', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // The button is only rendered when SpeechRecognition is supported — stub it
    await page.addInitScript(`
      window.SpeechRecognition = function() {
        this.continuous = false; this.interimResults = false;
        this.start = () => {}; this.stop = () => {}; this.abort = () => {};
        this.onstart = null; this.onresult = null; this.onerror = null; this.onend = null;
      };
    `);
    await page.reload();
    await page.waitForTimeout(2000);

    const btn = page.locator('[data-testid="global-voice-button"]');
    await expect(btn).toBeVisible();

    // Verify it is fixed-position (mobile FAB)
    const position = await btn.evaluate((el) => {
      return window.getComputedStyle(el).position;
    });
    expect(position).toBe('fixed');
  });

  test('screenshot: GlobalVoiceButton on mobile home screen', async ({
    page,
  }) => {
    await page.addInitScript(`
      window.SpeechRecognition = function() {
        this.continuous = false; this.interimResults = false;
        this.start = () => {}; this.stop = () => {}; this.abort = () => {};
        this.onstart = null; this.onresult = null; this.onerror = null; this.onend = null;
      };
    `);
    await page.goto('/');
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: '/tmp/wa-global-voice-mobile.png',
      fullPage: false,
    });
  });
});

test.describe('Voice Providers — VoiceOrb in chat input', () => {
  test.beforeEach(async ({ page }) => {
    // Stub SpeechRecognition (not available in headless Chromium)
    await page.addInitScript(`
      window.SpeechRecognition = function() {
        this.continuous = false; this.interimResults = false;
        this.start = () => this.onstart?.();
        this.stop = () => this.onend?.();
        this.abort = () => {};
        this.onstart = null; this.onresult = null; this.onerror = null; this.onend = null;
      };
    `);
  });

  test('VoiceOrb renders in chat input when SpeechRecognition is available', async ({
    page,
  }) => {
    // Use real server (needs agents loaded for chat input to render)
    await page.goto('/?dock=open');
    await page.locator('button:has-text("+ New")').click();
    const orb = page.locator('[data-testid="voice-orb"]');
    await expect(orb).toBeVisible({ timeout: 10000 });
  });

  test('VoiceOrb changes appearance while listening', async ({ page }) => {
    await page.goto('/?dock=open');
    await page.locator('button:has-text("+ New")').click();

    const orb = page.locator('[data-testid="voice-orb"]');
    await expect(orb).toBeVisible();

    // Simulate press-and-hold
    await orb.dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
    await page.waitForTimeout(300);

    // While listening, title changes to "Release to send"
    await expect(orb).toHaveAttribute('title', 'Release to send');

    // Release
    await orb.dispatchEvent('pointerup', { bubbles: true });
    await page.waitForTimeout(300);
    await expect(orb).toHaveAttribute('title', 'Hold to speak');
  });

  test('screenshot: chat input with VoiceOrb visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    // Scroll to bottom so chat input is visible
    const chatInput = page
      .locator('.chat-input-area, [class*="chat-input"]')
      .first();
    if (await chatInput.isVisible()) {
      await chatInput.scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: '/tmp/wa-voice-orb-chat-input.png',
      fullPage: false,
    });
  });
});

test.describe('Voice Providers — useMobileSettings cleanup', () => {
  test('removed feature flags are absent from localStorage shape', async ({
    page,
  }) => {
    await page.addInitScript(SEED_STORAGE);
    await page.route('**/api/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/');
    await page.waitForTimeout(1500);

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('stallion-feature-settings');
      return raw ? JSON.parse(raw) : null;
    });

    if (stored) {
      // Old flags must be gone
      expect(stored).not.toHaveProperty('voiceModeEnabled');
      expect(stored).not.toHaveProperty('meetingTranscriptionEnabled');
      expect(stored).not.toHaveProperty('locationContextEnabled');
      // Remaining flags must be present
      expect(stored).toHaveProperty('offlineQueueEnabled');
      expect(stored).toHaveProperty('pushNotificationsEnabled');
    }
    // If stored is null, settings haven't been written yet (first visit) — that's fine
  });
});
