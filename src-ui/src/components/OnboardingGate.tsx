/**
 * OnboardingGate keeps initial server-connect failures blocking, but backend
 * setup is now non-blocking so the rest of the app remains usable while
 * testing provider integrations.
 */

import { ConnectionManagerModal, useConnections } from '@stallion-ai/connect';
import { FullScreenError, FullScreenLoader } from '@stallion-ai/sdk';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { checkServerHealth } from '../lib/serverHealth';
import {
  buildSetupBannerContent,
  setupBannerVariant,
  shouldShowSetupBanner,
} from './onboardingGateUtils';
import './OnboardingGate.css';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: status, isLoading, isError } = useSystemStatus();
  const { apiBase, activeConnection } = useConnections();
  const { navigate } = useNavigation();
  const [showModal, setShowModal] = useState(false);
  const [dismissedSetupBanner, setDismissedSetupBanner] = useState(false);

  const wasConnected = useRef(false);
  const hasShownError = useRef(false);
  const lastSetupBannerVariant = useRef<string>('hidden');

  useEffect(() => {
    if (status?.ready) {
      wasConnected.current = true;
      hasShownError.current = false;
    }

    if (!status) {
      return;
    }

    const currentVariant = setupBannerVariant(status);
    const previousVariant = lastSetupBannerVariant.current;

    if (currentVariant === 'hidden') {
      setDismissedSetupBanner(false);
    } else if (
      previousVariant !== 'hidden' &&
      previousVariant !== currentVariant
    ) {
      setDismissedSetupBanner(false);
    }

    lastSetupBannerVariant.current = currentVariant;
  }, [status]);

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

  const setupBannerVisible =
    !!status && shouldShowSetupBanner(status) && !dismissedSetupBanner;
  const setupBannerContent = status ? buildSetupBannerContent(status) : null;

  return (
    <>
      {setupBannerVisible && setupBannerContent && (
        <SetupLauncher
          content={setupBannerContent}
          onOpenTarget={() =>
            navigate(
              setupBannerContent.actionTarget === 'runtimes'
                ? '/connections/runtimes'
                : setupBannerContent.actionTarget === 'providers'
                  ? '/connections/providers'
                  : '/connections',
            )
          }
          onOpenAllConnections={() => navigate('/connections')}
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
    <div className="onboarding-reconnect-banner">
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

function SetupLauncher({
  content,
  onOpenTarget,
  onOpenAllConnections,
  onDismiss,
}: {
  content: ReturnType<typeof buildSetupBannerContent>;
  onOpenTarget: () => void;
  onOpenAllConnections: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="onboarding-setup-launcher" data-testid="setup-launcher">
      <div className="onboarding-setup-launcher__backdrop" />
      <div className="onboarding-setup-launcher__panel">
        <div className="onboarding-setup-launcher__eyebrow">First run</div>
        <div className="onboarding-setup-launcher__header">
          <div>
            <div className="onboarding-setup-launcher__title">
              {content.title}
            </div>
            <div className="onboarding-setup-launcher__description">
              {content.description}
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss setup launcher"
            onClick={onDismiss}
            className="onboarding-setup-launcher__dismiss"
          >
            ×
          </button>
        </div>

        {content.badges.length > 0 && (
          <div className="onboarding-setup-launcher__badges">
            {content.badges.map((badge) => (
              <span key={badge} className="onboarding-setup-launcher__badge">
                {badge}
              </span>
            ))}
          </div>
        )}

        <div className="onboarding-setup-launcher__steps">
          <div className="onboarding-setup-launcher__step">
            <span className="onboarding-setup-launcher__step-index">1</span>
            <div>
              <div className="onboarding-setup-launcher__step-title">
                Open the recommended setup screen
              </div>
              <div className="onboarding-setup-launcher__step-desc">
                Stallion already checked what is configured and what is
                detectable on this machine.
              </div>
            </div>
          </div>
          <div className="onboarding-setup-launcher__step">
            <span className="onboarding-setup-launcher__step-index">2</span>
            <div>
              <div className="onboarding-setup-launcher__step-title">
                Save one chat-capable connection
              </div>
              <div className="onboarding-setup-launcher__step-desc">
                One working model path is enough to get through first run.
              </div>
            </div>
          </div>
          <div className="onboarding-setup-launcher__step">
            <span className="onboarding-setup-launcher__step-index">3</span>
            <div>
              <div className="onboarding-setup-launcher__step-title">
                Come back and start chatting
              </div>
              <div className="onboarding-setup-launcher__step-desc">
                This setup launcher disappears automatically once chat is ready.
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="onboarding-setup-launcher__primary"
          onClick={onOpenTarget}
        >
          {content.actionLabel}
        </button>
        <div className="onboarding-setup-launcher__actions">
          <button
            type="button"
            onClick={onOpenAllConnections}
            style={secondaryButtonStyle}
          >
            View All Connections
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={secondaryButtonStyle}
          >
            Continue Without Setup
          </button>
        </div>
      </div>
    </div>
  );
}

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
