import { useState, useEffect, useCallback } from 'react';
import { ConfirmModal } from './ConfirmModal';
import type { AgentSummary } from '../types';

interface ACPConnectionsSectionProps {
  acpAgents: AgentSummary[];
  apiBase: string;
}

interface ConnectionInfo {
  id: string;
  name: string;
  command: string;
  args?: string[];
  icon?: string;
  cwd?: string;
  enabled: boolean;
  status: string;
  modes: string[];
  sessionId: string | null;
  mcpServers: string[];
  configOptions?: { category: string; currentValue?: string; options?: string[] }[];
  currentModel?: string | null;
}

function ConnectionIcon({ icon, size = 24 }: { icon?: string; size?: number }) {
  if (!icon) return <span style={{ fontSize: size * 0.75 }}>🔌</span>;
  if (icon.startsWith('http') || icon.startsWith('/')) {
    return <img src={icon} alt="" style={{ width: size, height: size, borderRadius: 4 }} />;
  }
  return <span style={{ fontSize: size * 0.75 }}>{icon}</span>;
}

export function ACPConnectionsSection({ acpAgents, apiBase }: ACPConnectionsSectionProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedConn, setSelectedConn] = useState<ConnectionInfo | null>(null);

  const refresh = useCallback(() => {
    fetch(`${apiBase}/acp/connections`).then(r => r.json())
      .then(({ data }) => setConnections(data || []))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await fetch(`${apiBase}/acp/connections/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, args: data.args ? data.args.split(/\s+/) : [] }),
    });
    setShowAddForm(false);
    refresh();
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '32px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-acp)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🔌 ACP Connections
        </h2>
        <button className="button button--secondary" onClick={() => setShowAddForm(!showAddForm)}>
          + Add Connection
        </button>
      </div>

      {showAddForm && <AddConnectionForm onAdd={addConnection} onCancel={() => setShowAddForm(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {connections.map(conn => (
          <ConnectionCard key={conn.id} conn={conn}
            agents={acpAgents.filter(a => a.slug.startsWith(conn.id + '-'))}
            onClick={() => setSelectedConn(conn)}
            onToggle={(enabled) => toggleEnabled(conn.id, enabled)}
            onRemove={() => removeConnection(conn.id)} />
        ))}
      </div>

      {connections.length === 0 && !showAddForm && (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--color-bg-secondary)', border: '1px dashed var(--border-primary)', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔌</div>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-secondary)' }}>No ACP connections configured</p>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Add a connection to use external AI agents like kiro-cli, Gemini CLI, or Goose
          </p>
        </div>
      )}

      {selectedConn && (
        <ConnectionDetailModal
          conn={selectedConn}
          agents={acpAgents.filter(a => a.slug.startsWith(selectedConn.id + '-'))}
          onClose={() => setSelectedConn(null)}
        />
      )}
    </>
  );
}

function ConnectionCard({ conn, agents, onClick, onToggle, onRemove }: {
  conn: ConnectionInfo; agents: AgentSummary[];
  onClick: () => void; onToggle: (enabled: boolean) => void; onRemove: () => void;
}) {
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const isConnected = conn.status === 'connected';
  const statusColor = isConnected ? 'var(--success-text)' : conn.status === 'connecting' ? 'var(--accent-acp)' : conn.status === 'error' ? 'var(--error-text)' : 'var(--text-muted)';

  return (
    <div onClick={onClick} style={{
      background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
      borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
      cursor: 'pointer', transition: 'border-color 0.2s',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-acp)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ConnectionIcon icon={conn.icon} size={32} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>{conn.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {conn.command} {(conn.args || []).join(' ')}
            </div>
            {conn.cwd && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                📁 {conn.cwd}
              </div>
            )}
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500,
          padding: '3px 8px', borderRadius: '4px', background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor,
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
          {conn.status}
        </span>
      </div>

      {isConnected && agents.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {agents.length} agents
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {agents.slice(0, 8).map(a => (
              <span key={a.slug} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--accent-acp) 12%, transparent)', color: 'var(--accent-acp)', border: '1px solid color-mix(in srgb, var(--accent-acp) 25%, transparent)' }}>{a.name}</span>
            ))}
            {agents.length > 8 && (
              <span style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--text-muted)' }}>+{agents.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button className={`button button--small ${conn.enabled ? 'button--success' : 'button--secondary'}`} onClick={e => { e.stopPropagation(); if (conn.enabled) setShowDisableConfirm(true); else onToggle(true); }}>
          {conn.enabled ? '● Enabled' : '○ Disabled'}
        </button>
        <div style={{ flex: 1 }} />
        <button className="button button--small button--danger-outline" onClick={e => { e.stopPropagation(); setShowRemoveConfirm(true); }}>
          Remove
        </button>
      </div>
      <ConfirmModal
        isOpen={showDisableConfirm}
        title="Disable Connection"
        message={`Disable "${conn.name}"? This will disconnect the ACP session and its agents will become unavailable.`}
        confirmLabel="Disable"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { setShowDisableConfirm(false); onToggle(false); }}
        onCancel={() => setShowDisableConfirm(false)}
      />
      <ConfirmModal
        isOpen={showRemoveConfirm}
        title="Remove Connection"
        message={`Remove "${conn.name}"? This will permanently delete the connection configuration.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { setShowRemoveConfirm(false); onRemove(); }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}

function AddConnectionForm({ onAdd, onCancel }: {
  onAdd: (data: { id: string; name: string; command: string; args: string; icon: string; cwd: string }) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [icon, setIcon] = useState('🔌');
  const [cwd, setCwd] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px',
    border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--text-primary)',
  };

  return (
    <div style={{
      background: 'var(--color-bg-secondary)', border: '1px solid color-mix(in srgb, var(--accent-acp) 30%, transparent)', borderRadius: '12px',
      padding: '20px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Add ACP Connection</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>ID (slug)</label>
          <input style={inputStyle} value={id} onChange={e => setId(e.target.value)} placeholder="gemini" />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Display Name</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Gemini CLI" />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Command</label>
          <input style={inputStyle} value={command} onChange={e => setCommand(e.target.value)} placeholder="gemini" />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Arguments</label>
          <input style={inputStyle} value={args} onChange={e => setArgs(e.target.value)} placeholder="--acp" />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Icon (emoji or URL)</label>
          <input style={inputStyle} value={icon} onChange={e => setIcon(e.target.value)} placeholder="🔌 or https://..." />
        </div>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Working Directory</label>
          <input style={inputStyle} value={cwd} onChange={e => setCwd(e.target.value)} placeholder="(defaults to server cwd)" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="button button--secondary" onClick={onCancel}>Cancel</button>
        <button className="button button--primary" onClick={() => id && command && onAdd({ id, name: name || id, command, args, icon, cwd })}
          disabled={!id || !command}>
          Add Connection
        </button>
      </div>
    </div>
  );
}

function ConnectionDetailModal({ conn, agents, onClose }: {
  conn: ConnectionInfo; agents: AgentSummary[]; onClose: () => void;
}) {
  const isConnected = conn.status === 'connected';
  const statusColor = isConnected ? 'var(--success-text)' : conn.status === 'error' ? 'var(--error-text)' : 'var(--text-muted)';

  const sectionLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ConnectionIcon icon={conn.icon} size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{conn.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{conn.id}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '4px', background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />
            {conn.status}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Command */}
          <div>
            <div style={sectionLabel}>Command</div>
            <code style={{ fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: '6px', display: 'block', fontFamily: 'monospace' }}>
              {conn.command} {(conn.args || []).join(' ')}
            </code>
            {conn.cwd && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>📁 {conn.cwd}</div>}
          </div>

          {/* Agents */}
          {agents.length > 0 && (
            <div>
              <div style={sectionLabel}>Agents ({agents.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {agents.map(a => (
                  <div key={a.slug} style={{ fontSize: '13px', padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{a.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{a.slug}</span>
                    </div>
                    {a.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{a.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config Options */}
          {conn.configOptions && conn.configOptions.length > 0 && (
            <div>
              <div style={sectionLabel}>Configuration</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {conn.configOptions.map((opt, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{opt.category}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{opt.currentValue || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session ID */}
          {conn.sessionId && (
            <div>
              <div style={sectionLabel}>Session</div>
              <code style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{conn.sessionId}</code>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
