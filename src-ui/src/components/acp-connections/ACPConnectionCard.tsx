import { useState } from 'react';
import type { ACPConnectionInfo } from '../../hooks/useACPConnections';
import type { AgentSummary } from '../../types';
import { ConfirmModal } from '../ConfirmModal';
import { ConnectionIcon } from './ConnectionIcon';
import { getACPConnectionStatusView } from './utils';

export function ACPConnectionCard({
  conn,
  agents,
  onClick,
  onToggle,
  onRemove,
  onReconnect,
}: {
  conn: ACPConnectionInfo;
  agents: AgentSummary[];
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onReconnect: () => void;
}) {
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const {
    isConnected,
    isConnecting,
    isUnavailable,
    isError,
    isDisconnected,
    isPlugin,
    statusLabel,
    statusColor,
  } = getACPConnectionStatusView(conn);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${isConnecting ? 'var(--accent-acp)' : 'var(--color-border)'}`,
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.3s, opacity 0.3s',
        opacity: isUnavailable || (!conn.enabled && !isConnecting) ? 0.55 : 1,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'var(--accent-acp)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'var(--color-border)')
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ConnectionIcon icon={conn.icon} size={32} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600 }}>
                {conn.name}
              </span>
              {isPlugin && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background:
                      'color-mix(in srgb, var(--text-muted) 15%, transparent)',
                    color: 'var(--text-muted)',
                  }}
                >
                  via plugin
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
              }}
            >
              {conn.command} {(conn.args || []).join(' ')}
            </div>
            {conn.cwd && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'monospace',
                  marginTop: '2px',
                }}
              >
                📁 {conn.cwd}
              </div>
            )}
          </div>
        </div>
        <span
          className="acp-badge"
          style={{
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

      {isConnected && agents.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {agents.length} agents
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {agents.slice(0, 8).map((agent) => (
              <span
                key={agent.slug}
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background:
                    'color-mix(in srgb, var(--accent-acp) 12%, transparent)',
                  color: 'var(--accent-acp)',
                  border:
                    '1px solid color-mix(in srgb, var(--accent-acp) 25%, transparent)',
                }}
              >
                {agent.name}
              </span>
            ))}
            {agents.length > 8 && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  color: 'var(--text-muted)',
                }}
              >
                +{agents.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button
          className={`button button--small ${conn.enabled ? 'button--success' : 'button--secondary'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (conn.enabled) setShowDisableConfirm(true);
            else onToggle(true);
          }}
        >
          {conn.enabled ? '● Enabled' : '○ Disabled'}
        </button>
        {(isDisconnected || isError) && conn.enabled && (
          <button
            className="button button--small button--secondary"
            onClick={(e) => {
              e.stopPropagation();
              onReconnect();
            }}
          >
            ↻ Reconnect
          </button>
        )}
        <div style={{ flex: 1 }} />
        {!isPlugin && (
          <button
            className="button button--small button--danger-outline"
            onClick={(e) => {
              e.stopPropagation();
              setShowRemoveConfirm(true);
            }}
          >
            Remove
          </button>
        )}
      </div>
      <ConfirmModal
        isOpen={showDisableConfirm}
        title="Disable Connection"
        message={`Disable "${conn.name}"? This will disconnect the ACP session and its agents will become unavailable.`}
        confirmLabel="Disable"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setShowDisableConfirm(false);
          onToggle(false);
        }}
        onCancel={() => setShowDisableConfirm(false)}
      />
      <ConfirmModal
        isOpen={showRemoveConfirm}
        title="Remove Connection"
        message={`Remove "${conn.name}"? This will permanently delete the connection configuration.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setShowRemoveConfirm(false);
          onRemove();
        }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}
