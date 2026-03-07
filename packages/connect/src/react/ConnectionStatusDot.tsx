
import type { ConnectionStatus } from '../core/types';

const COLOR: Record<ConnectionStatus, string> = {
  connected: '#22c55e',
  connecting: '#eab308',
  error: '#ef4444',
};

export interface ConnectionStatusDotProps {
  status: ConnectionStatus;
  size?: number;
}

export function ConnectionStatusDot({
  status,
  size = 8,
}: ConnectionStatusDotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLOR[status],
        flexShrink: 0,
      }}
      aria-label={status}
    />
  );
}
