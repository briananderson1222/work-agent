import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type ACPConnectionInfo,
  useACPConnections,
} from '../hooks/useACPConnections';
import type { AgentSummary } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ACPConnectionsSectionProps {
  acpAgents: AgentSummary[];
  apiBase: string;
}

function ConnectionIcon({ icon, size = 24 }: { icon?: string; size?: number }) {
  if (icon && (icon.startsWith('http') || icon.startsWith('/'))) {
    return (
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size, borderRadius: 4 }}
      />
    );
  }
  if (icon) return <span style={{ fontSize: size * 0.75 }}>{icon}</span>;
  // Default: contact-card style SVG
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--text-muted)' }}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="9" cy="11" r="2.5" />
      <path d="M5 18c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
      <line x1="16" y1="9" x2="20" y2="9" />
      <line x1="16" y1="13" x2="20" y2="13" />
    </svg>
  );
}

export function ACPConnectionsSection({
  acpAgents,
  apiBase,
}: ACPConnectionsSectionProps) {
  const { data: connections = [] } = useACPConnections();
  const queryClient = useQueryClient();
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [selectedConn, setSelectedConn] = useState<ACPConnectionInfo | null>(
    null,
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['acp-connections'] });

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`${apiBase}/acp/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    refresh();
  };

  const removeConnection = async (id: string) => {
    await fetch(`${apiBase}/acp/connections/${id}`, { method: 'DELETE' });
    refresh();
  };

  const addConnection = async (data: any) => {
    await fetch(`${apiBase}/acp/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        args:
          typeof data.args === 'string' ? data.args.split(/\s+/) : data.args,
      }),
    });
    setShowCustomModal(false);
    refresh();
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '32px',
          marginBottom: '12px',
        }}
      >
        <h2
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--accent-acp)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          Agent Client Protocol (ACP)
        </h2>
        <button
          className="button button--secondary"
          onClick={() => setShowCustomModal(true)}
        >
          + Add Connection
        </button>
      </div>

      {showCustomModal && (
        <AddConnectionModal
          onAdd={addConnection}
          onCancel={() => setShowCustomModal(false)}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {connections.map((conn) => (
          <ConnectionCard
            key={conn.id}
            conn={conn}
            agents={acpAgents.filter((a) => a.slug.startsWith(`${conn.id}-`))}
            onClick={() => setSelectedConn(conn)}
            onToggle={(enabled) => toggleEnabled(conn.id, enabled)}
            onRemove={() => removeConnection(conn.id)}
          />
        ))}
      </div>

      {connections.length === 0 && (
        <div className="acp-empty">
          <ConnectionIcon size={48} />
          <p className="acp-empty__text">No ACP connections configured</p>
          <p className="acp-empty__hint">
            Add a connection or install a plugin that provides one
          </p>
        </div>
      )}

      {selectedConn && (
        <ConnectionDetailModal
          conn={selectedConn}
          agents={acpAgents.filter((a) =>
            a.slug.startsWith(`${selectedConn.id}-`),
          )}
          onClose={() => setSelectedConn(null)}
        />
      )}
    </>
  );
}

function ConnectionCard({
  conn,
  agents,
  onClick,
  onToggle,
  onRemove,
}: {
  conn: ACPConnectionInfo;
  agents: AgentSummary[];
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const isConnected = conn.status === 'connected';
  const isConnecting = conn.status === 'connecting';
  const isUnavailable = conn.status === 'unavailable';
  const isError = conn.status === 'error';
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
              <span style={{ fontSize: '16px', fontWeight: 600 }}>{conn.name}</span>
              {isPlugin && (
                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'color-mix(in srgb, var(--text-muted) 15%, transparent)', color: 'var(--text-muted)' }}>
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
            {agents.slice(0, 8).map((a) => (
              <span
                key={a.slug}
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
                {a.name}
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

function AddConnectionModal({
  onAdd,
  onCancel,
}: {
  onAdd: (data: {
    id: string;
    name: string;
    command: string;
    args: string;
    icon: string;
    cwd: string;
  }) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [icon, setIcon] = useState('');
  const [cwd, setCwd] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog acp-custom-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Custom ACP Connection</h3>
        </div>
        <div className="modal-body">
          <div className="acp-custom-modal__grid">
            <div>
              <label className="acp-custom-modal__label">ID (slug)</label>
              <input
                className="acp-custom-modal__input"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="gemini"
              />
            </div>
            <div>
              <label className="acp-custom-modal__label">Display Name</label>
              <input
                className="acp-custom-modal__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gemini CLI"
              />
            </div>
            <div>
              <label className="acp-custom-modal__label">Command</label>
              <input
                className="acp-custom-modal__input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="gemini"
              />
            </div>
            <div>
              <label className="acp-custom-modal__label">Arguments</label>
              <input
                className="acp-custom-modal__input"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--acp"
              />
            </div>
            <div>
              <label className="acp-custom-modal__label">
                Icon (emoji or URL)
              </label>
              <input
                className="acp-custom-modal__input"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Emoji or image URL"
              />
            </div>
            <div>
              <label className="acp-custom-modal__label">
                Working Directory
              </label>
              <input
                className="acp-custom-modal__input"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="(defaults to server cwd)"
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button button--primary"
            onClick={() =>
              id &&
              command &&
              onAdd({ id, name: name || id, command, args, icon, cwd })
            }
            disabled={!id || !command}
          >
            Add Connection
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectionDetailModal({
  conn,
  agents,
  onClose,
}: {
  conn: ACPConnectionInfo;
  agents: AgentSummary[];
  onClose: () => void;
}) {
  const isConnected = conn.status === 'connected';
  const isConnecting = conn.status === 'connecting';
  const isUnavailable = conn.status === 'unavailable';
  const isError = conn.status === 'error';
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

  const sectionLabel: React.CSSProperties = {
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
        {/* Header */}
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

        {/* Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Command */}
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

          {/* Agents */}
          {agents.length > 0 && (
            <div>
              <div style={sectionLabel}>Agents ({agents.length})</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {agents.map((a) => (
                  <div
                    key={a.slug}
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
                      <span style={{ fontWeight: 500 }}>{a.name}</span>
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                        }}
                      >
                        {a.slug}
                      </span>
                    </div>
                    {a.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                        }}
                      >
                        {a.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config Options */}
          {conn.configOptions && conn.configOptions.length > 0 && (
            <div>
              <div style={sectionLabel}>Configuration</div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
              >
                {conn.configOptions.map((opt, i) => (
                  <div
                    key={i}
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

          {/* Session ID */}
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

        {/* Footer */}
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
