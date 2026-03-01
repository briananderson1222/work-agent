/**
 * useVoiceMode — wraps the Web Speech API for press-to-talk voice input
 * and optional TTS readback via SpeechSynthesis.
 *
 * Works in Chrome/Edge on desktop and Android (and iOS Safari with webkitSpeechRecognition).
 * Returns `supported: false` on unsupported browsers (Firefox, etc.) so callers
 * can hide the UI gracefully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState = 'idle' | 'listening' | 'error';

// SpeechRecognition is a web API available in Chrome/Edge/Safari (prefixed).
// We access it via `window` with `any` casts to remain portable across TS versions.
type AnySpeechRecognition = any;

interface UseVoiceModeOptions {
  /** Whether the feature is enabled (from useMobileSettings). */
  enabled: boolean;
  /** Called when a final transcript is ready. */
  onTranscript: (text: string) => void;
  /** Language tag passed to SpeechRecognition (default: browser default). */
  lang?: string;
}

export interface UseVoiceModeResult {
  /** Whether SpeechRecognition is available in this browser. */
  supported: boolean;
  state: VoiceState;
  /** Start recording (call on pointerdown / touchstart). */
  startListening: () => void;
  /** Stop recording (call on pointerup / touchend). */
  stopListening: () => void;
  /** Speak `text` via SpeechSynthesis. No-op if TTS not available. */
  speak: (text: string) => void;
  cancelSpeech: () => void;
  isSpeaking: boolean;
}

export function useVoiceMode({
  enabled,
  onTranscript,
  lang,
}: UseVoiceModeOptions): UseVoiceModeResult {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recRef = useRef<AnySpeechRecognition | null>(null);
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Detect support once on mount
  useEffect(() => {
    const win = window as any;
    setSupported(!!(win.SpeechRecognition ?? win.webkitSpeechRecognition));
  }, []);

  const startListening = useCallback(() => {
    if (!enabledRef.current) return;
    const win = window as any;
    const SpeechRec = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRec) return;

    // Cancel any previous session
    recRef.current?.abort();

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    if (lang) rec.lang = lang;

    rec.onstart = () => setState('listening');

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
    };

    rec.onerror = (_e: any) => {
      setState('error');
      setTimeout(() => setState('idle'), 1500);
    };

    rec.onend = () => setState('idle');

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 1500);
    }
  }, [lang, onTranscript]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    supported: supported && enabled,
    state,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    isSpeaking,
  };
}
