import React, { useState, useEffect } from 'react';

/* ── Spinner ── */
const spinnerKeyframes = `@keyframes wa-spin { to { transform: rotate(360deg) } }`;
let styleInjected = false;
function injectStyles() {
  if (styleInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = [
    spinnerKeyframes,
    `@keyframes wa-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`,
  ].join('\n');
  document.head.appendChild(s);
  styleInjected = true;
}

const sizes = { sm: 10, md: 16, lg: 24 } as const;

export function Spinner({
  size = 'md',
  color,
}: {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}) {
  injectStyles();
  const px = sizes[size];
  const bw = size === 'sm' ? 1.5 : 2;
  return (
    <span
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        borderRadius: '50%',
        border: `${bw}px solid var(--border-primary, #333)`,
        borderTopColor: color || 'var(--accent-primary, #4a9eff)',
        animation: 'wa-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

/* ── LoadingState (inline) ── */
export function LoadingState({
  message = 'Loading...',
  size = 'md',
}: {
  message?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size === 'sm' ? '0.4rem' : '0.5rem',
        padding: size === 'sm' ? '0.75rem' : '2rem',
        color: 'var(--text-secondary, #999)',
        fontSize: size === 'sm' ? '0.8rem' : '0.85rem',
      }}
    >
      <Spinner size={size === 'sm' ? 'sm' : 'md'} />
      <span>{message}</span>
    </div>
  );
}

/* ── FullScreenLoader ── */
const defaultPhrases = [
  'Warming up the engines...',
  'Reticulating splines...',
  'Consulting the oracle...',
  'Aligning the flux capacitors...',
  'Brewing some coffee...',
  'Counting backwards from infinity...',
  'Convincing electrons to cooperate...',
  'Calibrating the vibes...',
  'Herding photons...',
  'Negotiating with the cloud...',
  'Untangling the spaghetti...',
  'Polishing the pixels...',
  'Waking up the hamsters...',
  'Charging the lasers...',
  'Shuffling the deck...',
];

export function FullScreenLoader({
  message,
  phrases = defaultPhrases,
  interval = 3000,
  showLogo = true,
}: {
  message?: string;
  phrases?: string[];
  interval?: number;
  showLogo?: boolean;
}) {
  injectStyles();
  const [phraseIndex, setPhraseIndex] = useState(() =>
    Math.floor(Math.random() * phrases.length),
  );

  useEffect(() => {
    if (message || phrases.length === 0) return;
    const id = setInterval(
      () => setPhraseIndex((i) => (i + 1) % phrases.length),
      interval,
    );
    return () => clearInterval(id);
  }, [message, phrases.length, interval]);

  const displayText = message || phrases[phraseIndex];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: 'var(--bg-primary, #0a0a0a)',
        color: 'var(--text-secondary, #999)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {showLogo && (
          <img
            src="/favicon.png"
            alt=""
            style={{
              width: 48,
              height: 48,
              marginBottom: 20,
              opacity: 0.7,
              animation: 'wa-pulse 2s ease-in-out infinite',
            }}
          />
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <Spinner size="md" />
          <span style={{ fontSize: '0.9rem', transition: 'opacity 0.3s' }}>
            {displayText}
          </span>
        </div>
      </div>
    </div>
  );
}
