import { useState } from 'react';
import type { ACPConnectionDraft } from './types';

export function ACPAddConnectionModal({
  onAdd,
  onCancel,
}: {
  onAdd: (data: ACPConnectionDraft) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [icon, setIcon] = useState('');
  const [cwd, setCwd] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog acp-custom-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Custom ACP Connection</h3>
        </div>
        <div className="modal-body">
          <div className="acp-custom-modal__grid">
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
        </div>
        <div className="modal-footer">
          <button className="button button--secondary" onClick={onCancel}>
            Cancel
          </button>
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
        </div>
      </div>
    </div>
  );
}
