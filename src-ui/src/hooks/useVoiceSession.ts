import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface UseVoiceSessionResult {
  state: VoiceState;
  transcript: string;
  transcriptRole: 'user' | 'assistant' | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  error: string | null;
  /** Mic input level 0–1, updated per audio frame. Use for visualization. */
  audioLevel: number;
}

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.ceil(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    output[i] = input[Math.round(i * ratio)];
  }
  return output;
}

function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff);
  }
  return out;
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function int16ToBase64(buf: Int16Array): string {
  const bytes = new Uint8Array(buf.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function useVoiceSession(): UseVoiceSessionResult {
  const { apiBase } = useApiBase();
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [transcriptRole, setTranscriptRole] = useState<'user' | 'assistant' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isMutedRef = useRef(false);
  const inputSampleRateRef = useRef(16000);
  const outputSampleRateRef = useRef(24000);

  // Keep isMutedRef in sync so the audio processor closure sees current value
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const stopAudio = useCallback(() => {
    playQueueRef.current = [];
    isPlayingRef.current = false;
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      currentSourceRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    stopMic();
    stopAudio();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, [stopMic, stopAudio]);

  const playNext = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      return;
    }
    isPlayingRef.current = true;
    const buf = playQueueRef.current.shift()!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = playNext;
    currentSourceRef.current = src;
    src.start();
  }, []);

  const enqueueAudio = useCallback((b64: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const int16 = base64ToInt16(b64);
    const float32 = int16ToFloat32(int16);
    const buf = ctx.createBuffer(1, float32.length, outputSampleRateRef.current);
    buf.copyToChannel(new Float32Array(float32), 0);
    playQueueRef.current.push(buf);
    if (!isPlayingRef.current) playNext();
  }, [playNext]);

  const startMic = useCallback(() => {
    const ctx = audioCtxRef.current;
    const stream = streamRef.current;
    if (!ctx || !stream) return;

    const CHUNK = 4096;
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessorNode is deprecated but AudioWorklet requires a separate file;
    // ScriptProcessorNode is sufficient for this use case.
    const processor = ctx.createScriptProcessor(CHUNK, 1, 1);
    processor.onaudioprocess = (e) => {
      if (isMutedRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Compute RMS for audio level visualization
      let sum = 0;
      for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
      setAudioLevel(Math.min(1, Math.sqrt(sum / float32.length) * 5));
      const resampled = downsample(float32, ctx.sampleRate, inputSampleRateRef.current);
      const int16 = float32ToInt16(resampled);
      wsRef.current!.send(JSON.stringify({ type: 'audio_in', data: int16ToBase64(int16) }));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    processorRef.current = processor;
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  const connect = useCallback(async () => {
    if (wsRef.current) return;
    setError(null);
    setState('connecting');

    try {
      const res = await fetch(`${apiBase}/api/voice/sessions`, { method: 'POST' });
      if (!res.ok) throw new Error(`Session creation failed: ${res.status}`);
      const { sessionId: _sessionId } = await res.json();

      const wsUrl = new URL(apiBase);
      const voiceWsPort = parseInt(wsUrl.port || '3141', 10) + 2;
      const ws = new WebSocket(`ws://${wsUrl.hostname}:${voiceWsPort}/?agent=stallion-voice`);
      wsRef.current = ws;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch (err) {
          console.warn('[VoiceSession] Failed to parse server message:', err);
          return;
        }

        switch (msg.type) {
          case 'session_ready': {
            if (msg.inputAudioFormat?.sampleRateHertz) inputSampleRateRef.current = msg.inputAudioFormat.sampleRateHertz;
            if (msg.outputAudioFormat?.sampleRateHertz) outputSampleRateRef.current = msg.outputAudioFormat.sampleRateHertz;
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
              streamRef.current = stream;
              startMic();
            }).catch(err => {
              setError(`Mic access denied: ${err.message}`);
              setState('idle');
            });
            break;
          }
          case 'audio_out':
            enqueueAudio(msg.data);
            break;
          case 'transcript':
            setTranscript(msg.text ?? '');
            setTranscriptRole(msg.role ?? null);
            break;
          case 'state': {
            const next = msg.state as VoiceState;
            setState(next);
            // Barge-in: clear playback queue when server signals listening
            if (next === 'listening') stopAudio();
            break;
          }
          case 'error':
            setError(msg.message ?? 'Unknown error');
            setState('idle');
            break;
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
        cleanup();
        setState('idle');
      };

      ws.onclose = (ev) => {
        // 1000 = normal close (user disconnected), anything else is unexpected
        if (ev.code !== 1000 && state !== 'idle') {
          setError(`Connection lost (code ${ev.code})`);
        }
        cleanup();
        setState('idle');
      };
    } catch (err: any) {
      setError(err.message ?? 'Connection failed');
      cleanup();
      setState('idle');
    }
  }, [apiBase, startMic, enqueueAudio, stopAudio, cleanup]);

  const toggleMute = useCallback(() => setIsMuted(m => !m), []);

  // Cleanup on unmount
  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { state, transcript, transcriptRole, connect, disconnect, isMuted, toggleMute, error, audioLevel };
}
