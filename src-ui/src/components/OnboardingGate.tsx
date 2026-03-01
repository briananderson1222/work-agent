/**
 * OnboardingGate — full-screen gate when no chat backend is configured.
 * Blocks app access until Bedrock credentials or ACP connection is detected.
 * Shows a reconnect banner (non-blocking) when connection is lost after being established.
 */

import { ConnectionManagerModal, useConnections } from '@stallion-ai/connect';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useSystemStatus, verifyBedrock } from '../hooks/useSystemStatus';
import { useBranding } from '../hooks/useBranding';

function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`).then((r) => r.ok).catch(() => false);
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: status, isLoading, isError } = useSystemStatus();
  const { apiBase, activeConnection } = useConnections();
  const { appName, welcomeMessage } = useBranding();
  const [path, setPath] = useState<'bedrock' | 'acp' | null>(null);
  const [serverUrl, setServerUrl] = useState(apiBase);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    error?: string;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Track whether we've ever been successfully connected
  const wasConnected = useRef(false);
  useEffect(() => {
    if (status?.ready) wasConnected.current = true;
  }, [status?.ready]);

  // Keep manual server URL input in sync with active connection
  useEffect(() => {
    setServerUrl(apiBase);
  }, [apiBase]);

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #0a0a0a)',
          color: 'var(--text-secondary, #999)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src="/favicon.png"
            alt=""
            style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.7 }}
          />
          <div style={{ fontSize: 14 }}>Checking system status…</div>
        </div>
      </div>
    );
  }

  // Can't reach server
  if (isError || !status) {
    // If we were previously connected, show a non-blocking reconnect banner
    if (wasConnected.current) {
      return (
        <>
          <ReconnectBanner
            serverName={activeConnection?.name || apiBase}
            onManage={() => setShowModal(true)}
          />
          {children}
          <ConnectionManagerModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            checkHealth={checkServerHealth}
          />
        </>
      );
    }

    // First-time connection failure — full blocking screen
    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg-primary, #0a0a0a)',
            color: 'var(--text-primary, #e5e5e5)',
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <img
              src="/favicon.png"
              alt=""
              style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.7 }}
            />
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>
              Can't reach server
            </h2>
            <p
              style={{
                margin: '0 0 24px',
                fontSize: 13,
                color: 'var(--text-secondary, #999)',
                lineHeight: 1.5,
              }}
            >
              Could not connect to <code style={codeStyle}>{apiBase}</code>. On
              Android, enter your server's IP address instead of localhost.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.x:3141"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  fontSize: 13,
                  background: 'var(--bg-secondary, #1a1a1a)',
                  border: '1px solid var(--border-primary, #333)',
                  borderRadius: 8,
                  color: 'var(--text-primary, #e5e5e5)',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setShowModal(true);
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => setShowModal(true)}
                style={buttonStyle}
              >
                Manage Connections
              </button>
            </div>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 12,
                color: 'var(--text-muted, #666)',
              }}
            >
              Run the server on your computer and enter its local IP (e.g.{' '}
              <code style={codeStyle}>http://192.168.1.50:3141</code>)
            </p>
          </div>
        </div>
        <ConnectionManagerModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          checkHealth={checkServerHealth}
        />
      </>
    );
  }

  // Ready — render the app
  if (status.ready) return <>{children}</>;

  // Not ready — show onboarding
  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const result = await verifyBedrock(apiBase);
    setVerifyResult(result);
    setVerifying(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary, #0a0a0a)',
        color: 'var(--text-primary, #e5e5e5)',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/favicon.png"
            alt=""
            style={{ width: 56, height: 56, marginBottom: 16 }}
          />
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 600 }}>
            {welcomeMessage || `Welcome to ${appName}`}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: 'var(--text-secondary, #999)',
            }}
          >
            To get started, set up at least one AI backend.
          </p>
        </div>

        {!path ? (
          /* Path selection */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PathCard
              icon="🧠"
              title="AWS Bedrock"
              description="Use AWS credentials to access foundation models directly. Required for creating custom agents."
              onClick={() => setPath('bedrock')}
              status={
                status.bedrock.credentialsFound
                  ? '✓ Credentials detected'
                  : undefined
              }
            />
            <PathCard
              icon="🔌"
              title="ACP (kiro-cli)"
              description="Connect to kiro-cli or other ACP-compatible agents. Chat works immediately once connected."
              onClick={() => setPath('acp')}
              status={status.acp.connected ? '✓ Connected' : undefined}
            />
          </div>
        ) : path === 'bedrock' ? (
          /* Bedrock setup */
          <div>
            <button
              onClick={() => setPath(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #3b82f6)',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                marginBottom: 16,
              }}
            >
              ← Back
            </button>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>
              Set up AWS Bedrock
            </h2>

            <div
              style={{
                background: 'var(--bg-secondary, #1a1a1a)',
                border: '1px solid var(--border-primary, #333)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                Configure AWS credentials using any of these methods:
              </p>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <li>
                  <strong>Environment variables</strong> — set{' '}
                  <code style={codeStyle}>AWS_ACCESS_KEY_ID</code> and{' '}
                  <code style={codeStyle}>AWS_SECRET_ACCESS_KEY</code>
                </li>
                <li>
                  <strong>Shared credentials file</strong> — configure{' '}
                  <code style={codeStyle}>~/.aws/credentials</code>
                </li>
                <li>
                  <strong>AWS SSO</strong> — run{' '}
                  <code style={codeStyle}>aws sso login</code>
                </li>
                <li>
                  <strong>IAM role</strong> — if running on an EC2 instance or
                  ECS task
                </li>
              </ol>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <StatusDot found={status.bedrock.credentialsFound} />
              <span style={{ fontSize: 13 }}>
                {status.bedrock.credentialsFound
                  ? 'Credentials detected'
                  : 'No credentials found — configure and check again'}
              </span>
            </div>

            {status.bedrock.credentialsFound && (
              <>
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  style={buttonStyle}
                >
                  {verifying
                    ? 'Verifying Bedrock access…'
                    : 'Verify Bedrock Access'}
                </button>
                {verifyResult && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: verifyResult.verified
                        ? 'var(--success-text, #22c55e)'
                        : 'var(--error-text, #ef4444)',
                    }}
                  >
                    {verifyResult.verified
                      ? '✓ Bedrock access confirmed!'
                      : `✗ ${verifyResult.error || 'Verification failed'}`}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ACP setup */
          <div>
            <button
              onClick={() => setPath(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary, #3b82f6)',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                marginBottom: 16,
              }}
            >
              ← Back
            </button>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>
              Set up ACP (kiro-cli)
            </h2>

            <div
              style={{
                background: 'var(--bg-secondary, #1a1a1a)',
                border: '1px solid var(--border-primary, #333)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: '0 0 12px', fontWeight: 500 }}>
                Steps to connect:
              </p>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <li>
                  Install <strong>kiro-cli</strong> if you haven't already
                </li>
                <li>
                  The default ACP connection to kiro-cli is pre-configured
                </li>
                <li>
                  Once kiro-cli is available on your PATH, it will connect
                  automatically
                </li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusDot found={status.acp.connected} />
              <span style={{ fontSize: 13 }}>
                {status.acp.connected
                  ? 'ACP connected!'
                  : 'Waiting for ACP connection…'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReconnectBanner({
  serverName,
  onManage,
}: {
  serverName: string;
  onManage: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9000,
        background: '#7c2d12',
        color: '#fed7aa',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        gap: 8,
      }}
    >
      <span>
        Lost connection to <strong>{serverName}</strong>. The app is still
        usable; changes may not save.
      </span>
      <button
        type="button"
        onClick={onManage}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 6,
          color: 'inherit',
          padding: '3px 10px',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Manage
      </button>
    </div>
  );
}

function PathCard({
  icon,
  title,
  description,
  onClick,
  status,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  status?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        padding: 20,
        textAlign: 'left',
        background: 'var(--bg-secondary, #1a1a1a)',
        border: '1px solid var(--border-primary, #333)',
        borderRadius: 12,
        cursor: 'pointer',
        color: 'inherit',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'var(--accent-primary, #3b82f6)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'var(--border-primary, #333)')
      }
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary, #999)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
        {status && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--success-text, #22c55e)',
              marginTop: 8,
            }}
          >
            {status}
          </div>
        )}
      </div>
      <span style={{ color: 'var(--text-muted, #666)', fontSize: 18 }}>→</span>
    </button>
  );
}

function StatusDot({ found }: { found: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: found ? '#22c55e' : '#ef4444',
        flexShrink: 0,
      }}
    />
  );
}

const codeStyle: React.CSSProperties = {
  padding: '2px 6px',
  background: 'var(--bg-tertiary, #252525)',
  borderRadius: 4,
  fontSize: '0.85em',
};
const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--accent-primary, #3b82f6)',
  color: 'white',
};
