/**
 * OnboardingGate keeps initial server-connect failures blocking, but backend
 * setup is now non-blocking so the rest of the app remains usable while
 * testing provider integrations.
 */

import { ConnectionManagerModal, useConnections } from '@stallion-ai/connect';
import { FullScreenError, FullScreenLoader } from '@stallion-ai/sdk';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { checkServerHealth } from '../lib/serverHealth';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: status, isLoading, isError } = useSystemStatus();
  const { apiBase, activeConnection } = useConnections();
  const [showModal, setShowModal] = useState(false);
  const [dismissedSetupBanner, setDismissedSetupBanner] = useState(false);

  const wasConnected = useRef(false);
  const hasShownError = useRef(false);

  useEffect(() => {
    if (status?.ready) {
      wasConnected.current = true;
      hasShownError.current = false;
      setDismissedSetupBanner(false);
    }
  }, [status?.ready]);

  if (isLoading && !hasShownError.current) {
    return <FullScreenLoader label="loading" />;
  }

  if (isError || !status) {
    hasShownError.current = true;

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

    return (
      <>
        <FullScreenError
          title="Can't reach server"
          description={`Could not connect to ${apiBase}. If connecting from another device, use your server's IP address instead of localhost.`}
          onRetry={() => setShowModal(true)}
          retryLabel="Manage Connections"
        />
        <ConnectionManagerModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          checkHealth={checkServerHealth}
        />
      </>
    );
  }

  return (
    <>
      {!status.ready && !dismissedSetupBanner && (
        <SetupBanner
          onManage={() => setShowModal(true)}
          onDismiss={() => setDismissedSetupBanner(true)}
        />
      )}
      {children}
      <ConnectionManagerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        checkHealth={checkServerHealth}
      />
    </>
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
      <button type="button" onClick={onManage} style={secondaryButtonStyle}>
        Manage
      </button>
    </div>
  );
}

function SetupBanner({
  onManage,
  onDismiss,
}: {
  onManage: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9000,
        width: 'min(420px, calc(100vw - 32px))',
        borderRadius: 14,
        border: '1px solid rgba(59, 130, 246, 0.22)',
        background:
          'linear-gradient(180deg, rgba(10,18,34,0.97), rgba(9,13,24,0.97))',
        color: '#e5eefc',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            No AI connection configured yet
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(229, 238, 252, 0.78)',
            }}
          >
            You can use the app now. When you're ready, open Connections to set
            up Bedrock, Claude, Codex, or ACP.
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss setup banner"
          onClick={onDismiss}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'rgba(229, 238, 252, 0.7)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 14,
          flexWrap: 'wrap',
        }}
      >
        <button type="button" onClick={onManage} style={primaryButtonStyle}>
          Manage Connections
        </button>
        <button type="button" onClick={onDismiss} style={secondaryButtonStyle}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  background: '#2563eb',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: '9px 12px',
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.08)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  padding: '8px 10px',
};
