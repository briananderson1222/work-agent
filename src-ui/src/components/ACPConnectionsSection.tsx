import { useState, useEffect, useCallback } from 'react';
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
}

function ConnectionIcon({ icon, size = 24 }: { icon?: string; size?: number }) {
  if (!icon) return <span style={{ fontSize: size * 0.75 }}>🔌</span>;
  if (icon.startsWith('http')) {
    return <img src={icon} alt="" style={{ width: size, height: size, borderRadius: 4 }} />;
  }
  return <span style={{ fontSize: size * 0.75 }}>{icon}</span>;
}

export function ACPConnectionsSection({ acpAgents, apiBase }: ACPConnectionsSectionProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

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
    if (!confirm(`Remove ACP connection "${id}"?`)) return;
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
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#f90', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🔌 ACP Connections
        </h2>
        <button onClick={() => setShowAddForm(!showAddForm)}
          style={{ fontSize: '13px', padding: '6px 12px', background: '#f9015', color: '#f90', border: '1px solid #f9030', borderRadius: '6px', cursor: 'pointer' }}>
          + Add Connection
        </button>
      </div>

      {showAddForm && <AddConnectionForm onAdd={addConnection} onCancel={() => setShowAddForm(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {connections.map(conn => (
          <ConnectionCard key={conn.id} conn={conn}
            agents={acpAgents.filter(a => a.slug.startsWith(conn.id + '-'))}
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
    </>
  );
}

function ConnectionCard({ conn, agents, onToggle, onRemove }: {
  conn: ConnectionInfo; agents: AgentSummary[];
  onToggle: (enabled: boolean) => void; onRemove: () => void;
}) {
  const isConnected = conn.status === 'connected';
  const statusColor = isConnected ? '#4caf50' : conn.status === 'connecting' ? '#ff9800' : conn.status === 'error' ? '#f44336' : '#666';

  return (
    <div style={{
      background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
      borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
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
          padding: '3px 8px', borderRadius: '4px', background: `${statusColor}15`, color: statusColor,
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
          {conn.status}
        </span>
      </div>

      {isConnected && conn.modes.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {conn.modes.length} modes
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {conn.modes.slice(0, 8).map(m => (
              <span key={m} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: '#f9010', color: '#f90', border: '1px solid #f9020' }}>{m}</span>
            ))}
            {conn.modes.length > 8 && (
              <span style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--text-muted)' }}>+{conn.modes.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button onClick={() => onToggle(!conn.enabled)}
          style={{
            fontSize: '12px', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--color-border)',
            background: conn.enabled ? '#4caf5015' : 'var(--color-bg)', color: conn.enabled ? '#4caf50' : 'var(--text-muted)',
          }}>
          {conn.enabled ? '● Enabled' : '○ Disabled'}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onRemove}
          style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #f4434430', background: '#f4434410', color: '#f44336' }}>
          Remove
        </button>
      </div>
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
      background: 'var(--color-bg-secondary)', border: '1px solid #f9030', borderRadius: '12px',
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
        <button onClick={onCancel} style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--text-primary)' }}>
          Cancel
        </button>
        <button onClick={() => id && command && onAdd({ id, name: name || id, command, args, icon, cwd })}
          disabled={!id || !command}
          style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: '#f90', color: '#000', fontWeight: 600, opacity: (!id || !command) ? 0.5 : 1 }}>
          Add Connection
        </button>
      </div>
    </div>
  );
}
