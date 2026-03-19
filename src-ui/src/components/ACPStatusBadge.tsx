import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useACPConnections } from '../hooks/useACPConnections';
import { useApiBase } from '../contexts/ApiBaseContext';
import { AgentIcon } from './AgentIcon';

export function ACPStatusBadge() {
  const { data: connections = [] } = useACPConnections();
  const { apiBase } = useApiBase();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showModal]);

  const enabled = connections.filter((c) => c.enabled);
  if (enabled.length === 0) return null;

  const connected = enabled.filter((c) => c.status === 'connected');
  const connecting = enabled.some((c) => c.status === 'connecting');
  const allConnected = connected.length === enabled.length;
  const someConnected = connected.length > 0;
  const color = connecting
    ? 'var(--accent-primary)'
    : allConnected
      ? 'var(--success-text)'
      : someConnected
        ? 'var(--warning-primary)'
        : 'var(--error-text)';
  const totalModes = connected.reduce((n, c) => n + c.modes.length, 0);
  const label = connecting ? 'ACP…' : 'ACP';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="acp-badge"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        }}
      >
        <span
          className={`acp-badge__dot${connecting ? ' acp-badge__dot--pulse' : ''}`}
          style={{ background: color }}
        />
        {label}
      </button>

      {showModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '380px' }}
          >
            <div className="modal-header">
              <h3>Agent Client Protocol</h3>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                }}
              >
                {connected.length}/{connections.length} connected · {totalModes}{' '}
                agents
              </span>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              {connections.map((conn) => {
                const isUp = conn.status === 'connected';
                const c = isUp
                  ? '#22c55e'
                  : conn.status === 'connecting'
                    ? '#3b82f6'
                    : '#ef4444';
                return (
                  <div
                    key={conn.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: c,
                          flexShrink: 0,
                        }}
                      />
                      <AgentIcon
                        agent={{ name: conn.name, icon: conn.icon }}
                        size={18}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '12px' }}>
                        {conn.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: c,
                          marginLeft: 'auto',
                        }}
                      >
                        {conn.status}
                      </span>
                    </div>

                    {isUp && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          paddingLeft: '12px',
                        }}
                      >
                        {conn.currentModel && (
                          <div>
                            Model:{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {conn.currentModel}
                            </span>
                          </div>
                        )}
                        <div>
                          Agents:{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {conn.modes.join(', ') || 'none'}
                          </span>
                        </div>
                        {conn.mcpServers.length > 0 && (
                          <div>
                            MCP:{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {conn.mcpServers.length} servers
                            </span>
                          </div>
                        )}
                        {conn.sessionId && (
                          <div>
                            Session:{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {conn.sessionId.substring(0, 12)}…
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {!isUp && conn.command && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          paddingLeft: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>
                          Command:{' '}
                          <code
                            style={{
                              fontSize: '10px',
                              background: 'var(--bg-tertiary)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                            }}
                          >
                            {conn.command}
                          </code>
                        </span>
                        {conn.status === 'disconnected' && (
                          <button
                            type="button"
                            className="button button--small button--secondary"
                            style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px' }}
                            onClick={async () => {
                              await fetch(`${apiBase}/acp/connections/${conn.id}/reconnect`, { method: 'POST' });
                              queryClient.invalidateQueries({ queryKey: ['acp-connections'] });
                            }}
                          >
                            ↻ Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
