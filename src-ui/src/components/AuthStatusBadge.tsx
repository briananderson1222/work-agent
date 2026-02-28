import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

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

  // No auth provider configured — don't show the badge
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
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
  const label =
    status === 'valid' || status === 'expiring' ? timeLeft() : status;

  const handleRenew = () => {
    setShowConfirm(false);
    renew();
  };

  const confirmModal = showConfirm && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={() => setShowConfirm(false)}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #1e1e1e)',
          border: '1px solid var(--border-primary, #333)',
          borderRadius: '8px',
          padding: '20px',
          maxWidth: '360px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600 }}>
          Renew Authentication
        </h3>
        <p
          style={{
            margin: '0 0 16px',
            fontSize: '13px',
            color: 'var(--text-secondary, #999)',
          }}
        >
          This will attempt to renew your authentication.
          {provider ? ` Provider: ${provider}` : ''}
        </p>
        <div
          style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
        >
          <button
            onClick={() => setShowConfirm(false)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              background: 'transparent',
              border: '1px solid var(--border-primary, #333)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-secondary, #999)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={isRenewing}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              background: 'var(--accent-primary, #3b82f6)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'white',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: `${color}15`,
            border: `1px solid ${color}30`,
            color,
            cursor: isRenewing ? 'wait' : 'pointer',
          }}
        >
          {isRenewing ? (
            <span
              style={{
                width: 7,
                height: 7,
                border: '1.5px solid #666',
                borderTop: `1.5px solid ${color}`,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
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
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {confirmModal}
      </>
    );
  }

  if (inline) {
    return (
      <>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color,
          }}
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          border: `1px solid ${color}30`,
          borderRadius: '4px',
          background: `${color}15`,
          cursor: isRenewing ? 'wait' : 'pointer',
          fontSize: '11px',
          color: 'var(--text-secondary, #9ca3af)',
        }}
      >
        {isRenewing ? (
          <span
            style={{
              width: 6,
              height: 6,
              border: '1.5px solid #666',
              borderTop: `1.5px solid ${color}`,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        ) : (
          dot
        )}
        <span style={{ color }}>{label}</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </button>
      {confirmModal}
    </>
  );
}
