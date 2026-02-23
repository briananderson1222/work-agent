import { useState, useEffect } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

type ACPStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function ACPStatusBadge() {
  const { apiBase } = useApiBase();
  const [status, setStatus] = useState<ACPStatus>('disconnected');
  const [modes, setModes] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/acp/status`);
        if (!res.ok) return;
        const { data } = await res.json();
        if (mounted) {
          setStatus(data.status);
          setModes(data.modes || []);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [apiBase]);

  if (status === 'disconnected') return null;

  const colors: Record<ACPStatus, string> = {
    connected: '#4caf50',
    connecting: '#ff9800',
    error: '#f44336',
    disconnected: '#666',
  };

  const labels: Record<ACPStatus, string> = {
    connected: `kiro-cli connected (${modes.length} modes)`,
    connecting: 'kiro-cli connecting...',
    error: 'kiro-cli error',
    disconnected: '',
  };

  return (
    <span
      title={labels[status]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        color: colors[status],
        padding: '4px 8px',
        borderRadius: '4px',
        background: `${colors[status]}15`,
        border: `1px solid ${colors[status]}30`,
        cursor: 'default',
      }}
    >
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: colors[status],
        animation: status === 'connecting' ? 'pulse 1.5s infinite' : undefined,
      }} />
      ACP
    </span>
  );
}
