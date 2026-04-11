import { useConnectionStatus } from '@stallion-ai/connect';
import { checkServerHealth } from '../lib/serverHealth';

export function OfflineBanner() {
  const { status } = useConnectionStatus({
    checkHealth: checkServerHealth,
    pollInterval: 10_000,
  });

  if (status !== 'error') return null;

  return (
    <div className="offline-banner" role="alert">
      <span>⚠ Unable to reach the backend — features may be unavailable</span>
    </div>
  );
}
