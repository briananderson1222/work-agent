import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { ACPConnectionsSection } from '../components/ACPConnectionsSection';
import { AgentIcon } from '../components/AgentIcon';
import { ConfirmModal } from '../components/ConfirmModal';
import { ModelSelector } from '../components/ModelSelector';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useAgentActions, useAgents } from '../contexts/AgentsContext';
import { useConfig } from '../contexts/ConfigContext';
import type { AgentSummary, NavigationView, Tool } from '../types';
import './editor-layout.css';
import './page-layout.css';

interface AgentsViewProps {
  agents: AgentSummary[];
  apiBase: string;
  availableModels: Array<{ id: string; name: string }>;
  defaultModel?: string;
  bedrockReady: boolean;
  onNavigate: (view: NavigationView) => void;
}

interface AgentFormData {
  slug: string;
  name: string;
  description: string;
  prompt: string;
  modelId: string;
  region: string;
  guardrails: string;
  maxSteps: string;
  tools: string[];
  icon: string;
}

const EMPTY_FORM: AgentFormData = {
  slug: '',
  name: '',
  description: '',
  prompt: '',
  modelId: '',
  region: '',
  guardrails: '',
  maxSteps: '',
  tools: [],
  icon: '',
};


function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formFromAgent(agent: any): AgentFormData {
  return {
    slug: agent.slug || agent.id || '',
    name: agent.name || '',
    description: agent.description || '',
    prompt: agent.prompt || '',
    modelId: typeof agent.model === 'string' ? agent.model : agent.model?.modelId || '',
    region: agent.region || '',
    guardrails: agent.guardrails || '',
    maxSteps: agent.maxSteps?.toString() || '',
    tools: agent.tools || [],
    icon: agent.icon || '',
  };
}

function isDirty(form: AgentFormData, saved: AgentFormData): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

