import type { CSSProperties } from 'react';
import type { ACPConnectionInfo } from '../../hooks/useACPConnections';
import type { AgentSummary } from '../../types';
import { ConnectionIcon } from './ConnectionIcon';
import { getACPConnectionStatusView } from './utils';

export function ACPConnectionDetailModal({
  conn,
  agents,
  onClose,
}: {
  conn: ACPConnectionInfo;
  agents: AgentSummary[];
  onClose: () => void;
}) {
  const { isConnecting, statusLabel, statusColor } =
    getACPConnectionStatusView(conn);

  const sectionLabel: CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <ConnectionIcon icon={conn.icon} size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{conn.name}</div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
              }}
            >
              {conn.id}
            </div>
          </div>
          <span
            className="acp-badge"
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
              color: statusColor,
            }}
          >
            <span
              className={`acp-badge__dot${isConnecting ? ' acp-badge__dot--pulse' : ''}`}
              style={{ background: statusColor }}
            />
            {statusLabel}
          </span>
        </div>

        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={sectionLabel}>Command</div>
            <code
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                background: 'var(--bg-tertiary)',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'block',
                fontFamily: 'monospace',
              }}
            >
              {conn.command} {(conn.args || []).join(' ')}
            </code>
            {conn.cwd && (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}
              >
                📁 {conn.cwd}
              </div>
            )}
          </div>

          {agents.length > 0 && (
            <div>
              <div style={sectionLabel}>Agents ({agents.length})</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {agents.map((agent) => (
                  <div
                    key={agent.slug}
                    style={{
                      fontSize: '13px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-tertiary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{agent.name}</span>
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                        }}
                      >
                        {agent.slug}
                      </span>
                    </div>
                    {agent.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                        }}
                      >
                        {agent.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {conn.configOptions && conn.configOptions.length > 0 && (
            <div>
              <div style={sectionLabel}>Configuration</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                {conn.configOptions.map((opt, index) => (
                  <div
                    key={index}
                    style={{
                      fontSize: '13px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-tertiary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {opt.category}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {opt.currentValue || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {conn.sessionId && (
            <div>
              <div style={sectionLabel}>Session</div>
              <code
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'monospace',
                }}
              >
                {conn.sessionId}
              </code>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-primary)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="button button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
