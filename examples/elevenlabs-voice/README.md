# elevenlabs-voice — example plugin

Reference implementation of an ElevenLabs voice plugin for Stallion.

Shows the full plugin contract:
- `plugin.json` — capability declaration (`stt` + `tts` provider types, `voice:api-key` permission)
- `plugin.mjs` — server module: issues single-use WebSocket tokens so the API key never reaches the browser
- `src/ElevenLabsSTTProvider.ts` — STTProvider connecting to `wss://api.elevenlabs.io/v1/speech-to-text/stream`
- `src/ElevenLabsTTSProvider.ts` — TTSProvider connecting to `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
- `src/index.ts` — calls `voiceRegistry.registerSTT()` + `voiceRegistry.registerTTS()` on bundle load

## To use as a real plugin

1. Copy this directory outside the repo (plugins live in separate repos)
2. Add your ElevenLabs API key to `.env`: `ELEVENLABS_API_KEY=sk-...`
3. Build: `npm run build`
4. Install: `stallion plugin install ./elevenlabs-voice`

The server will advertise this provider via `GET /api/system/capabilities` with `configured: true`,
and the browser client will register it automatically when it connects.
