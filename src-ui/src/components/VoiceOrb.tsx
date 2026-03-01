/**
 * VoiceOrb — press-and-hold mic button for voice input.
 *
 * Press/tap to start recording; release to send the transcript.
 * Uses pointer events so it works on both desktop (mouse) and mobile (touch).
 * Returns null when SpeechRecognition isn't supported so callers don't
 * need to guard the render.
 */
import type { VoiceState } from '../hooks/useVoiceMode';

interface VoiceOrbProps {
  state: VoiceState;
  supported: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

const SIZE = 34;

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

  return (
    <>
      <style>{`
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.4); opacity: 0.2; }
        }
        .voice-orb { touch-action: none; user-select: none; }
        .voice-orb:active { opacity: 0.8; }
      `}</style>
      <button
        type="button"
        className="voice-orb"
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
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isListening
            ? 'var(--color-error, #ef4444)'
            : isError
              ? 'var(--bg-tertiary)'
              : 'var(--bg-tertiary)',
          color: isListening ? 'white' : isError ? 'var(--color-error, #ef4444)' : 'var(--text-muted)',
          fontSize: 16,
          transition: 'background 0.15s',
          outline: isListening ? '2px solid rgba(239,68,68,0.4)' : 'none',
        }}
      >
        {/* Pulse ring when listening */}
        {isListening && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: '50%',
              border: '2px solid var(--color-error, #ef4444)',
              animation: 'voice-pulse 1s ease-in-out infinite',
            }}
          />
        )}
        {/* Mic SVG icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={isListening ? 'white' : 'currentColor'}
          aria-hidden
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path
            d="M5 11a7 7 0 0 0 14 0"
            fill="none"
            stroke={isListening ? 'white' : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="18"
            x2="12"
            y2="22"
            stroke={isListening ? 'white' : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="8"
            y1="22"
            x2="16"
            y2="22"
            stroke={isListening ? 'white' : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  );
}
