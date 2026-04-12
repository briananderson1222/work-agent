import type { Dispatch, SetStateAction } from 'react';
import type { AgentEditorFormProps } from './types';

export function AgentEditorAdvancedSection({
  form,
  setForm,
  appConfig,
  isPlugin,
  isLocked,
  advancedOpen,
  setAdvancedOpen,
}: Pick<
  AgentEditorFormProps,
  'form' | 'setForm' | 'appConfig' | 'isPlugin' | 'isLocked'
> & {
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const disabled = !!(isPlugin && isLocked);

  return (
    <div className="agent-editor__section">
      <button
        type="button"
        className="agent-editor__section-toggle"
        onClick={() => setAdvancedOpen((open) => !open)}
        aria-expanded={advancedOpen}
      >
        <span>Advanced</span>
        <span
          className={`agent-editor__chevron${advancedOpen ? ' agent-editor__chevron--open' : ''}`}
        >
          ›
        </span>
      </button>

      {advancedOpen && (
        <div className="agent-editor__advanced-content">
          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-region">
              AWS Region
            </label>
            <input
              id="ae-region"
              type="text"
              className="editor-input"
              name="region"
              value={form.region}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  region: event.target.value,
                }))
              }
              placeholder={appConfig?.region || 'us-east-1'}
            />
          </div>

          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-guardrails">
              Guardrails
            </label>
            {form.guardrails ? (
              <>
                <div className="editor__guardrails-grid">
                  <div className="editor__guardrails-item">
                    <label className="editor-label">Temperature</label>
                    <input
                      type="number"
                      className="editor-input"
                      min="0"
                      max="1"
                      step="0.1"
                      value={form.guardrails.temperature ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          guardrails: {
                            ...current.guardrails!,
                            temperature: event.target.value
                              ? parseFloat(event.target.value)
                              : undefined,
                          },
                        }))
                      }
                      placeholder="0.7"
                      disabled={disabled}
                    />
                  </div>
                  <div className="editor__guardrails-item">
                    <label className="editor-label">Max Tokens</label>
                    <input
                      type="number"
                      className="editor-input"
                      min="1"
                      value={form.guardrails.maxTokens ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          guardrails: {
                            ...current.guardrails!,
                            maxTokens: event.target.value
                              ? parseInt(event.target.value, 10)
                              : undefined,
                          },
                        }))
                      }
                      placeholder="4096"
                      disabled={disabled}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="editor-btn editor-btn--secondary"
                  onClick={() =>
                    setForm((current) => ({ ...current, guardrails: null }))
                  }
                  disabled={disabled}
                >
                  Remove Guardrails
                </button>
              </>
            ) : (
              <button
                type="button"
                className="editor-btn editor-btn--secondary"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    guardrails: { temperature: 0.7, maxTokens: 4096 },
                  }))
                }
                disabled={disabled}
              >
                + Add Guardrails
              </button>
            )}
          </div>

          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-maxsteps">
              Max Steps
            </label>
            <input
              id="ae-maxsteps"
              type="number"
              min="0"
              max="100"
              className="editor-input"
              name="maxSteps"
              value={form.maxSteps}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxSteps: event.target.value,
                }))
              }
              placeholder="0 (unlimited)"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
