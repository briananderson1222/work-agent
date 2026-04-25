import { useEffect, useState } from 'react';
import type { ACPConnectionRegistryEntry } from '../../hooks/useACPConnections';
import type { ACPConnectionDraft } from './types';

export function ACPAddConnectionModal({
  registryEntries = [],
  onAdd,
  onInstallRegistryEntry,
  onCancel,
}: {
  registryEntries?: ACPConnectionRegistryEntry[];
  onAdd: (data: ACPConnectionDraft) => void;
  onInstallRegistryEntry?: (id: string) => void;
  onCancel: () => void;
}) {
  const [customMode, setCustomMode] = useState(registryEntries.length === 0);
  const [customModeSelected, setCustomModeSelected] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [icon, setIcon] = useState('');
  const [cwd, setCwd] = useState('');

  useEffect(() => {
    if (customModeSelected) return;
    setCustomMode(registryEntries.length === 0);
  }, [customModeSelected, registryEntries.length]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog acp-custom-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{customMode ? 'Custom ACP Connection' : 'Add ACP Connection'}</h3>
        </div>
        <div className="modal-body">
          {customMode ? (
            <div
              className="acp-custom-modal__grid"
              onChange={() => setCustomModeSelected(true)}
            >
              <div>
                <label className="acp-custom-modal__label">ID (slug)</label>
                <input
                  className="acp-custom-modal__input"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="gemini"
                />
              </div>
              <div>
                <label className="acp-custom-modal__label">Display Name</label>
                <input
                  className="acp-custom-modal__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Gemini CLI"
                />
              </div>
              <div>
                <label className="acp-custom-modal__label">Command</label>
                <input
                  className="acp-custom-modal__input"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="gemini"
                />
              </div>
              <div>
                <label className="acp-custom-modal__label">Arguments</label>
                <input
                  className="acp-custom-modal__input"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="--acp"
                />
              </div>
              <div>
                <label className="acp-custom-modal__label">
                  Icon (emoji or URL)
                </label>
                <input
                  className="acp-custom-modal__input"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="Emoji or image URL"
                />
              </div>
              <div>
                <label className="acp-custom-modal__label">
                  Working Directory
                </label>
                <input
                  className="acp-custom-modal__input"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="(defaults to server cwd)"
                />
              </div>
            </div>
          ) : (
            <div className="acp-registry-list">
              {registryEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`acp-preset-item${entry.installed ? ' acp-preset-item--disabled' : ''}`}
                  disabled={entry.installed}
                  onClick={() => onInstallRegistryEntry?.(entry.id)}
                >
                  <span>{entry.icon || '🔌'}</span>
                  <span className="acp-preset-item__name">
                    {entry.name}
                    {entry.description ? (
                      <span className="acp-preset-item__hint">
                        {entry.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="acp-preset-item__hint">
                    {entry.installed ? 'Configured' : 'Add'}
                  </span>
                </button>
              ))}
              <div className="acp-preset-divider" />
              <button
                type="button"
                className="acp-preset-item"
                onClick={() => {
                  setCustomModeSelected(true);
                  setCustomMode(true);
                }}
              >
                <span>+</span>
                <span className="acp-preset-item__name">
                  Custom ACP connection
                  <span className="acp-preset-item__hint">
                    Enter command, args, and working directory manually
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {customMode && registryEntries.length > 0 && (
            <button
              className="button button--secondary"
              onClick={() => {
                setCustomModeSelected(false);
                setCustomMode(false);
              }}
            >
              Back
            </button>
          )}
          <button className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
          {customMode && (
            <button
              className="button button--primary"
              onClick={() =>
                id &&
                command &&
                onAdd({ id, name: name || id, command, args, icon, cwd })
              }
              disabled={!id || !command}
            >
              Add Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
