import { useState, useEffect } from 'react';
import type { AgentSummary } from '../types';

interface ACPConnectionsSectionProps {
  acpAgents: AgentSummary[];
  apiBase: string;
}

interface ACPStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  modes: string[];
  sessionId: string | null;
  mcpServers: string[];
}

export function ACPConnectionsSection({ acpAgents, apiBase }: ACPConnectionsSectionProps) {
  const [acpStatus, setAcpStatus] = useState<ACPStatus | null>(null);
  const [slashCommands, setSlashCommands] = useState<Array<{ name: string; description: string }>>([]);

  useEffect(() => {
    fetch(`${apiBase}/acp/status`).then(r => r.json())
      .then(({ data }) => setAcpStatus(data))
      .catch(() => {});
    fetch(`${apiBase}/acp/commands/kiro-dev`).then(r => r.json())
      .then(({ data }) => setSlashCommands(data || []))
      .catch(() => {});
  }, [apiBase]);

  // Show section even when disconnected (to show how to connect)
  const isConnected = acpStatus?.status === 'connected';
  const statusColor = isConnected ? '#4caf50' : acpStatus?.status === 'connecting' ? '#ff9800' : acpStatus?.status === 'error' ? '#f44336' : '#666';

  return (
    <>
      <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#f90', marginBottom: '12px', marginTop: '32px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        🔌 ACP Connections
      </h2>

      <div style={{
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${isConnected ? '#f9020' : 'var(--color-border)'}`,
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '32px' }}>🔌</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>kiro-cli</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                Agent Client Protocol (ACP)
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '6px',
              background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30`,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />
              {acpStatus?.status || 'disconnected'}
            </span>
            <a href="https://app.kiro.dev" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: '#f90', textDecoration: 'none', padding: '4px 10px', borderRadius: '6px', border: '1px solid #f9030', background: '#f9010' }}>
              Manage plan ↗
            </a>
          </div>
        </div>

        {isConnected && (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <Stat label="Modes" value={String(acpStatus!.modes.length)} />
              <Stat label="MCP Servers" value={String(acpStatus!.mcpServers?.length || 0)} />
              <Stat label="Commands" value={String(slashCommands.length)} />
              <Stat label="Session" value={acpStatus!.sessionId?.slice(0, 8) || '—'} mono />
            </div>

            {/* Available modes */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Available Modes ({acpAgents.length})
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {acpAgents.map(a => (
                  <span key={a.slug} style={{
                    fontSize: '12px', padding: '4px 8px', borderRadius: '4px',
                    background: '#f9010', color: '#f90', border: '1px solid #f9025',
                  }}>
                    {a.slug.replace(/^kiro-/, '')}
                  </span>
                ))}
              </div>
            </div>

            {/* MCP Servers */}
            {(acpStatus!.mcpServers?.length || 0) > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  MCP Servers
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {acpStatus!.mcpServers.map(s => (
                    <span key={s} style={{
                      fontSize: '12px', padding: '4px 8px', borderRadius: '4px',
                      background: 'var(--color-bg)', color: 'var(--text-secondary)', border: '1px solid var(--color-border)',
                    }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!isConnected && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {acpStatus?.status === 'error'
              ? 'kiro-cli connection failed. Make sure kiro-cli is installed and authenticated.'
              : acpStatus?.status === 'connecting'
              ? 'Connecting to kiro-cli...'
              : 'kiro-cli not detected. Install it to access ACP agents.'}
            <div style={{ marginTop: '8px' }}>
              <a href="https://kiro.dev/cli/" target="_blank" rel="noopener noreferrer" style={{ color: '#f90', textDecoration: 'none' }}>
                Install kiro-cli →
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  );
}
