import type { IntegrationViewModel } from '@stallion-ai/sdk';
import { DetailHeader } from '../../components/DetailHeader';

type Message = {
  type: 'success' | 'error';
  text: string;
} | null;

export function IntegrationEditorPanel({
  editForm,
  isNew,
  locked,
  message,
  viewMode,
  rawJson,
  rawError,
  savePending,
  reconnectPending,
  onReconnect,
  onDelete,
  onSave,
  onSwitchToForm,
  onSwitchToRaw,
  onRawJsonChange,
  onUpdate,
  onUnlock,
}: {
  editForm: IntegrationViewModel;
  isNew: boolean;
  locked: boolean;
  message: Message;
  viewMode: 'form' | 'raw';
  rawJson: string;
  rawError: string | null;
  savePending: boolean;
  reconnectPending: boolean;
  onReconnect: () => void;
  onDelete: () => void;
  onSave: () => void;
  onSwitchToForm: () => void;
  onSwitchToRaw: () => void;
  onRawJsonChange: (value: string) => void;
  onUpdate: (
    updater: (form: IntegrationViewModel) => IntegrationViewModel,
  ) => void;
  onUnlock: () => void;
}) {
  return (
    <div className="detail-panel integration-editor-panel">
      <DetailHeader
        title={editForm.displayName || editForm.id || 'New Integration'}
        badge={
          editForm.transport
            ? { label: editForm.transport, variant: 'muted' as const }
            : undefined
        }
        statusDot={
          !isNew
            ? editForm.connected
              ? 'connected'
              : 'disconnected'
            : undefined
        }
      >
        {!isNew && !editForm.connected && (
          <button
            type="button"
            className="editor-btn"
            onClick={onReconnect}
            disabled={reconnectPending}
          >
            {reconnectPending ? 'Reconnecting…' : 'Reconnect'}
          </button>
        )}
        {!isNew && (
          <button
            type="button"
            className="editor-btn editor-btn--danger"
            onClick={onDelete}
          >
            Delete
          </button>
        )}
        <button
          type="button"
          className="editor-btn editor-btn--primary"
          onClick={onSave}
          disabled={savePending || !editForm.id || locked}
        >
          {savePending ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </button>
      </DetailHeader>

      <div className="agent-editor__section">
        <div className="agent-editor__section-header">
          <h3 className="agent-editor__section-title">Editor Mode</h3>
          <p className="agent-editor__section-desc">
            Switch between guided fields and raw <code>mcp.json</code> editing.
          </p>
        </div>
        {message && (
          <div className={`plugins__message plugins__message--${message.type}`}>
            {message.text}
          </div>
        )}
        <div className="integration__mode-tabs">
          <button
            className={`integration__mode-tab ${viewMode === 'form' ? 'integration__mode-tab--active' : ''}`}
            onClick={onSwitchToForm}
          >
            Form
          </button>
          <button
            className={`integration__mode-tab ${viewMode === 'raw' ? 'integration__mode-tab--active' : ''}`}
            onClick={onSwitchToRaw}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {viewMode === 'raw' ? (
        <div className="agent-editor__section">
          <div className="agent-editor__section-header">
            <h3 className="agent-editor__section-title">Raw Configuration</h3>
            <p className="agent-editor__section-desc">
              Paste a standard <code>mcp.json</code> config compatible with
              Claude Desktop, Cursor, Windsurf, and similar tools.
            </p>
          </div>
          <div className="integration__raw-section">
            <textarea
              className="integration__raw-editor"
              value={rawJson}
              onChange={(event) => onRawJsonChange(event.target.value)}
              placeholder={
                '{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "my-mcp-server"]\n    }\n  }\n}'
              }
              spellCheck={false}
              disabled={locked}
            />
            {rawError && (
              <div className="integration__raw-error">{rawError}</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {editForm.plugin && locked && !isNew && (
            <div className="agent-editor__section">
              <div className="editor__lock-banner">
                <span>
                  🔒 Managed by plugin &ldquo;{editForm.plugin}&rdquo;. Edits
                  will be overwritten on plugin updates.
                </span>
                <button
                  type="button"
                  className="editor__lock-btn"
                  onClick={onUnlock}
                >
                  Unlock
                </button>
              </div>
            </div>
          )}

          <div className="agent-editor__section">
            <div className="agent-editor__section-header">
              <h3 className="agent-editor__section-title">Basics</h3>
              <p className="agent-editor__section-desc">
                Configure the identity and display details for this tool server.
              </p>
            </div>
            <div className="editor-field">
              <label className="editor-label" htmlFor="int-id">
                ID
              </label>
              <input
                id="int-id"
                className="editor-input"
                value={editForm.id}
                onChange={(event) =>
                  onUpdate((form) => ({ ...form, id: event.target.value }))
                }
                placeholder="my-integration"
                disabled={!isNew || locked}
              />
              {!isNew && (
                <span className="editor-hint">
                  ID cannot be changed after creation
                </span>
              )}
            </div>
            <div className="editor-field">
              <label className="editor-label" htmlFor="int-name">
                Display Name
              </label>
              <input
                id="int-name"
                className="editor-input"
                value={editForm.displayName || ''}
                onChange={(event) =>
                  onUpdate((form) => ({
                    ...form,
                    displayName: event.target.value,
                  }))
                }
                placeholder="My Integration"
                disabled={locked}
              />
            </div>
            <div className="editor-field">
              <label className="editor-label" htmlFor="int-desc">
                Description
              </label>
              <input
                id="int-desc"
                className="editor-input"
                value={editForm.description || ''}
                onChange={(event) =>
                  onUpdate((form) => ({
                    ...form,
                    description: event.target.value,
                  }))
                }
                placeholder="What this integration does"
                disabled={locked}
              />
            </div>
          </div>

          <div className="agent-editor__section">
            <div className="agent-editor__section-header">
              <h3 className="agent-editor__section-title">Connection</h3>
              <p className="agent-editor__section-desc">
                Choose the transport and provide the fields required to connect.
              </p>
            </div>
            <div className="editor-field">
              <label className="editor-label" htmlFor="int-transport">
                Transport
              </label>
              <select
                id="int-transport"
                className="editor-select"
                aria-label="Transport"
                value={editForm.transport || 'stdio'}
                disabled={locked}
                onChange={(event) =>
                  onUpdate((form) => ({
                    ...form,
                    transport: event.target.value,
                  }))
                }
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="streamable-http">Streamable HTTP</option>
                <option value="process">Process</option>
                <option value="ws">WebSocket</option>
                <option value="tcp">TCP</option>
              </select>
              <p className="editor-help">
                Connection fields change based on transport type.
              </p>
            </div>

            {(!editForm.transport ||
              editForm.transport === 'stdio' ||
              editForm.transport === 'process') && (
              <>
                <div className="editor-field">
                  <label className="editor-label" htmlFor="int-cmd">
                    Command
                  </label>
                  <input
                    id="int-cmd"
                    className="editor-input"
                    value={editForm.command || ''}
                    onChange={(event) =>
                      onUpdate((form) => ({
                        ...form,
                        command: event.target.value,
                      }))
                    }
                    placeholder="npx, uvx, node, etc."
                    disabled={locked}
                  />
                </div>
                <div className="editor-field">
                  <label className="editor-label" htmlFor="int-args">
                    Arguments
                  </label>
                  <input
                    id="int-args"
                    className="editor-input"
                    value={(editForm.args || []).join(' ')}
                    onChange={(event) =>
                      onUpdate((form) => ({
                        ...form,
                        args: event.target.value.split(/\s+/).filter(Boolean),
                      }))
                    }
                    placeholder="Space-separated arguments"
                    disabled={locked}
                  />
                </div>
              </>
            )}

            {(editForm.transport === 'sse' ||
              editForm.transport === 'streamable-http' ||
              editForm.transport === 'ws' ||
              editForm.transport === 'tcp') && (
              <div className="editor-field">
                <label className="editor-label" htmlFor="int-endpoint">
                  Endpoint URL
                </label>
                <input
                  id="int-endpoint"
                  className="editor-input"
                  value={editForm.endpoint || ''}
                  onChange={(event) =>
                    onUpdate((form) => ({
                      ...form,
                      endpoint: event.target.value,
                    }))
                  }
                  placeholder="http://localhost:3001/mcp"
                  disabled={locked}
                />
              </div>
            )}
          </div>

          <div className="agent-editor__section">
            <div className="agent-editor__section-header">
              <h3 className="agent-editor__section-title">
                Environment Variables
              </h3>
              <p className="agent-editor__section-desc">
                Define secrets and runtime configuration passed to the server
                process.
              </p>
            </div>
            {Object.entries(editForm.env || {}).map(([key, value], index) => (
              <div key={index} className="editor-kv-row">
                <input
                  className="editor-input editor-input--half"
                  value={key}
                  placeholder="KEY"
                  disabled={locked}
                  onChange={(event) => {
                    const entries = Object.entries(editForm.env || {});
                    entries[index] = [event.target.value, value];
                    onUpdate((form) => ({
                      ...form,
                      env: Object.fromEntries(entries),
                    }));
                  }}
                />
                <input
                  className="editor-input editor-input--half"
                  value={value}
                  placeholder="value"
                  disabled={locked}
                  onChange={(event) =>
                    onUpdate((form) => ({
                      ...form,
                      env: {
                        ...(form.env || {}),
                        [key]: event.target.value,
                      },
                    }))
                  }
                />
                <button
                  type="button"
                  className="editor-btn--icon"
                  disabled={locked}
                  onClick={() =>
                    onUpdate((form) => {
                      const { [key]: _, ...rest } = form.env || {};
                      return { ...form, env: rest };
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="editor-btn--ghost"
              disabled={locked}
              onClick={() =>
                onUpdate((form) => ({
                  ...form,
                  env: { ...(form.env || {}), '': '' },
                }))
              }
            >
              + Add Variable
            </button>
          </div>
        </>
      )}
    </div>
  );
}
