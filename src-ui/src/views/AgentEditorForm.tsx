import { useState } from 'react';
import { AgentIcon } from '../components/AgentIcon';
import { Checkbox } from '../components/Checkbox';
import { ModelSelector } from '../components/ModelSelector';
import type { NavigationView, Tool } from '../types';
import './editor-layout.css';

export interface AgentFormData {
  slug: string;
  name: string;
  description: string;
  prompt: string;
  modelId: string;
  region: string;
  guardrails: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    maxSteps?: number;
  } | null;
  maxSteps: string;
  tools: {
    mcpServers: string[];
    available: string[];
    autoApprove: string[];
  };
  icon: string;
  skills: string[];
  prompts: string[];
}

interface AgentEditorFormProps {
  form: AgentFormData;
  setForm: React.Dispatch<React.SetStateAction<AgentFormData>>;
  isCreating: boolean;
  locked: boolean;
  isPlugin: boolean | '' | undefined;
  isLocked: boolean;
  validationErrors: Record<string, string>;
  availableTools: Tool[];
  availableSkills: any[];
  availablePrompts: any[];
  integrationTools: Record<string, Tool[]>;
  appConfig: any;
  enrich: (prompt: string) => Promise<string | null>;
  isEnriching: boolean;
  onNavigate: (view: NavigationView) => void;
  onOpenAddModal: (type: 'integrations' | 'skills' | 'prompts') => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function AgentEditorForm({
  form,
  setForm,
  isCreating,
  locked,
  isPlugin,
  isLocked,
  validationErrors,
  availableTools,
  availableSkills,
  availablePrompts,
  integrationTools,
  appConfig,
  enrich,
  isEnriching,
  onNavigate,
  onOpenAddModal,
}: AgentEditorFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedIntegrations, setExpandedIntegrations] = useState<
    Record<string, boolean>
  >({});

