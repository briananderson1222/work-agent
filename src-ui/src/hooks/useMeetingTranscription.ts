/**
 * useMeetingTranscription — continuous SpeechRecognition with interim results.
 *
 * Designed for long meetings: Chrome stops recognition after ~60s of silence,
 * so we restart automatically. The caller receives both the stable `finalTranscript`
 * and the in-progress `interimTranscript` for live display.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMeetingTranscriptionOptions {
  enabled: boolean;
  lang?: string;
}

export interface UseMeetingTranscriptionResult {
  supported: boolean;
  running: boolean;
  finalTranscript: string;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
  clear: () => void;
}

export function useMeetingTranscription({
  enabled,
  lang,
}: UseMeetingTranscriptionOptions): UseMeetingTranscriptionResult {
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recRef = useRef<any | null>(null);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    const win = window as any;
    setSupported(!!(win.SpeechRecognition ?? win.webkitSpeechRecognition));
  }, []);

  const createAndStart = useCallback(() => {
    const win = window as any;
    const SpeechRec = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec: any = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    if (lang) rec.lang = lang;

    rec.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) setFinalTranscript((prev) => prev + final + ' ');
      setInterimTranscript(interim);
    };

    rec.onerror = (e: any) => {
      // 'no-speech' is normal; other errors we stop
      if (e.error !== 'no-speech') {
        shouldRestartRef.current = false;
        setRunning(false);
        setInterimTranscript('');
      }
    };

    rec.onend = () => {
      setInterimTranscript('');
      // Auto-restart if we're still supposed to be running (Chrome stops on silence)
      if (shouldRestartRef.current) {
        try {
          rec.start();
        } catch {
          // If we can't restart, stop gracefully
          shouldRestartRef.current = false;
          setRunning(false);
        }
      }
    };

    recRef.current = rec;
    rec.start();
  }, [lang]);

  const start = useCallback(() => {
    if (!enabled) return;
    shouldRestartRef.current = true;
    setRunning(true);
    setFinalTranscript('');
    setInterimTranscript('');
    createAndStart();
  }, [enabled, createAndStart]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    setRunning(false);
    setInterimTranscript('');
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const clear = useCallback(() => {
    setFinalTranscript('');
    setInterimTranscript('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  return {
    supported: supported && enabled,
    running,
    finalTranscript,
    interimTranscript,
    start,
    stop,
    clear,
  };
}
