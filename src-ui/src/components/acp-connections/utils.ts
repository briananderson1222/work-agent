import type { ACPConnectionInfo } from '../../hooks/useACPConnections';

export function getACPConnectionStatusView(conn: ACPConnectionInfo) {
  const isConnected = conn.status === 'available';
  const isConnecting = conn.status === 'probing';
  const isUnavailable = conn.status === 'unavailable';
  const isError = conn.status === 'error';
  const isDisconnected = conn.status === 'disconnected';
  const isPlugin = conn.source === 'plugin';
  const statusLabel = isUnavailable
    ? 'not installed'
    : isConnecting
      ? 'connecting…'
      : isError
        ? 'connection failed'
        : conn.enabled
          ? conn.status
          : 'disabled';
  const statusColor = isConnected
    ? 'var(--success-text)'
    : isConnecting
      ? 'var(--accent-acp)'
      : isError
        ? 'var(--error-text)'
        : 'var(--text-muted)';

  return {
    isConnected,
    isConnecting,
    isUnavailable,
    isError,
    isDisconnected,
    isPlugin,
    statusLabel,
    statusColor,
  };
}
