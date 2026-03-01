import React, { useCallback, useState } from 'react';
import type { SavedConnection } from '../core/types';
import { ConnectionStatusDot } from './ConnectionStatusDot';
import { QRScanner } from './QRScanner';
import { useConnections } from './ConnectionsContext';

export interface ConnectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Injected health-checker so the library stays server-agnostic.
   * Should return true when the server at the given URL is healthy.
   */
  checkHealth: (url: string) => Promise<boolean>;
}

type Panel = 'list' | 'add' | 'scan';

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
                : 'Scan QR Code'}
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

            <div style={{ display: 'flex', gap: 8 }}>
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
      </div>
    </div>
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
