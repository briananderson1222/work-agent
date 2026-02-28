/**
 * OnboardingGate — full-screen gate when no chat backend is configured.
 * Blocks app access until Bedrock credentials or ACP connection is detected.
 */

import { type ReactNode, useState } from 'react';
import { FullScreenLoader } from '@work-agent/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useBranding } from '../hooks/useBranding';
import { useSystemStatus, verifyBedrock } from '../hooks/useSystemStatus';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: status, isLoading } = useSystemStatus();
  const { apiBase } = useApiBase();
  const { appName, welcomeMessage } = useBranding();
  const [path, setPath] = useState<'bedrock' | 'acp' | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    error?: string;
  } | null>(null);

  // Loading state
  if (isLoading || !status) {
    return <FullScreenLoader message="Checking system status..." />;
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
