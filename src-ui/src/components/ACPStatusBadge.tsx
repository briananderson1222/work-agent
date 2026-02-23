import { useState, useEffect } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

export function ACPStatusBadge() {
  const { apiBase } = useApiBase();
  const [connectedCount, setConnectedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/acp/status`);
        if (!res.ok) return;
        const { data } = await res.json();
        if (mounted) {
          const conns = data.connections || [];
          setTotalCount(conns.length);
          setConnectedCount(conns.filter((c: any) => c.status === 'connected').length);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [apiBase]);

  if (totalCount === 0) return null;

  const allConnected = connectedCount === totalCount;
  const someConnected = connectedCount > 0;
  const color = allConnected ? '#22c55e' : someConnected ? '#f59e0b' : '#ef4444';

  return (
    <span
      title={`ACP: ${connectedCount}/${totalCount} connected`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', color, padding: '4px 8px', borderRadius: '4px',
        background: `${color}15`, border: `1px solid ${color}30`, cursor: 'default',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
      ACP {connectedCount > 1 ? `${connectedCount}/${totalCount}` : ''}
    </span>
  );
}
