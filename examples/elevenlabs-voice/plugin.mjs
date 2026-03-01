/**
 * ElevenLabs Voice — server module
 *
 * Exposes a single endpoint that exchanges the configured API key for a
 * single-use WebSocket token. The browser client connects directly to
 * ElevenLabs using that token — the API key never leaves the server.
 *
 * POST /api/plugins/elevenlabs-voice/signed-url
 *   Body: { type: 'stt' | 'tts', voiceId?: string }
 *   Response: { url: string, expiresAt: number }
 */

export default function register(app, { config, logger }) {
  app.post('/signed-url', async (c) => {
    const apiKey = config.get('apiKey') || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'ElevenLabs API key not configured' }, 503);
    }

    const body = await c.req.json().catch(() => ({}));
    const type = body.type === 'tts' ? 'tts' : 'stt';

    try {
      if (type === 'stt') {
        // Scribe v2 Realtime signed URL
        const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text/stream/auth', {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model_id: 'scribe_v2' }),
        });
        if (!res.ok) {
          const err = await res.text();
          logger.warn('ElevenLabs STT auth failed', { status: res.status, err });
          return c.json({ error: 'ElevenLabs auth failed', detail: err }, 502);
        }
        const data = await res.json();
        return c.json({ url: data.signed_url, expiresAt: Date.now() + 180_000 });
      } else {
        // TTS streaming signed URL
        const voiceId = body.voiceId || config.get('voiceId') || '21m00Tcm4TlvDq8ikWAM';
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input/auth`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          },
        );
        if (!res.ok) {
          const err = await res.text();
          return c.json({ error: 'ElevenLabs TTS auth failed', detail: err }, 502);
        }
        const data = await res.json();
        return c.json({ url: data.signed_url, expiresAt: Date.now() + 180_000 });
      }
    } catch (err) {
      logger.error('ElevenLabs signed-url error', { err });
      return c.json({ error: 'Internal error' }, 500);
    }
  });
}
