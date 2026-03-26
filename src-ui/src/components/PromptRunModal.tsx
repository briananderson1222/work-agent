import { useMemo, useState } from 'react';
import './PromptRunModal.css';

interface PromptRunModalProps {
  isOpen: boolean;
  prompt: { name: string; content: string; agent?: string };
  templateVars: string[];
  agents: { slug: string; name: string }[];
  onRun: (resolvedContent: string, agentSlug: string) => void;
  onCancel: () => void;
}

export function PromptRunModal({
  isOpen,
  prompt,
  templateVars,
  agents,
  onRun,
  onCancel,
}: PromptRunModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [agentSlug, setAgentSlug] = useState(prompt.agent || agents[0]?.slug || '');

  const resolved = useMemo(
    () =>
      prompt.content.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] || match),
    [prompt.content, values],
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>Test: {prompt.name}</h3>
        </div>
        <div className="modal-body">
          {templateVars.length > 0 && (
            <>
              <div className="prompt-run__section-label">Variables</div>
              <div className="prompt-run__var-grid">
                {templateVars.map((v) => (
                  <div key={v} className="editor-field">
                    <label className="editor-label">{`{{${v}}}`}</label>
                    <input
                      className="editor-input"
                      placeholder={v}
                      value={values[v] || ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="prompt-run__section-label">Preview</div>
          <div className="prompt-run__preview">{resolved}</div>

          <div className="editor-field" style={{ marginTop: 16 }}>
            <label className="editor-label">Agent</label>
            <select
              className="editor-select"
              value={agentSlug}
              onChange={(e) => setAgentSlug(e.target.value)}
            >
              <option value="">— select agent —</option>
              {agents.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name || a.slug}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="editor-btn" onClick={onCancel}>Cancel</button>
          <button
            className="editor-btn editor-btn--primary"
            disabled={!agentSlug}
            onClick={() => onRun(resolved, agentSlug)}
          >
            ▶ Send to Agent
          </button>
        </div>
      </div>
    </div>
  );
}
