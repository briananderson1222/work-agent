import React, { useCallback, useState } from 'react';
import type { DiscoveredServer, SavedConnection } from '../core/types';
import { ConnectionStatusDot } from './ConnectionStatusDot';
import { QRScanner } from './QRScanner';
import { useConnections } from './ConnectionsContext';
import { useNetworkDiscovery } from './useNetworkDiscovery';

export interface ConnectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Injected health-checker so the library stays server-agnostic.
   * Should return true when the server at the given URL is healthy.
   */
  checkHealth: (url: string) => Promise<boolean>;
}

type Panel = 'list' | 'add' | 'scan' | 'discover';

export function ConnectionManagerModal({
  isOpen,
  onClose,
  checkHealth,
}: ConnectionManagerModalProps) {
  const {
    connections,
    activeConnection,
    addConnection,
    removeConnection,
    updateConnection,
    setActiveConnection,
  } = useConnections();

  const [panel, setPanel] = useState<Panel>('list');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [healthMap, setHealthMap] = useState<Record<string, boolean | null>>({});
  const { scanning, discovered, scan } = useNetworkDiscovery();

  const checkOne = useCallback(
    async (conn: SavedConnection) => {
      setHealthMap((m) => ({ ...m, [conn.id]: null }));
      const ok = await checkHealth(conn.url).catch(() => false);
      setHealthMap((m) => ({ ...m, [conn.id]: ok }));
    },
    [checkHealth],
  );

  const handleAdd = () => {
    if (!newUrl.trim()) return;
    const conn = addConnection(newName.trim(), newUrl.trim());
    setActiveConnection(conn.id);
    setNewName('');
    setNewUrl('');
    setPanel('list');
    checkOne(conn);
  };

  const handleScan = (url: string) => {
    const conn = addConnection('', url);
    setActiveConnection(conn.id);
    setPanel('list');
    checkOne(conn);
  };

  const startEdit = (conn: SavedConnection) => {
    setEditingId(conn.id);
    setEditName(conn.name);
    setEditUrl(conn.url);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateConnection(editingId, { name: editName, url: editUrl });
    setEditingId(null);
  };

  if (!isOpen) return null;

  const statusForConn = (conn: SavedConnection) => {
    if (conn.id === activeConnection?.id) {
      if (healthMap[conn.id] === null) return 'connecting' as const;
      if (healthMap[conn.id] === true) return 'connected' as const;
      if (healthMap[conn.id] === false) return 'error' as const;
      return 'connecting' as const;
    }
    if (healthMap[conn.id] === true) return 'connected' as const;
    if (healthMap[conn.id] === false) return 'error' as const;
    return 'connecting' as const;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #1a1a1a)',
          border: '1px solid var(--border-primary, #333)',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {panel === 'list'
              ? 'Connections'
              : panel === 'add'
                ? 'Add Connection'
                : panel === 'scan'
                  ? 'Scan QR Code'
                  : 'Discover on Network'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #999)',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {panel === 'list' && (
          <>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
            >
              {connections.length === 0 && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--text-secondary, #999)',
                    textAlign: 'center',
                    padding: '16px 0',
                  }}
                >
                  No connections saved yet.
                </p>
              )}
              {connections.map((conn) =>
                editingId === conn.id ? (
                  <div
                    key={conn.id}
                    style={{
                      background: 'var(--bg-primary, #0a0a0a)',
                      border: '1px solid var(--accent-primary, #3b82f6)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="http://192.168.1.x:3141"
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={saveEdit}
                        style={primaryBtnStyle}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        style={secondaryBtnStyle}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={conn.id}
                    style={{
                      background:
                        conn.id === activeConnection?.id
                          ? 'var(--bg-hover, #252525)'
                          : 'var(--bg-primary, #0a0a0a)',
                      border: `1px solid ${conn.id === activeConnection?.id ? 'var(--accent-primary, #3b82f6)' : 'var(--border-primary, #333)'}`,
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setActiveConnection(conn.id);
                      checkOne(conn);
                    }}
                  >
                    <ConnectionStatusDot status={statusForConn(conn)} size={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conn.name || conn.url}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary, #999)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conn.url}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkOne(conn);
                        }}
                        title="Check connection"
                        style={iconBtnStyle}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(conn);
                        }}
                        title="Edit"
                        style={iconBtnStyle}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeConnection(conn.id);
                        }}
                        title="Remove"
                        style={{ ...iconBtnStyle, color: 'var(--error-text, #ef4444)' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPanel('add')}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                + Add Manually
              </button>
              <button
                type="button"
                onClick={() => setPanel('scan')}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                Scan QR
              </button>
              <button
                type="button"
                onClick={() => { setPanel('discover'); scan(); }}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                Discover
              </button>
            </div>
          </>
        )}

        {panel === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (optional)"
              style={inputStyle}
              autoFocus
            />
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="http://192.168.1.x:3141"
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setPanel('list');
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newUrl.trim()}
                style={primaryBtnStyle}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setPanel('list')}
                style={secondaryBtnStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {panel === 'scan' && (
          <QRScanner
            onScan={handleScan}
            onCancel={() => setPanel('list')}
          />
        )}

        {panel === 'discover' && (
          <DiscoverPanel
            scanning={scanning}
            discovered={discovered}
            existingUrls={new Set(connections.map((c) => c.url))}
            onRescan={scan}
            onAdd={(server) => {
              const conn = addConnection(server.name, server.url);
              setActiveConnection(conn.id);
              setPanel('list');
              checkOne(conn);
            }}
            onBack={() => setPanel('list')}
          />
        )}
      </div>
    </div>
  );
}

