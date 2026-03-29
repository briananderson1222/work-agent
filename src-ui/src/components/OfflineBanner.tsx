import { useConnectionStatus } from '@stallion-ai/connect';

function checkServerHealth(url: string): Promise<boolean> {
  return fetch(`${url}/api/system/status`)
    .then((r) => r.ok)
    .catch(() => false);
}

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
