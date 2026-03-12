/**
 * VoiceProviderContext — app-level context for active STT/TTS provider selection.
 *
 * Subscribes to voiceRegistry via useSyncExternalStore so the component tree
 * re-renders when new providers are registered (e.g. after plugin load).
 *
 * Active provider IDs are persisted to localStorage under 'stallion-voice-provider'.
 */

import type { STTProvider, TTSProvider } from '@stallion-ai/sdk';
import { voiceRegistry } from '@stallion-ai/sdk';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useServerCapabilities } from '../hooks/useServerCapabilities';

const STORAGE_KEY_STT = 'stallion-stt-provider';
const STORAGE_KEY_TTS = 'stallion-tts-provider';

interface VoiceProviderContextValue {
  availableSTT: STTProvider[];
  availableTTS: TTSProvider[];
  activeSTT: STTProvider | null;
  activeTTS: TTSProvider | null;
  setSTTProvider: (id: string) => void;
  setTTSProvider: (id: string) => void;
}

const VoiceProviderCtx = createContext<VoiceProviderContextValue | null>(null);

// Stable snapshot functions for useSyncExternalStore
function getSTTSnapshot() {
  return voiceRegistry.getAvailableSTT();
}
function getTTSSnapshot() {
  return voiceRegistry.getAvailableTTS();
}

export function VoiceProviderContext({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch server capabilities and register server-backed providers
  useServerCapabilities();

  // Subscribe to registry changes — re-renders when providers are added/removed
  const availableSTT = useSyncExternalStore(
    voiceRegistry.subscribe,
    getSTTSnapshot,
    getSTTSnapshot,
  );
  const availableTTS = useSyncExternalStore(
    voiceRegistry.subscribe,
    getTTSSnapshot,
    getTTSSnapshot,
  );

  const [activeSTTId, setActiveSTTId] = React.useState<string>(
    () => localStorage.getItem(STORAGE_KEY_STT) ?? 'webspeech',
  );
  const [activeTTSId, setActiveTTSId] = React.useState<string>(
    () => localStorage.getItem(STORAGE_KEY_TTS) ?? 'webspeech',
  );

  const setSTTProvider = useCallback((id: string) => {
    setActiveSTTId(id);
    localStorage.setItem(STORAGE_KEY_STT, id);
  }, []);

  const setTTSProvider = useCallback((id: string) => {
    setActiveTTSId(id);
    localStorage.setItem(STORAGE_KEY_TTS, id);
  }, []);

  const activeSTT = useMemo(
    () =>
      availableSTT.find((p: STTProvider) => p.id === activeSTTId) ??
      availableSTT[0] ??
      null,
    [availableSTT, activeSTTId],
  );
  const activeTTS = useMemo(
    () =>
      availableTTS.find((p: TTSProvider) => p.id === activeTTSId) ??
      availableTTS[0] ??
      null,
    [availableTTS, activeTTSId],
  );

  const value = useMemo(
    () => ({
      availableSTT,
      availableTTS,
      activeSTT,
      activeTTS,
      setSTTProvider,
      setTTSProvider,
    }),
    [
      availableSTT,
      availableTTS,
      activeSTT,
      activeTTS,
      setSTTProvider,
      setTTSProvider,
    ],
  );

  return (
    <VoiceProviderCtx.Provider value={value}>
      {children}
    </VoiceProviderCtx.Provider>
  );
}

export function useVoiceProviderContext(): VoiceProviderContextValue {
  const ctx = useContext(VoiceProviderCtx);
  if (!ctx)
    throw new Error(
      'useVoiceProviderContext must be used within VoiceProviderContext',
    );
  return ctx;
}