export function AgentsView({ agents, apiBase, bedrockReady, onNavigate }: AgentsViewProps) {
  const liveAgents = useAgents();
  const appConfig = useConfig();
  const { createAgent, updateAgent, deleteAgent } = useAgentActions();
  const { enrich, isEnriching } = useAIEnrich();

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'agent'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/templates?type=agent`);
      const json = await res.json();
      return json.data || [];
    },
  });

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [templatePicked, setTemplatePicked] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<AgentFormData>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<AgentFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Use live agents from context, fall back to prop
  const allAgents = liveAgents.length > 0 ? liveAgents : agents;
  const acpAgents = allAgents.filter(a => a.source === 'acp');

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase();
    return allAgents.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
    );
  }, [allAgents, search]);

  // Group: standalone → workspace-scoped → ACP
  const listItems = useMemo(() => {
    const standalone = filteredAgents.filter(a => !a.slug.includes(':') && a.source !== 'acp');
    const workspace = filteredAgents.filter(a => a.slug.includes(':'));
    const acp = filteredAgents.filter(a => a.source === 'acp');
    return [...standalone, ...workspace, ...acp].map(a => ({
      id: a.slug,
      name: a.name,
      subtitle: a.slug,
      icon: (
        <AgentIcon agent={a} size="small" />
      ),
    }));
  }, [filteredAgents]);

  async function loadTools() {
    try {
      const res = await fetch(`${apiBase}/tools`);
      if (!res.ok) return;
      const data = await res.json();
      setAvailableTools(data.data || []);
    } catch { /* non-critical */ }
  }

  async function loadAgent(slug: string) {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`${apiBase}/api/agents`);
      if (!res.ok) throw new Error('Failed to load agents');
      const data = await res.json();
      const agent = (data.data || []).find((a: any) => a.slug === slug || a.id === slug);
      if (!agent) throw new Error('Agent not found');
      const f = formFromAgent(agent);
      setForm(f);
      setSavedForm(f);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTools();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSlug && !isCreating) {
      loadAgent(selectedSlug);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  function handleSelect(slug: string) {
    setSelectedSlug(slug);
    setIsCreating(false);
    setError(null);
    setValidationErrors({});
    setAdvancedOpen(false);
  }

  function handleNew() {
    setSelectedSlug('__new__');
    setIsCreating(true);
    setTemplatePicked(agents.length === 0);
    setForm(EMPTY_FORM);
    setSavedForm(EMPTY_FORM);
    setError(null);
    setValidationErrors({});
    setAdvancedOpen(false);
  }

  function handleDeselect() {
    setSelectedSlug(null);
    setIsCreating(false);
    setError(null);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (isCreating) {
      if (!form.slug.trim()) errors.slug = 'Slug is required';
      else if (!/^[a-z0-9-]+$/.test(form.slug)) errors.slug = 'Lowercase letters, numbers, hyphens only';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      setIsSaving(true);
      setError(null);
      const payload: Record<string, any> = {
        slug: form.slug,
        name: form.name,
        description: form.description || undefined,
        prompt: form.prompt || undefined,
        model: form.modelId || undefined,
        region: form.region || undefined,
        guardrails: form.guardrails || undefined,
        maxSteps: form.maxSteps ? parseInt(form.maxSteps, 10) : undefined,
        tools: form.tools.length > 0 ? { use: form.tools } : undefined,
        icon: form.icon || undefined,
      };
      if (isCreating) {
        await createAgent(payload as any);
        setIsCreating(false);
        setSelectedSlug(form.slug);
      } else {
        await updateAgent(selectedSlug!, payload);
        await loadAgent(selectedSlug!);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteAgent(selectedSlug!);
      setSelectedSlug(null);
      setIsCreating(false);
      setShowDeleteModal(false);
    } catch (err: any) {
      setError(err.message);
      setShowDeleteModal(false);
    }
  }

  const dirty = isDirty(form, savedForm);
  const isPlugin = selectedSlug?.includes(':') && !isCreating;
  const selectedAgent = allAgents.find(a => a.slug === selectedSlug);

  const editorId = isCreating ? '__new__' : (selectedSlug ?? null);

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="manage / agents"
        breadcrumbLinks={{ manage: () => onNavigate({ type: 'manage' }) }}
        title="Agents"
        subtitle="AI agents with custom prompts, models, and tools"
        items={listItems}
        selectedId={editorId}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
        onSearch={setSearch}
        searchPlaceholder="Search agents..."
        onAdd={bedrockReady ? handleNew : undefined}
        addLabel="+ New Agent"
        emptyIcon="⬡"
        emptyTitle="No agent selected"
        emptyDescription="Select an agent to edit, or create a new one"
        emptyContent={agents.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Get started</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Create your first agent from a template</p>
            <div className="template-grid">
              {templates.map((t: any) => (
                <button key={t.id} className="template-card" onClick={() => {
                  handleNew();
                  setTimeout(() => {
                    setForm(f => ({ ...f, ...t.form }));
                    setSavedForm(f => ({ ...f, ...t.form }));
                    setTemplatePicked(true);
                  }, 0);
                }}>
                  <span className="template-card__icon">{t.icon}</span>
                  <span className="template-card__label">{t.label}</span>
                  <span className="template-card__desc">{t.description}</span>
                  {t.source !== 'built-in' && <span className="template-card__source">{t.source}</span>}
                </button>
              ))}
            </div>
          </div>
        ) : undefined}
      >
        {isLoading ? (
          <div className="editor__loading">Loading agent...</div>
        ) : (
          <div className="agent-inline-editor">
            {/* Editor header */}
            <div className="agent-inline-editor__header">
              <div className="agent-inline-editor__header-info">
                {!isCreating && selectedAgent && (
                  <AgentIcon agent={selectedAgent} size="medium" style={{ borderRadius: '8px', flexShrink: 0 }} />
                )}
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                    {isCreating ? 'New Agent' : (form.name || selectedSlug)}
                    {isPlugin && <span className="editor__plugin-badge">{selectedSlug?.split(':')[0]}</span>}
                  </h2>
                </div>
              </div>
              <div className="agent-inline-editor__header-actions">
                {!isCreating && selectedSlug && (
                  <button
                    type="button"
                    className="editor-btn editor-btn--danger"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="editor-btn editor-btn--primary"
                  style={{ position: 'relative' }}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {dirty && !isSaving && (
                    <span className="agent-inline-editor__dirty-dot" aria-label="Unsaved changes" />
                  )}
                  {isSaving ? 'Saving…' : isCreating ? 'Create Agent' : 'Save Changes'}
                </button>
              </div>
            </div>

            {error && <div className="management-view__error" style={{ margin: '0 24px 0' }}>{error}</div>}

            <div className="agent-inline-editor__body">
              {isCreating && !templatePicked && agents.length > 0 ? (
                <div style={{ padding: '2rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Start with a template</h3>
                  <p style={{ margin: '0 0 1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pick a starting point or start from scratch</p>
                  <div className="template-grid">
                    {templates.map((t: any) => (
                      <button key={t.id} className="template-card" onClick={() => {
                        setForm(f => ({ ...f, ...t.form }));
                        setSavedForm(f => ({ ...f, ...t.form }));
                        setTemplatePicked(true);
                      }}>
                        <span className="template-card__icon">{t.icon}</span>
                        <span className="template-card__label">{t.label}</span>
                        <span className="template-card__desc">{t.description}</span>
                      </button>
                    ))}
                  </div>
                  <button className="template-blank" onClick={() => setTemplatePicked(true)}>
                    Start Blank →
                  </button>
                </div>
              ) : (
              <>
              {/* Basic section */}
              <div className="agent-editor__section">
                <div className="editor-field">
                  <label className="editor-label" htmlFor="ae-name">Name</label>
                  <input
                    id="ae-name"
                    type="text"
                    className="editor-input"
                    value={form.name}
                    onChange={e => {
                      const name = e.target.value;
                      setForm(f => ({
                        ...f,
                        name,
                        slug: isCreating ? slugify(name) : f.slug,
                      }));
                    }}
                    placeholder="My Agent"
                  />
                  {validationErrors.name && <span className="editor-error">{validationErrors.name}</span>}
                </div>

                <div className="editor-field">
                  <label className="editor-label" htmlFor="ae-slug">Slug</label>
                  <input
                    id="ae-slug"
                    type="text"
                    className="editor-input"
                    value={form.slug}
                    onChange={e => isCreating && setForm(f => ({ ...f, slug: e.target.value }))}
                    disabled={!isCreating}
                    placeholder="my-agent"
                  />
                  {validationErrors.slug && <span className="editor-error">{validationErrors.slug}</span>}
                  {!isCreating && <span className="editor-label"><span className="editor-hint">Slug cannot be changed after creation</span></span>}
                </div>

                <div className="editor-field">
                  <label className="editor-label">Icon</label>
                  <div className="editor-icon-row">
                    <AgentIcon
                      agent={{ name: form.name || 'Agent', icon: form.icon }}
                      size="large"
                      style={{ borderRadius: '10px', flexShrink: 0 }}
                    />
                    <input
                      type="text"
                      className="editor-input"
                      value={form.icon}
                      onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                      placeholder="Emoji (e.g. 🤖) or leave empty for initials"
                    />
                  </div>
                </div>

                <div className="editor-field">
                  <div className="editor-label-row">
                    <label className="editor-label" htmlFor="ae-description">Description</label>
                    <button
                      type="button"
                      className="editor-enrich-btn"
                      disabled={isEnriching || !form.name}
                      onClick={async () => {
                        const text = await enrich(`Write a brief one-sentence description for an AI agent named "${form.name}".`);
                        if (text) setForm(f => ({ ...f, description: text.trim() }));
                      }}
                    >
                      {isEnriching ? '...' : '✨ Generate'}
                    </button>
                  </div>
                  <input
                    id="ae-description"
                    type="text"
                    className="editor-input"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="A helpful agent for..."
                  />
                </div>

                <div className="editor-field">
                  <div className="editor-label-row">
                    <label className="editor-label" htmlFor="ae-prompt">System Prompt</label>
                    <button
                      type="button"
                      className="editor-enrich-btn"
                      disabled={isEnriching || !form.name}
                      onClick={async () => {
                        const text = await enrich(`Write a system prompt for an AI agent named "${form.name}"${form.description ? ` that ${form.description}` : ''}. Be specific and actionable.`);
                        if (text) setForm(f => ({ ...f, prompt: text.trim() }));
                      }}
                    >
                      {isEnriching ? '...' : '✨ Generate'}
                    </button>
                  </div>
                  <textarea
                    id="ae-prompt"
                    className="editor-textarea editor-textarea--tall editor-textarea--mono"
                    value={form.prompt}
                    onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                    placeholder="You are a helpful assistant..."
                  />
                </div>
              </div>

              {/* Advanced section */}
              <div className="agent-editor__section">
                <button
                  type="button"
                  className="agent-editor__section-toggle"
                  onClick={() => setAdvancedOpen(o => !o)}
                  aria-expanded={advancedOpen}
                >
                  <span>Advanced</span>
                  <span className={`agent-editor__chevron${advancedOpen ? ' agent-editor__chevron--open' : ''}`}>›</span>
                </button>

                {advancedOpen && (
                  <div className="agent-editor__advanced-content">
                    <div className="editor-field">
                      <label className="editor-label">Model <span className="editor-hint">— leave empty to use default</span></label>
                      <ModelSelector
                        value={form.modelId}
                        onChange={modelId => setForm(f => ({ ...f, modelId }))}
                        placeholder="Select a model..."
                        defaultModel={appConfig?.defaultModel}
                      />
                    </div>

                    <div className="editor-field">
                      <label className="editor-label" htmlFor="ae-region">AWS Region</label>
                      <input
                        id="ae-region"
                        type="text"
                        className="editor-input"
                        value={form.region}
                        onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                        placeholder={appConfig?.region || 'us-east-1'}
                      />
                    </div>

                    <div className="editor-field">
                      <label className="editor-label" htmlFor="ae-guardrails">Guardrails</label>
                      <input
                        id="ae-guardrails"
                        type="text"
                        className="editor-input"
                        value={form.guardrails}
                        onChange={e => setForm(f => ({ ...f, guardrails: e.target.value }))}
                        placeholder="Optional guardrail ID"
                      />
                    </div>

                    <div className="editor-field">
                      <label className="editor-label" htmlFor="ae-maxsteps">Max Steps</label>
                      <input
                        id="ae-maxsteps"
                        type="number"
                        min="1"
                        max="100"
                        className="editor-input"
                        value={form.maxSteps}
                        onChange={e => setForm(f => ({ ...f, maxSteps: e.target.value }))}
                        placeholder={appConfig?.defaultMaxSteps?.toString() || '10'}
                      />
                    </div>

                    {availableTools.length > 0 && (
                      <div className="editor-field">
                        <label className="editor-label">Tools</label>
                        <div className="tool-grid">
                          {availableTools.map(tool => (
                            <label key={tool.id} className="tool-checkbox">
                              <input
                                type="checkbox"
                                checked={form.tools.includes(tool.id)}
                                onChange={() => setForm(f => ({
                                  ...f,
                                  tools: f.tools.includes(tool.id)
                                    ? f.tools.filter(id => id !== tool.id)
                                    : [...f.tools, tool.id],
                                }))}
                              />
                              <div className="tool-info">
                                <span className="tool-name">{tool.toolName || tool.name}</span>
                                {tool.description && <span className="tool-desc">{tool.description}</span>}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      {acpAgents.length > 0 && (
        <ACPConnectionsSection acpAgents={acpAgents as unknown as AgentSummary[]} apiBase={apiBase} />
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Agent"
        message={`Are you sure you want to delete "${form.name || selectedSlug}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        variant="danger"
      />
    </div>
  );
}
