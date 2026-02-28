import { useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

// ── Types ──────────────────────────────────────────────

type PermissionTier = 'passive' | 'active' | 'trusted';

interface PermissionRequest {
  permission: string;
  tier: PermissionTier;
}

interface ConsentRequest {
  pluginName: string;
  displayName: string;
  permissions: PermissionRequest[];
  resolve: (granted: boolean) => void;
}

interface PermissionContextType {
  /** Show consent modal for a plugin's permissions. Returns true if user approved. */
  requestConsent: (pluginName: string, displayName: string, permissions: PermissionRequest[]) => Promise<boolean>;
  /** Grant permissions on the server */
  grantPermissions: (pluginName: string, permissions: string[]) => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

// ── Tier badge styling ─────────────────────────────────

const TIER_STYLES: Record<PermissionTier, { label: string; color: string; bg: string }> = {
  passive: { label: 'Auto', color: '#22c55e', bg: '#22c55e20' },
  active: { label: 'Review', color: '#f59e0b', bg: '#f59e0b20' },
  trusted: { label: 'Elevated', color: '#ef4444', bg: '#ef444420' },
};

const PERMISSION_LABELS: Record<string, string> = {
  'network.fetch': 'Make network requests through the server',
  'storage.write': 'Write to plugin storage',
  'storage.read': 'Read from plugin storage',
  'agents.invoke': 'Invoke AI agents',
  'tools.invoke': 'Use MCP tools',
  'providers.register': 'Register system providers (auth, registry, etc.)',
  'system.config': 'Modify system configuration',
  'navigation.dock': 'Add items to the navigation dock',
};

// ── Provider ───────────────────────────────────────────

export function PermissionManager({ children }: { children: ReactNode }) {
  const { apiBase } = useApiBase();
  const [pending, setPending] = useState<ConsentRequest | null>(null);

  const requestConsent = useCallback((pluginName: string, displayName: string, permissions: PermissionRequest[]): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ pluginName, displayName, permissions, resolve });
    });
  }, []);

  const grantPermissions = useCallback(async (pluginName: string, permissions: string[]) => {
    await fetch(`${apiBase}/api/plugins/${encodeURIComponent(pluginName)}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
  }, [apiBase]);

  const handleApprove = async () => {
    if (!pending) return;
    const perms = pending.permissions.map(p => p.permission);
    await grantPermissions(pending.pluginName, perms);
    pending.resolve(true);
    setPending(null);
  };

  const handleDeny = () => {
    if (!pending) return;
    pending.resolve(false);
    setPending(null);
  };

  return (
    <PermissionContext.Provider value={{ requestConsent, grantPermissions }}>
      {children}
      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: 'var(--bg-primary, #1a1a2e)', borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Permission Request</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>{pending.displayName || pending.pluginName}</strong> is requesting the following permissions:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.25rem' }}>
              {pending.permissions.map(p => {
                const style = TIER_STYLES[p.tier];
                return (
                  <div key={p.permission} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: style.bg, color: style.color, border: `1px solid ${style.color}40`,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      {style.label}
                    </span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{p.permission}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {PERMISSION_LABELS[p.permission] || 'Custom permission'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {pending.permissions.some(p => p.tier === 'trusted') && (
              <div style={{
                padding: '10px 12px', marginBottom: '1rem', borderRadius: 8,
                background: '#ef444415', border: '1px solid #ef444440',
                fontSize: '12px', color: '#fca5a5',
              }}>
                ⚠ This plugin requests elevated permissions that can modify system behavior.
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={handleDeny} style={{
                padding: '8px 16px', borderRadius: 6, fontSize: '13px',
                border: '1px solid var(--border-primary)', background: 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}>
                Deny
              </button>
              <button onClick={handleApprove} style={{
                padding: '8px 16px', borderRadius: 6, fontSize: '13px',
                border: 'none', background: 'var(--accent-primary)', color: 'white',
                cursor: 'pointer', fontWeight: 600,
              }}>
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionManager');
  return ctx;
}