  return (
    <>
      {/* Basic section */}
      <div className="agent-editor__section">
        <div className="editor-field">
          <label className="editor-label" htmlFor="ae-name">
            Name <span className="editor-required">*</span>
          </label>
          <input
            id="ae-name"
            type="text"
            className="editor-input"
            name="name"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((f) => ({
                ...f,
                name,
                slug: isCreating ? slugify(name) : f.slug,
              }));
            }}
            placeholder="My Agent"
            disabled={locked}
          />
          {validationErrors.name && (
            <span className="editor-error">{validationErrors.name}</span>
          )}
        </div>

        <div className="editor-field">
          <label className="editor-label" htmlFor="ae-slug">
            Slug
          </label>
          <input
            id="ae-slug"
            type="text"
            className="editor-input"
            name="slug"
            value={form.slug}
            onChange={(e) =>
              isCreating && setForm((f) => ({ ...f, slug: e.target.value }))
            }
            disabled={!isCreating}
            placeholder="my-agent"
          />
          {validationErrors.slug && (
            <span className="editor-error">{validationErrors.slug}</span>
          )}
          {!isCreating && (
            <span className="editor-label">
              <span className="editor-hint">
                Slug cannot be changed after creation
              </span>
            </span>
          )}
        </div>

        <div className="editor-field">
          <label className="editor-label">Icon</label>
          <div className="editor-icon-row">
            <AgentIcon
              agent={{ name: form.name || 'Agent', icon: form.icon }}
              size="large"
              className="editor-icon-preview"
            />
            <input
              type="text"
              className="editor-input"
              name="icon"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder="Emoji (e.g. 🤖) or leave empty for initials"
              disabled={locked}
            />
          </div>
        </div>

        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label" htmlFor="ae-description">
              Description
            </label>
            <button
              type="button"
              className="editor-enrich-btn"
              disabled={isEnriching || !form.name || locked}
              aria-label="Generate description"
              onClick={async () => {
                const text = await enrich(
                  `Write a brief one-sentence description for an AI agent named "${form.name}"${form.prompt ? `. Its system prompt starts with: "${form.prompt.slice(0, 200)}"` : ''}.`,
                );
                if (text) setForm((f) => ({ ...f, description: text.trim() }));
              }}
            >
              {isEnriching ? '...' : '✨ Generate'}
            </button>
          </div>
          <input
            id="ae-description"
            type="text"
            className="editor-input"
            name="description"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="A helpful agent for..."
            disabled={locked}
          />
        </div>

        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label" htmlFor="ae-prompt">
              System Prompt <span className="editor-required">*</span>
            </label>
            <button
              type="button"
              className="editor-enrich-btn"
              disabled={isEnriching || !form.name || locked}
              aria-label="Generate system prompt"
              onClick={async () => {
                const text = await enrich(
                  `Write a system prompt for an AI agent named "${form.name}"${form.description ? ` described as: "${form.description}"` : ''}. Be specific and actionable. Output only the system prompt text.`,
                );
                if (text) setForm((f) => ({ ...f, prompt: text.trim() }));
              }}
            >
              {isEnriching ? '...' : '✨ Generate'}
            </button>
          </div>
          <textarea
            id="ae-prompt"
            className="editor-textarea editor-textarea--tall editor-textarea--mono"
            name="prompt"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            placeholder="You are a helpful assistant..."
            disabled={locked}
          />
          {validationErrors.prompt && (
            <span className="editor-error">{validationErrors.prompt}</span>
          )}
        </div>
      </div>

      {/* Integrations */}
      <div className="agent-editor__section">
        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label">Integrations</label>
            <span className="editor-label-row__actions">
              <button
                type="button"
                className="editor-enrich-btn"
                onClick={() => onNavigate({ type: 'connections-tools' })}
              >
                Manage →
              </button>
              {!locked && (
                <button
                  type="button"
                  className="editor-enrich-btn"
                  onClick={() => onOpenAddModal('integrations')}
                >
                  + Add
                </button>
              )}
            </span>
          </div>
          {(() => {
            const enabledServers = new Set(form.tools.mcpServers);
            const enabled = availableTools.filter((t) =>
              enabledServers.has(t.id),
            );

            if (enabled.length === 0) {
              return (
                <div className="editor__tools-empty">
                  No integrations enabled.{' '}
                  {!locked && (
                    <button
                      type="button"
                      className="editor__tools-link"
                      onClick={() => onOpenAddModal('integrations')}
                    >
                      Add integrations
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="editor__tools-grouped">
                {enabled.map((integration) => {
                  const isExpanded =
                    expandedIntegrations[integration.id] || false;
                  const tools = integrationTools[integration.id] || [];
                  const prefix = `${integration.id}_`;
                  const hasAutoApprove = form.tools.autoApprove.includes(
                    `${prefix}*`,
                  );
                  // No entries for this integration in available → all tools active
                  const hasExplicitAvailable = form.tools.available.some((a) =>
                    a.startsWith(prefix),
                  );
                  const allToolsActive =
                    !hasExplicitAvailable ||
                    form.tools.available.includes(`${prefix}*`);

                  return (
                    <div key={integration.id} className="editor__tools-server">
                      <div
                        className={`editor__tools-server-header${tools.length > 0 ? ' editor__tools-server-header--clickable' : ''}`}
                        onClick={() =>
                          tools.length > 0 &&
                          setExpandedIntegrations((s) => ({
                            ...s,
                            [integration.id]: !s[integration.id],
                          }))
                        }
                      >
                        <span
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'contents' }}
                        >
                          <Checkbox
                            checked={true}
                            onChange={() => {
                              if (locked) return;
                              setForm((f) => {
                                const servers = new Set(f.tools.mcpServers);
                                servers.delete(integration.id);
                                return {
                                  ...f,
                                  tools: {
                                    ...f.tools,
                                    mcpServers: [...servers],
                                    available: f.tools.available.filter(
                                      (p) => !p.startsWith(prefix),
                                    ),
                                    autoApprove: f.tools.autoApprove.filter(
                                      (p) => !p.startsWith(prefix),
                                    ),
                                  },
                                };
                              });
                            }}
                            disabled={locked}
                          />
                        </span>
                        <span className="editor__tools-server-name">
                          {integration.displayName || integration.id}
                        </span>
                        {hasAutoApprove ? (
                          <button
                            className="editor__tool-badge editor__tool-badge--auto editor__tool-badge--btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!locked)
                                setForm((f) => ({
                                  ...f,
                                  tools: {
                                    ...f.tools,
                                    autoApprove: f.tools.autoApprove.filter(
                                      (p: string) => !p.startsWith(prefix),
                                    ),
                                  },
                                }));
                            }}
                          >
                            ✓ auto-approve
                          </button>
                        ) : (
                          <button
                            className="editor__tool-badge editor__tool-badge--add editor__tool-badge--btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!locked)
                                setForm((f) => ({
                                  ...f,
                                  tools: {
                                    ...f.tools,
                                    autoApprove: [
                                      ...f.tools.autoApprove,
                                      `${prefix}*`,
                                    ],
                                  },
                                }));
                            }}
                          >
                            + auto-approve
                          </button>
                        )}
                        {tools.length > 0 && (
                          <span
                            className={`agent-editor__chevron${isExpanded ? ' agent-editor__chevron--open' : ''}`}
                          >
                            ›
                          </span>
                        )}
                      </div>
                      {isExpanded && tools.length > 0 && (
                        <div className="editor__tools-list">
                          {tools.map((tool) => {
                            const toolKey = `${prefix}${tool.toolName || tool.name}`;
                            const toolEnabled =
                              allToolsActive ||
                              form.tools.available.includes(toolKey);
                            const toolAutoApprove =
                              toolEnabled &&
                              (form.tools.autoApprove.includes(`${prefix}*`) ||
                                form.tools.autoApprove.includes(toolKey));
                            return (
                              <div
                                key={tool.id}
                                className={`editor__tool-item${toolEnabled ? ' editor__tool-item--active' : ''}`}
                              >
                                <Checkbox
                                  checked={toolEnabled}
                                  disabled={locked}
                                  onChange={() => {
                                    if (locked) return;
                                    setForm((f) => {
                                      const avail = new Set(f.tools.available);
                                      // Expand implicit all-active to explicit list
                                      const hasExplicit = [...avail].some((a) =>
                                        a.startsWith(prefix),
                                      );
                                      if (!hasExplicit) {
                                        // All were implicitly active — add all except this one
                                        tools.forEach((t) => {
                                          const k = `${prefix}${t.toolName || t.name}`;
                                          if (k !== toolKey) avail.add(k);
                                        });
                                      } else if (avail.has(`${prefix}*`)) {
                                        avail.delete(`${prefix}*`);
                                        tools.forEach((t) => {
                                          const k = `${prefix}${t.toolName || t.name}`;
                                          if (k !== toolKey) avail.add(k);
                                        });
                                      } else if (avail.has(toolKey)) {
                                        avail.delete(toolKey);
                                      } else {
                                        avail.add(toolKey);
                                      }
                                      // Also remove auto-approve if tool is now off
                                      const ap = new Set(f.tools.autoApprove);
                                      if (!avail.has(toolKey)) {
                                        ap.delete(toolKey);
                                      }
                                      return {
                                        ...f,
                                        tools: {
                                          ...f.tools,
                                          available: [...avail],
                                          autoApprove: [...ap],
                                        },
                                      };
                                    });
                                  }}
                                />
                                <div className="editor__tool-info">
                                  <div className="editor__tool-name">
                                    {tool.toolName || tool.name}
                                  </div>
                                  {tool.description && (
                                    <div className="editor__tool-desc">
                                      {tool.description}
                                    </div>
                                  )}
                                </div>
                                {toolEnabled ? (
                                  <button
                                    className={`editor__tool-badge editor__tool-badge--btn${toolAutoApprove ? ' editor__tool-badge--auto' : ' editor__tool-badge--add'}`}
                                    onClick={() => {
                                      if (locked) return;
                                      setForm((f) => {
                                        const ap = new Set(f.tools.autoApprove);
                                        if (ap.has(`${prefix}*`)) {
                                          ap.delete(`${prefix}*`);
                                          tools.forEach((t) => {
                                            const k = `${prefix}${t.toolName || t.name}`;
                                            if (k !== toolKey) ap.add(k);
                                          });
                                        } else if (ap.has(toolKey)) {
                                          ap.delete(toolKey);
                                        } else {
                                          ap.add(toolKey);
                                        }
                                        return {
                                          ...f,
                                          tools: {
                                            ...f.tools,
                                            autoApprove: [...ap],
                                          },
                                        };
                                      });
                                    }}
                                  >
                                    {toolAutoApprove ? '✓ auto' : '+ auto'}
                                  </button>
                                ) : (
                                  <span className="editor__tool-badge editor__tool-badge--disabled">
                                    auto
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Skills */}
      <div className="agent-editor__section">
        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label">Skills</label>
            <span className="editor-label-row__actions">
              <span className="editor__tools-server-count">
                {form.skills.length} enabled
              </span>
              {!locked && (
                <button
                  type="button"
                  className="editor-enrich-btn"
                  onClick={() => onOpenAddModal('skills')}
                >
                  + Add
                </button>
              )}
            </span>
          </div>
          {form.skills.length === 0 ? (
            <div className="editor__tools-empty">
              No skills enabled.{' '}
              {!locked && availableSkills.length > 0 && (
                <button
                  type="button"
                  className="editor__tools-link"
                  onClick={() => onOpenAddModal('skills')}
                >
                  Add skills
                </button>
              )}
            </div>
          ) : (
            <div className="editor__tools-server">
              <div className="editor__tools-list">
                {availableSkills
                  .filter((s: any) => form.skills.includes(s.name))
                  .map((skill: any) => (
                    <div
                      key={skill.name}
                      className="editor__tool-item editor__tool-item--active"
                    >
                      <Checkbox
                        checked={true}
                        disabled={locked}
                        onChange={() => {
                          if (locked) return;
                          setForm((f) => ({
                            ...f,
                            skills: f.skills.filter(
                              (s: string) => s !== skill.name,
                            ),
                          }));
                        }}
                      />
                      <div className="editor__tool-info">
                        <div className="editor__tool-name">{skill.name}</div>
                        {skill.description && (
                          <div className="editor__tool-desc">
                            {skill.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompts */}
      <div className="agent-editor__section">
        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label">Prompts</label>
            <span className="editor-label-row__actions">
              <span className="editor__tools-server-count">
                {form.prompts.length} enabled
              </span>
              <button
                type="button"
                className="editor-enrich-btn"
                onClick={() => onNavigate({ type: 'prompts' })}
              >
                + new
              </button>
              {!locked && (
                <button
                  type="button"
                  className="editor-enrich-btn"
                  onClick={() => onOpenAddModal('prompts')}
                >
                  + Add
                </button>
              )}
            </span>
          </div>
          {form.prompts.length === 0 ? (
            <div className="editor__tools-empty">
              No prompts enabled.{' '}
              {!locked && availablePrompts.length > 0 && (
                <button
                  type="button"
                  className="editor__tools-link"
                  onClick={() => onOpenAddModal('prompts')}
                >
                  Add prompts
                </button>
              )}
            </div>
          ) : (
            <div className="editor__tools-server">
              <div className="editor__tools-list">
                {availablePrompts
                  .filter((p: any) => form.prompts.includes(p.id))
                  .map((prompt: any) => (
                    <div
                      key={prompt.id}
                      className="editor__tool-item editor__tool-item--active"
                    >
                      <Checkbox
                        checked={true}
                        disabled={locked}
                        onChange={() => {
                          if (locked) return;
                          setForm((f) => ({
                            ...f,
                            prompts: f.prompts.filter(
                              (p: string) => p !== prompt.id,
                            ),
                          }));
                        }}
                      />
                      <div className="editor__tool-info">
                        <div className="editor__tool-name">{prompt.name}</div>
                        {prompt.description && (
                          <div className="editor__tool-desc">
                            {prompt.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced section */}
      <div className="agent-editor__section">
        <button
          type="button"
          className="agent-editor__section-toggle"
          onClick={() => setAdvancedOpen((o) => !o)}
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
              <label className="editor-label">
                Model{' '}
                <span className="editor-hint">
                  — leave empty to use default
                </span>
              </label>
              <div
                className={locked ? 'agent-editor__locked-field' : undefined}
              >
                <ModelSelector
                  value={form.modelId}
                  onChange={(modelId) => setForm((f) => ({ ...f, modelId }))}
                  placeholder="Select a model..."
                  defaultModel={appConfig?.defaultModel}
                />
              </div>
            </div>

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
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
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
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            guardrails: {
                              ...f.guardrails!,
                              temperature: e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                        placeholder="0.7"
                        disabled={!!(isPlugin && isLocked)}
                      />
                    </div>
                    <div className="editor__guardrails-item">
                      <label className="editor-label">Max Tokens</label>
                      <input
                        type="number"
                        className="editor-input"
                        min="1"
                        value={form.guardrails.maxTokens ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            guardrails: {
                              ...f.guardrails!,
                              maxTokens: e.target.value
                                ? parseInt(e.target.value, 10)
                                : undefined,
                            },
                          }))
                        }
                        placeholder="4096"
                        disabled={!!(isPlugin && isLocked)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="editor-btn editor-btn--secondary"
                    onClick={() => setForm((f) => ({ ...f, guardrails: null }))}
                    disabled={!!(isPlugin && isLocked)}
                  >
                    Remove Guardrails
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="editor-btn editor-btn--secondary"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      guardrails: { temperature: 0.7, maxTokens: 4096 },
                    }))
                  }
                  disabled={!!(isPlugin && isLocked)}
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxSteps: e.target.value }))
                }
                placeholder="0 (unlimited)"
                disabled={!!(isPlugin && isLocked)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
