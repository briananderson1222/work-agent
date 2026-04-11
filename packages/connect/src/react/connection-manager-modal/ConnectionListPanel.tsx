import type { SavedConnection } from '../../core/types';
import { ConnectionStatusDot } from '../ConnectionStatusDot';
import type { ConnectionStatus } from '../connection-manager-modal-utils';
import {
  iconBtnStyle,
  secondaryBtnStyle,
  inputStyle,
  primaryBtnStyle,
} from './styles';

interface ConnectionListPanelProps {
  connections: SavedConnection[];
  activeConnectionId?: string;
  editingId: string | null;
  editName: string;
  editUrl: string;
  getStatus: (connection: SavedConnection) => ConnectionStatus;
  onSelect: (connection: SavedConnection) => void;
  onCheck: (connection: SavedConnection) => void;
  onStartEdit: (connection: SavedConnection) => void;
  onRemove: (connectionId: string) => void;
  onEditNameChange: (value: string) => void;
  onEditUrlChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAddManual: () => void;
  onScanQr: () => void;
  onDiscover: () => void;
}

export function ConnectionListPanel({
  connections,
  activeConnectionId,
  editingId,
  editName,
  editUrl,
  getStatus,
  onSelect,
  onCheck,
  onStartEdit,
  onRemove,
  onEditNameChange,
  onEditUrlChange,
  onSaveEdit,
  onCancelEdit,
  onAddManual,
  onScanQr,
  onDiscover,
}: ConnectionListPanelProps) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 16,
        }}
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
        {connections.map((connection) =>
          editingId === connection.id ? (
            <div
              key={connection.id}
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
                onChange={(event) => onEditNameChange(event.target.value)}
                placeholder="Name"
                style={inputStyle}
              />
              <input
                type="text"
                value={editUrl}
                onChange={(event) => onEditUrlChange(event.target.value)}
                placeholder="http://192.168.1.x:3141"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={onSaveEdit} style={primaryBtnStyle}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  style={secondaryBtnStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={connection.id}
              style={{
                background:
                  connection.id === activeConnectionId
                    ? 'var(--bg-hover, #252525)'
                    : 'var(--bg-primary, #0a0a0a)',
                border: `1px solid ${connection.id === activeConnectionId ? 'var(--accent-primary, #3b82f6)' : 'var(--border-primary, #333)'}`,
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
              onClick={() => onSelect(connection)}
            >
              <ConnectionStatusDot status={getStatus(connection)} size={8} />
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
                  {connection.name || connection.url}
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
                  {connection.url}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCheck(connection);
                  }}
                  title="Check connection"
                  style={iconBtnStyle}
                >
                  ↻
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartEdit(connection);
                  }}
                  title="Edit"
                  style={iconBtnStyle}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(connection.id);
                  }}
                  title="Remove"
                  style={{
                    ...iconBtnStyle,
                    color: 'var(--error-text, #ef4444)',
                  }}
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
          onClick={onAddManual}
          style={{ ...secondaryBtnStyle, flex: 1 }}
        >
          + Add Manually
        </button>
        <button
          type="button"
          onClick={onScanQr}
          style={{ ...secondaryBtnStyle, flex: 1 }}
        >
          Scan QR
        </button>
        <button
          type="button"
          onClick={onDiscover}
          style={{ ...secondaryBtnStyle, flex: 1 }}
        >
          Discover
        </button>
      </div>
    </>
  );
}
