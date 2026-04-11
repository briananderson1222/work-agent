import { useCallback, useState } from 'react';
import type { SavedConnection } from '../core/types';
import { ConnectionListPanel } from './connection-manager-modal/ConnectionListPanel';
import { ManualAddPanel } from './connection-manager-modal/ManualAddPanel';
import { useConnections } from './ConnectionsContext';
import { QRScanner } from './QRScanner';
import { ConnectionManagerDiscoverPanel } from './ConnectionManagerDiscoverPanel';
import { useNetworkDiscovery } from './useNetworkDiscovery';
import {
  getConnectionManagerTitle,
  getConnectionStatus,
  type ConnectionManagerPanel,
} from './connection-manager-modal-utils';

interface ConnectionManagerModalContentProps {
  onClose: () => void;
  checkHealth: (url: string) => Promise<boolean>;
}

export function ConnectionManagerModalContent({
  onClose,
  checkHealth,
}: ConnectionManagerModalContentProps) {
  const {
    connections,
    activeConnection,
    addConnection,
    removeConnection,
    updateConnection,
    setActiveConnection,
  } = useConnections();

  const [panel, setPanel] = useState<ConnectionManagerPanel>('list');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [healthMap, setHealthMap] = useState<Record<string, boolean | null>>(
    {},
  );
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

  const statusForConn = (conn: SavedConnection) =>
    getConnectionStatus({
      connectionId: conn.id,
      activeConnectionId: activeConnection?.id,
      healthValue: healthMap[conn.id],
    });

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
            {getConnectionManagerTitle(panel)}
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
          <ConnectionListPanel
            connections={connections}
            activeConnectionId={activeConnection?.id}
            editingId={editingId}
            editName={editName}
            editUrl={editUrl}
            getStatus={statusForConn}
            onSelect={(connection) => {
              setActiveConnection(connection.id);
              checkOne(connection);
            }}
            onCheck={checkOne}
            onStartEdit={startEdit}
            onRemove={removeConnection}
            onEditNameChange={setEditName}
            onEditUrlChange={setEditUrl}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onAddManual={() => setPanel('add')}
            onScanQr={() => setPanel('scan')}
            onDiscover={() => {
              setPanel('discover');
              scan();
            }}
          />
        )}

        {panel === 'add' && (
          <ManualAddPanel
            name={newName}
            url={newUrl}
            onNameChange={setNewName}
            onUrlChange={setNewUrl}
            onAdd={handleAdd}
            onCancel={() => setPanel('list')}
          />
        )}

        {panel === 'scan' && (
          <QRScanner onScan={handleScan} onCancel={() => setPanel('list')} />
        )}

        {panel === 'discover' && (
          <ConnectionManagerDiscoverPanel
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
