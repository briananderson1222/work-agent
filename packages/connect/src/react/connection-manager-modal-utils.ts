export type ConnectionManagerPanel = 'list' | 'add' | 'scan' | 'discover';

export type ConnectionHealthValue = boolean | null | undefined;

export type ConnectionStatus = 'connecting' | 'connected' | 'error';

export function getConnectionManagerTitle(
  panel: ConnectionManagerPanel,
): string {
  switch (panel) {
    case 'list':
      return 'Connections';
    case 'add':
      return 'Add Connection';
    case 'scan':
      return 'Scan QR Code';
    case 'discover':
      return 'Discover on Network';
  }
}

export function getConnectionStatus({
  connectionId,
  activeConnectionId,
  healthValue,
}: {
  connectionId: string;
  activeConnectionId: string | null | undefined;
  healthValue: ConnectionHealthValue;
}): ConnectionStatus {
  if (connectionId === activeConnectionId) {
    if (healthValue === null) return 'connecting';
    if (healthValue === true) return 'connected';
    if (healthValue === false) return 'error';
    return 'connecting';
  }

  if (healthValue === true) return 'connected';
  if (healthValue === false) return 'error';
  return 'connecting';
}
