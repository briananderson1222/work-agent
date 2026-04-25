import {
  useCreateACPConnectionMutation,
  useDeleteACPConnectionMutation,
  useInstallACPConnectionRegistryEntryMutation,
  useReconnectACPConnectionMutation,
  useUpdateACPConnectionMutation,
} from '@stallion-ai/sdk';
import { useState } from 'react';
import {
  type ACPConnectionInfo,
  useACPConnectionRegistry,
  useACPConnections,
} from '../hooks/useACPConnections';
import type { AgentSummary } from '../types';
import { ACPAddConnectionModal } from './acp-connections/ACPAddConnectionModal';
import { ACPConnectionCard } from './acp-connections/ACPConnectionCard';
import { ACPConnectionDetailModal } from './acp-connections/ACPConnectionDetailModal';
import { ConnectionIcon } from './acp-connections/ConnectionIcon';
import type { ACPConnectionDraft } from './acp-connections/types';

interface ACPConnectionsSectionProps {
  acpAgents: AgentSummary[];
}

export function ACPConnectionsSection({
  acpAgents,
}: ACPConnectionsSectionProps) {
  const { data: connections = [] } = useACPConnections();
  const { data: registryEntries = [] } = useACPConnectionRegistry();
  const createConnectionMutation = useCreateACPConnectionMutation();
  const installRegistryEntryMutation =
    useInstallACPConnectionRegistryEntryMutation();
  const updateConnectionMutation = useUpdateACPConnectionMutation();
  const deleteConnectionMutation = useDeleteACPConnectionMutation();
  const reconnectConnectionMutation = useReconnectACPConnectionMutation();
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [selectedConn, setSelectedConn] = useState<ACPConnectionInfo | null>(
    null,
  );

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await updateConnectionMutation.mutateAsync({
      id,
      updates: { enabled },
    });
  };

  const removeConnection = async (id: string) => {
    await deleteConnectionMutation.mutateAsync(id);
  };

  const addConnection = async (data: ACPConnectionDraft) => {
    await createConnectionMutation.mutateAsync(data);
    setShowCustomModal(false);
  };

  const installRegistryEntry = async (id: string) => {
    await installRegistryEntryMutation.mutateAsync(id);
    setShowCustomModal(false);
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
        <ACPAddConnectionModal
          registryEntries={registryEntries}
          onAdd={addConnection}
          onInstallRegistryEntry={installRegistryEntry}
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
          <ACPConnectionCard
            key={conn.id}
            conn={conn}
            agents={acpAgents.filter((a) => a.slug.startsWith(`${conn.id}-`))}
            onClick={() => setSelectedConn(conn)}
            onToggle={(enabled) => toggleEnabled(conn.id, enabled)}
            onRemove={() => removeConnection(conn.id)}
            onReconnect={async () => {
              await reconnectConnectionMutation.mutateAsync(conn.id);
            }}
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
        <ACPConnectionDetailModal
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
