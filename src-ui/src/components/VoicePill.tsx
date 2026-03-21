import React from 'react';
import { useVoiceSession } from '../hooks/useVoiceSession';
import './VoicePill.css';

function getIcon(state: string): string {
  switch (state) {
    case 'speaking': return '🔊';
    case 'thinking': return '⏳';
    default: return '🎤';
  }
}

export function VoicePill() {
  const { state, transcript, connect, disconnect, isMuted, toggleMute } = useVoiceSession();
  const isActive = state !== 'idle';

  return (
    <div
      className={`voice-pill${isActive ? ` voice-pill--${state}` : ''}`}
      onClick={isActive ? disconnect : connect}
      title={isActive ? 'End voice session' : 'Start voice session'}
    >
      <span className="voice-pill__icon">{getIcon(state)}</span>
      {isActive && isMuted && (
        <span className="voice-pill__mute" onClick={e => { e.stopPropagation(); toggleMute(); }}>🔇</span>
      )}
      {isActive && transcript && (
        <div className="voice-pill__transcript voice-pill__transcript--visible">{transcript}</div>
      )}
    </div>
  );
}
