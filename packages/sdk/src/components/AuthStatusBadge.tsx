import { useState } from 'react';
import { useAuth } from '../hooks';
import './AuthStatusBadge.css';

export function AuthStatusBadge({
  inline,
  expanded,
}: {
  inline?: boolean;
  expanded?: boolean;
}) {
  const { status, expiresAt, renew, isRenewing, provider } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);

  if (status === 'loading') return null;
  if (!provider || provider === 'none') return null;

  const color =
    status === 'valid'
      ? '#22c55e'
      : status === 'expiring'
        ? '#f59e0b'
        : '#ef4444';

  const timeLeft = () => {
    if (!expiresAt) return '';
    const diff = expiresAt.getTime() - Date.now();
    if (diff <= 0) return 'expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  };

  const dot = (
    <span className="auth-badge__dot" style={{ background: color }} />
  );
  const label =
    status === 'valid' || status === 'expiring' ? timeLeft() : status;

  const handleRenew = () => {
    setShowConfirm(false);
    renew();
  };

  const confirmModal = showConfirm && (
    <div
      className="auth-badge-modal-overlay"
      onClick={() => setShowConfirm(false)}
    >
      <div
        className="auth-badge-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="auth-badge-modal__title">Renew Authentication</h3>
        <p className="auth-badge-modal__text">
          This will attempt to renew your authentication.
          {provider ? ` Provider: ${provider}` : ''}
        </p>
        <div className="auth-badge-modal__actions">
          <button
            onClick={() => setShowConfirm(false)}
            className="auth-badge-modal__cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={isRenewing}
            className="auth-badge-modal__confirm"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Open Terminal
          </button>
        </div>
      </div>
    </div>
  );

  if (expanded) {
    return (
      <>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isRenewing}
          className="auth-badge auth-badge--expanded"
          style={{
            background: `${color}15`,
            border: `1px solid ${color}30`,
            color,
            cursor: isRenewing ? 'wait' : 'pointer',
          }}
        >
          {isRenewing ? (
            <span
              className="auth-badge__spinner auth-badge__spinner--expanded"
              style={{ borderTopColor: color }}
            />
          ) : (
            dot
          )}
          🔐 {provider} —{' '}
          {isRenewing
            ? 'Renewing...'
            : status === 'valid' || status === 'expiring'
              ? `expires ${expiresAt?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : status || 'click to renew'}
        </button>
        {confirmModal}
      </>
    );
  }

  if (inline) {
    return (
      <>
        <span
          className="auth-badge auth-badge--inline"
          style={{ color }}
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          title={
            status === 'valid'
              ? `Auth valid — ${timeLeft()} remaining`
              : 'Click to renew'
          }
        >
          {dot}
          <span>{label}</span>
        </span>
        {confirmModal}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isRenewing}
        title={
          status === 'valid'
            ? `Auth valid — ${timeLeft()} remaining`
            : 'Click to renew authentication'
        }
        className="auth-badge auth-badge--compact"
        style={{
          border: `1px solid ${color}30`,
          background: `${color}15`,
          cursor: isRenewing ? 'wait' : 'pointer',
        }}
      >
        {isRenewing ? (
          <span
            className="auth-badge__spinner auth-badge__spinner--compact"
            style={{ borderTopColor: color }}
          />
        ) : (
          dot
        )}
        <span style={{ color }}>{label}</span>
      </button>
      {confirmModal}
    </>
  );
}
