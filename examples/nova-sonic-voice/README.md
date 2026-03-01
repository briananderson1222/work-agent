# nova-sonic-voice — example plugin

Reference implementation of an Amazon Nova Sonic conversational voice plugin.

Nova Sonic uses AWS Bedrock `InvokeModelWithBidirectionalStream` (HTTP/2), which cannot be
called directly from the browser. This plugin's server module acts as a WebSocket relay:

```
Browser WS ↔ plugin.mjs relay ↔ AWS Bedrock HTTP/2
```

Required IAM permission: `bedrock:InvokeModelWithBidirectionalStream`

Models: `us.amazon.nova-lite-v1:0`, `us.amazon.nova-pro-v1:0`

## Files

- `plugin.json` — declares `conversational` provider type, requires `aws:bedrock` permission
- `plugin.mjs` — server WS relay endpoint at `/api/plugins/nova-sonic-voice/relay`
- `src/NovaSonicProvider.ts` — ConversationalVoiceProvider: STT + TTS in one bidirectional session
- `src/index.ts` — registers provider into `voiceRegistry` on load

## Status

The relay in `plugin.mjs` is a stub — the full `@aws-sdk/client-bedrock-runtime`
`InvokeModelWithBidirectionalStream` wiring is left as an exercise. The client-side
`NovaSonicProvider.ts` is complete and handles audio chunking, turn-taking, and interrupts.
