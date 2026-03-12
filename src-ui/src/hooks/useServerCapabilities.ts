/**
 * useServerCapabilities — fetches GET /api/system/capabilities on mount and
 * registers server-backed providers into voiceRegistry.
 *
 * Server-backed providers that are `configured: true` get a proxy STT/TTS
 * object registered so VoiceProviderContext can surface them in the UI.
 * Re-fetches when `apiBase` changes (i.e. connection switches).
 */

import type {
  ProviderCapability,
  STTProvider,
  TTSProvider,
} from '@stallion-ai/sdk';
import { ListenerManager, voiceRegistry } from '@stallion-ai/sdk';
import { useEffect } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

interface CapabilitiesResponse {
  voice?: {
    stt?: ProviderCapability[];
    tts?: ProviderCapability[];
  };
}

/** Shared base for server-backed provider stubs. */
function makeStubBase(cap: ProviderCapability) {
  const lm = new ListenerManager();
  return {
    id: cap.id,
    name: cap.name,
    isSupported: cap.configured,
    subscribe: lm.subscribe,
  };
}

/** Minimal stub STTProvider marking a server-backed provider. */
function makeServerSTTStub(cap: ProviderCapability): STTProvider {
  return {
    ...makeStubBase(cap),
    state: 'idle' as const,
    transcript: '',
    startListening() {
      console.warn(
        `[stallion] STT provider "${cap.id}" requires a plugin bundle to activate`,
      );
    },
    stopListening() {},
  };
}

/** Minimal stub TTSProvider marking a server-backed provider. */
function makeServerTTSStub(cap: ProviderCapability): TTSProvider {
  return {
    ...makeStubBase(cap),
    speaking: false,
    speak() {
      console.warn(
        `[stallion] TTS provider "${cap.id}" requires a plugin bundle to activate`,
      );
    },
    cancel() {},
  };
}

export function useServerCapabilities(): void {
  const { apiBase } = useApiBase();

  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;

    fetch(`${apiBase}/api/system/capabilities`)
      .then((r) => r.json())
      .then((data: CapabilitiesResponse) => {
        if (cancelled) return;

        // Register server-backed STT providers
        for (const cap of data.voice?.stt ?? []) {
          if (cap.clientOnly) continue; // already registered by provider index
          if (cap.configured && !voiceRegistry.getSTT(cap.id)) {
            voiceRegistry.registerSTT(makeServerSTTStub(cap));
          }
        }

        // Register server-backed TTS providers
        for (const cap of data.voice?.tts ?? []) {
          if (cap.clientOnly) continue;
          if (cap.configured && !voiceRegistry.getTTS(cap.id)) {
            voiceRegistry.registerTTS(makeServerTTSStub(cap));
          }
        }
      })
      .catch((err: unknown) => {
        // Server may not support /capabilities yet — non-fatal
        console.warn(
          '[stallion] Failed to fetch /api/system/capabilities:',
          err,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase]);
}