function DiscoverPanel({
  scanning,
  discovered,
  existingUrls,
  onRescan,
  onAdd,
  onBack,
}: {
  scanning: boolean;
  discovered: DiscoveredServer[];
  existingUrls: Set<string>;
  onRescan: () => void;
  onAdd: (s: DiscoveredServer) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {scanning ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}>
              Scanning local network…
            </span>
            <ScanSpinner />
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}>
            {discovered.length === 0
              ? 'No servers found on this network.'
              : `Found ${discovered.length} server${discovered.length !== 1 ? 's' : ''}.`}
          </span>
        )}
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          style={{ ...iconBtnStyle, marginLeft: 'auto', fontSize: 16 }}
          title="Scan again"
        >
          ↻
        </button>
      </div>

      {/* Results */}
      {discovered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {discovered.map((server) => {
            const alreadyAdded = existingUrls.has(server.url);
            return (
              <div
                key={server.url}
                style={{
                  background: 'var(--bg-primary, #0a0a0a)',
                  border: '1px solid var(--border-primary, #333)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{server.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary, #999)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {server.url}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted, #666)',
                    flexShrink: 0,
                  }}
                >
                  {server.latency}ms
                </span>
                {alreadyAdded ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary, #999)',
                      flexShrink: 0,
                    }}
                  >
                    Added
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(server)}
                    style={{ ...primaryBtnStyle, padding: '6px 14px', fontSize: 12, flexShrink: 0 }}
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Scanning placeholder rows */}
      {scanning && discovered.length === 0 && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-muted, #666)',
          }}
        >
          Probing 192.168.x.1–254 on port 3141…
        </div>
      )}

      <button type="button" onClick={onBack} style={secondaryBtnStyle}>
        ← Back
      </button>
    </div>
  );
}

function ScanSpinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: '2px solid var(--border-primary, #333)',
        borderTopColor: 'var(--accent-primary, #3b82f6)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  background: 'var(--bg-primary, #0a0a0a)',
  border: '1px solid var(--border-primary, #333)',
  borderRadius: 8,
  color: 'var(--text-primary, #e5e5e5)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--accent-primary, #3b82f6)',
  color: 'white',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: '1px solid var(--border-primary, #333)',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--text-primary, #e5e5e5)',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary, #999)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
  lineHeight: 1,
};
