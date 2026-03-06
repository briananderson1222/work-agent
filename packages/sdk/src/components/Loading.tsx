import React, { useState, useEffect, useCallback } from 'react';
import './FullScreen.css';
import { errorQuips, loadingPhrases, loadingTips } from './phrases';

/* ── Spinner (unchanged) ── */
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

export function Spinner({ size = 'md', color }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  injectStyles();
  const px = sizes[size];
  const bw = size === 'sm' ? 1.5 : 2;
  return (
    <span
      style={{
        display: 'inline-block', width: px, height: px, borderRadius: '50%',
        border: `${bw}px solid var(--border-primary, #333)`,
        borderTopColor: color || 'var(--accent-primary, #4a9eff)',
        animation: 'wa-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

/* ── LoadingState (inline, unchanged) ── */
export function LoadingState({ message = 'Loading...', size = 'md' }: { message?: string; size?: 'sm' | 'md' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: size === 'sm' ? '0.4rem' : '0.5rem',
      padding: size === 'sm' ? '0.75rem' : '2rem',
      color: 'var(--text-secondary, #999)',
      fontSize: size === 'sm' ? '0.8rem' : '0.85rem',
    }}>
      <Spinner size={size === 'sm' ? 'sm' : 'md'} />
      <span>{message}</span>
    </div>
  );
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── FullScreenLoader ── */

export function FullScreenLoader({
  message,
  phrases = loadingPhrases,
  tipMessages = loadingTips,
  interval = 2500,
  showLogo = true,
  label,
}: {
  message?: string;
  phrases?: string[];
  tipMessages?: string[];
  interval?: number;
  showLogo?: boolean;
  label?: string;
}) {
  const [shuffledPhrases] = useState(() => shuffled(phrases));
  const [shuffledTips] = useState(() => shuffled(tipMessages));
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [fading, setFading] = useState(false);

  const cycle = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setPhraseIdx(i => (i + 1) % shuffledPhrases.length);
      setTipIdx(i => (i + 1) % shuffledTips.length);
      setFading(false);
    }, 350);
  }, [shuffledPhrases.length, shuffledTips.length]);

  useEffect(() => {
    if (message) return;
    const id = setInterval(cycle, interval);
    return () => clearInterval(id);
  }, [message, interval, cycle]);

  const displayText = message || shuffledPhrases[phraseIdx];
  const displayTip = shuffledTips[tipIdx];

  return (
    <div className="fs-screen">
      <div className="fs-screen__inner">
        {showLogo && (
          <div className="fs-logo-wrap">
            <div className="fs-logo-glow" />
            <div className="fs-logo-ring" />
            <img src="/favicon.png" alt="" className="fs-logo" />
          </div>
        )}
        {label && <div className="fs-label">{label}</div>}
        <div className="fs-messages">
          <div className="fs-message-primary" data-fading={fading}>
            {displayText}
          </div>
          {!message && tipMessages.length > 0 && (
            <div className="fs-message-tip" data-fading={fading}>
              {displayTip}
            </div>
          )}
        </div>
        <div className="fs-progress-track">
          <div className="fs-progress-bar" />
        </div>
      </div>
    </div>
  );
}

/* ── FullScreenError ── */

export function FullScreenError({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try Again',
  secondaryAction,
  showLogo = true,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: { label: string; onClick: () => void };
  showLogo?: boolean;
}) {
  const [quip] = useState(() => errorQuips[Math.floor(Math.random() * errorQuips.length)]);

  return (
    <div className="fs-screen fs-screen--error">
      <div className="fs-screen__inner">
        {showLogo && (
          <div className="fs-logo-wrap">
            <div className="fs-logo-glow" />
            <div className="fs-logo-ring" />
            <img src="/favicon.png" alt="" className="fs-logo" />
          </div>
        )}
        <h2 className="fs-error-title">{title}</h2>
        {description && <p className="fs-error-desc" dangerouslySetInnerHTML={{ __html: description }} />}
        <div className="fs-error-actions">
          {onRetry && (
            <button className="fs-btn fs-btn--primary" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
          {secondaryAction && (
            <button className="fs-btn fs-btn--secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )}
        </div>
        <div className="fs-error-quip">{quip}</div>
      </div>
    </div>
  );
}
