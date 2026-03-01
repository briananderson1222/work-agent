/**
 * VoiceOrb — press-and-hold mic button for voice input.
 *
 * Press/tap to start recording; release to send the transcript.
 * Uses pointer events so it works on both desktop (mouse) and mobile (touch).
 * Returns null when SpeechRecognition isn't supported so callers don't
 * need to guard the render.
 */
import type { STTState } from '@stallion-ai/sdk';
import './VoiceOrb.css';

interface VoiceOrbProps {
  state: STTState;
  supported: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceOrb({
  state,
  supported,
  disabled = false,
  onStart,
  onStop,
}: VoiceOrbProps) {
  if (!supported) return null;

  const isListening = state === 'listening';
  const isError = state === 'error';

  const className = [
    'voice-orb',
    isListening ? 'voice-orb--listening' : '',
    isError ? 'voice-orb--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      data-testid="voice-orb"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onPointerLeave={onStop}
      disabled={disabled}
      title={
        isListening
          ? 'Release to send'
          : isError
            ? 'Mic error — try again'
            : 'Hold to speak'
      }
    >
      {/* Pulse ring when listening */}
      {isListening && <span className="voice-orb__pulse" aria-hidden />}
      {/* Mic SVG icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path
          d="M5 11a7 7 0 0 0 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="12"
          y1="18"
          x2="12"
          y2="22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="8"
          y1="22"
          x2="16"
          y2="22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
