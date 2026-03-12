import { useAgentsQuery } from '@stallion-ai/sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACPConnectionsSection } from '../components/ACPConnectionsSection';
import { AgentIcon } from '../components/AgentIcon';
import { Checkbox } from '../components/Checkbox';
import { ConfirmModal } from '../components/ConfirmModal';
import { ModelSelector } from '../components/ModelSelector';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import {
  type AgentData,
  useAgentActions,
  useAgents,
} from '../contexts/AgentsContext';
import { useConfig } from '../contexts/ConfigContext';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { useUrlSelection } from '../hooks/useUrlSelection';
import type { AgentSummary, NavigationView, Tool } from '../types';
import './editor-layout.css';
import './page-layout.css';

interface AgentsViewProps {
  agents: AgentData[];
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
}

const EMPTY_FORM: AgentFormData = {
  slug: '',
  name: '',
  description: '',
  prompt: '',
  modelId: '',
  region: '',
  guardrails: null,
  maxSteps: '',
  tools: { mcpServers: [], available: [], autoApprove: [] },
  icon: '',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formFromAgent(agent: any): AgentFormData {
  return {
    slug: agent.slug || agent.id || '',
    name: agent.name || '',
    description: agent.description || '',
    prompt: agent.prompt || '',
    modelId:
      typeof agent.model === 'string'
        ? agent.model
        : agent.model?.modelId || '',
    region: agent.region || '',
    guardrails:
      typeof agent.guardrails === 'object' && agent.guardrails
        ? agent.guardrails
        : null,
    maxSteps: agent.maxSteps?.toString() || '',
    tools: {
      mcpServers: agent.toolsConfig?.mcpServers || [],
      available: agent.toolsConfig?.available || [],
      autoApprove: agent.toolsConfig?.autoApprove || [],
    },
    icon: agent.icon || '',
  };
}

function isDirty(form: AgentFormData, saved: AgentFormData): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

export function AgentsView({
  agents,
  apiBase,
  bedrockReady,
  onNavigate,
}: AgentsViewProps) {
  const liveAgents = useAgents();
  const { isLoading: agentsLoading } = useAgentsQuery();
  const appConfig = useConfig();
  const { createAgent, updateAgent, deleteAgent } = useAgentActions();
  const { enrich, isEnriching } = useAIEnrich();
  const {
    selectedId: urlSlug,
    select: urlSelect,
    deselect: urlDeselect,
  } = useUrlSelection('/agents');

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'agent'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/templates?type=agent`);
      const json = await res.json();
      return json.data || [];
    },
  });

  const selectedSlug = urlSlug === 'new' ? null : urlSlug;
  const [isCreating, setIsCreating] = useState(urlSlug === 'new');
  const [templatePicked, setTemplatePicked] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<AgentFormData>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<AgentFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [_toolsConfig, setToolsConfig] = useState<any>(null);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Use live agents from context, fall back to prop
  const allAgents = liveAgents.length > 0 ? liveAgents : agents;
  const acpAgents = allAgents.filter((a) => a.source === 'acp');

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase();
    return allAgents.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q),
    );
  }, [allAgents, search]);

  // Group: standalone → workspace-scoped → ACP
  const listItems = useMemo(() => {
    const standalone = filteredAgents.filter(
      (a) => !a.slug.includes(':') && a.source !== 'acp',
    );
    const layoutAgents = filteredAgents.filter((a) => a.slug.includes(':'));
    const acp = filteredAgents.filter((a) => a.source === 'acp');
    return [...standalone, ...layoutAgents, ...acp].map((a) => ({
      id: a.slug,
      name: a.name,
      subtitle: a.slug,
      icon: <AgentIcon agent={a} size="small" />,
    }));
  }, [filteredAgents]);

  const loadTools = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/integrations`);
      if (!res.ok) return;
      const data = await res.json();
      setAvailableTools(data.data || []);
    } catch {
      /* non-critical */
    }
  }, [apiBase]);

  const loadAgent = useCallback(
    async (slug: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(`${apiBase}/api/agents`);
        if (!res.ok) throw new Error('Failed to load agents');
        const data = await res.json();
        const agent = (data.data || []).find(
          (a: any) => a.slug === slug || a.id === slug,
        );
        if (!agent) throw new Error('Agent not found');
        const f = formFromAgent(agent);
        setForm(f);
        setSavedForm(f);
        setToolsConfig(agent.toolsConfig || null);
        setIsLocked(true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  useEffect(() => {
    if (selectedSlug && !isCreating) {
      loadAgent(selectedSlug);
    }
  }, [selectedSlug, isCreating, loadAgent]);

  function handleSelect(slug: string) {
    urlSelect(slug);
    setIsCreating(false);
    setError(null);
    setValidationErrors({});
    setAdvancedOpen(false);
  }

  function handleNew() {
    urlSelect('new');
    setIsCreating(true);
    setTemplatePicked(agents.length === 0);
    setForm(EMPTY_FORM);
    setSavedForm(EMPTY_FORM);
    setError(null);
    setValidationErrors({});
    setAdvancedOpen(false);
  }

  function handleDeselect() {
    urlDeselect();
    setIsCreating(false);
    setError(null);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (isCreating) {
      if (!form.slug.trim()) errors.slug = 'Slug is required';
      else if (!/^[a-z0-9-]+$/.test(form.slug))
        errors.slug = 'Lowercase letters, numbers, hyphens only';
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
        tools: form.tools.mcpServers.length > 0 ? form.tools : undefined,
        icon: form.icon || undefined,
      };
      if (isCreating) {
        await createAgent(payload as any);
        setIsCreating(false);
        urlSelect(form.slug);
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
      urlDeselect();
      setIsCreating(false);
      setShowDeleteModal(false);
    } catch (err: any) {
      setError(err.message);
      setShowDeleteModal(false);
    }
  }

  const dirty = isDirty(form, savedForm);
  const isPlugin = selectedSlug?.includes(':') && !isCreating;
  const locked = !!(isPlugin && isLocked);
  const selectedAgent = allAgents.find((a) => a.slug === selectedSlug);

  const editorId = isCreating ? '__new__' : (selectedSlug ?? null);

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="agents"
        title="Agents"
        subtitle="AI agents with custom prompts, models, and tools"
        items={listItems}
        loading={agentsLoading}
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
        emptyContent={
          agents.length === 0 ? (
            <div style={{ padding: '2rem' }}>
              <h3
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Get started
              </h3>
              <p
                style={{
                  margin: '0 0 1.5rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                Create your first agent from a template
              </p>
              <div className="template-grid">
                {templates.map((t: any) => (
                  <button
                    key={t.id}
                    className="template-card"
                    onClick={() => {
                      handleNew();
                      setTimeout(() => {
                        setForm((f) => ({ ...f, ...t.form }));
                        setSavedForm((f) => ({ ...f, ...t.form }));
                        setTemplatePicked(true);
                      }, 0);
                    }}
                  >
                    <span className="template-card__icon">{t.icon}</span>
                    <span className="template-card__label">{t.label}</span>
                    <span className="template-card__desc">{t.description}</span>
                    {t.source !== 'built-in' && (
                      <span className="template-card__source">{t.source}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="editor__loading">Loading agent...</div>
        ) : (
          <div className="agent-inline-editor">
            {/* Editor header */}
            <div className="agent-inline-editor__header">
              <div className="agent-inline-editor__header-info">
                {!isCreating && selectedAgent && (
                  <AgentIcon
                    agent={selectedAgent}
                    size="medium"
                    style={{ borderRadius: '8px', flexShrink: 0 }}
                  />
                )}
                <div>
                  <h2
                    style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}
                  >
                    {isCreating ? 'New Agent' : form.name || selectedSlug}
                    {isPlugin && (
                      <span className="editor__plugin-badge">
                        {selectedSlug?.split(':')[0]}
                      </span>
                    )}
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
                  disabled={isSaving || locked}
                >
                  {dirty && !isSaving && (
                    <span
                      className="agent-inline-editor__dirty-dot"
                      aria-label="Unsaved changes"
                    />
                  )}
                  {isSaving
                    ? 'Saving…'
                    : isCreating
                      ? 'Create Agent'
                      : 'Save Changes'}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="management-view__error"
                style={{ margin: '0 24px 0' }}
              >
                {error}
              </div>
            )}

            {/* Plugin lock banner */}
            {isPlugin && isLocked && (
              <div className="editor__lock-banner">
                <span>
                  🔒 This agent is managed by a plugin. Edits will be
                  overwritten on plugin updates.
                </span>
                <button
                  type="button"
                  className="editor__lock-btn"
                  onClick={() => setIsLocked(false)}
                >
                  Unlock
                </button>
              </div>
            )}

            <div className="agent-inline-editor__body">
              {isCreating && !templatePicked && agents.length > 0 ? (
                <div style={{ padding: '2rem' }}>
                  <h3
                    style={{
                      margin: '0 0 0.5rem',
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    Start with a template
                  </h3>
                  <p
                    style={{
                      margin: '0 0 1.5rem',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Pick a starting point or start from scratch
                  </p>
                  <div className="template-grid">
                    {templates.map((t: any) => (
                      <button
                        key={t.id}
                        className="template-card"
                        onClick={() => {
                          setForm((f) => ({ ...f, ...t.form }));
                          setSavedForm((f) => ({ ...f, ...t.form }));
                          setTemplatePicked(true);
                        }}
                      >
                        <span className="template-card__icon">{t.icon}</span>
                        <span className="template-card__label">{t.label}</span>
                        <span className="template-card__desc">
                          {t.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="template-blank"
                    onClick={() => setTemplatePicked(true)}
                  >
                    Start Blank →
                  </button>
                </div>
              ) : (
                <>
                  {/* Basic section */}
                  <div className="agent-editor__section">
                    <div className="editor-field">
                      <label className="editor-label" htmlFor="ae-name">
                        Name
                      </label>
                      <input
                        id="ae-name"
                        type="text"
                        className="editor-input"
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
                        <span className="editor-error">
                          {validationErrors.name}
                        </span>
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
                        value={form.slug}
                        onChange={(e) =>
                          isCreating &&
                          setForm((f) => ({ ...f, slug: e.target.value }))
                        }
                        disabled={!isCreating}
                        placeholder="my-agent"
                      />
                      {validationErrors.slug && (
                        <span className="editor-error">
                          {validationErrors.slug}
                        </span>
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
                          agent={{
                            name: form.name || 'Agent',
                            icon: form.icon,
                          }}
                          size="large"
                          style={{ borderRadius: '10px', flexShrink: 0 }}
                        />
                        <input
                          type="text"
                          className="editor-input"
                          value={form.icon}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, icon: e.target.value }))
                          }
                          placeholder="Emoji (e.g. 🤖) or leave empty for initials"
                          disabled={locked}
                        />
                      </div>
                    </div>

                    <div className="editor-field">
                      <div className="editor-label-row">
                        <label
                          className="editor-label"
                          htmlFor="ae-description"
                        >
                          Description
                        </label>
                        <button
                          type="button"
                          className="editor-enrich-btn"
                          disabled={isEnriching || !form.name || locked}
                          onClick={async () => {
                            const text = await enrich(
                              `Write a brief one-sentence description for an AI agent named "${form.name}".`,
                            );
                            if (text)
                              setForm((f) => ({
                                ...f,
                                description: text.trim(),
                              }));
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
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        placeholder="A helpful agent for..."
                        disabled={locked}
                      />
                    </div>

                    <div className="editor-field">
                      <div className="editor-label-row">
                        <label className="editor-label" htmlFor="ae-prompt">
                          System Prompt
                        </label>
                        <button
                          type="button"
                          className="editor-enrich-btn"
                          disabled={isEnriching || !form.name || locked}
                          onClick={async () => {
                            const text = await enrich(
                              `Write a system prompt for an AI agent named "${form.name}"${form.description ? ` that ${form.description}` : ''}. Be specific and actionable.`,
                            );
                            if (text)
                              setForm((f) => ({ ...f, prompt: text.trim() }));
                          }}
                        >
                          {isEnriching ? '...' : '✨ Generate'}
                        </button>
                      </div>
                      <textarea
                        id="ae-prompt"
                        className="editor-textarea editor-textarea--tall editor-textarea--mono"
                        value={form.prompt}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, prompt: e.target.value }))
                        }
                        placeholder="You are a helpful assistant..."
                        disabled={locked}
                      />
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
                            style={
                              locked
                                ? { opacity: 0.5, pointerEvents: 'none' }
                                : undefined
                            }
                          >
                            <ModelSelector
                              value={form.modelId}
                              onChange={(modelId) =>
                                setForm((f) => ({ ...f, modelId }))
                              }
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
                            value={form.region}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, region: e.target.value }))
                            }
                            placeholder={appConfig?.region || 'us-east-1'}
                          />
                        </div>

                        <div className="editor-field">
                          <label
                            className="editor-label"
                            htmlFor="ae-guardrails"
                          >
                            Guardrails
                          </label>
                          {form.guardrails ? (
                            <div className="editor__guardrails-grid">
                              <div className="editor__guardrails-item">
                                <label className="editor-label">
                                  Temperature
                                </label>
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
                                  disabled={isPlugin && isLocked}
                                />
                              </div>
                              <div className="editor__guardrails-item">
                                <label className="editor-label">
                                  Max Tokens
                                </label>
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
                                  disabled={isPlugin && isLocked}
                                />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="editor-btn editor-btn--secondary"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  guardrails: {
                                    temperature: 0.7,
                                    maxTokens: 4096,
                                  },
                                }))
                              }
                              disabled={isPlugin && isLocked}
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
                            value={form.maxSteps}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                maxSteps: e.target.value,
                              }))
                            }
                            placeholder="0 (unlimited)"
                            disabled={isPlugin && isLocked}
                          />
                        </div>

                        {/* Integrations & Tools */}
                        <div className="editor-field">
                          <div className="editor-label-row">
                            <label className="editor-label">Integrations</label>
                            <button
                              type="button"
                              className="editor-enrich-btn"
                              onClick={() =>
                                onNavigate({ type: 'integrations' })
                              }
                            >
                              Manage Integrations →
                            </button>
                          </div>
                          {availableTools.length === 0 ? (
                            <div className="editor__tools-empty">
                              No integrations available.{' '}
                              <button
                                type="button"
                                className="editor__tools-link"
                                onClick={() =>
                                  onNavigate({ type: 'integrations' })
                                }
                              >
                                Install integrations
                              </button>{' '}
                              to get started.
                            </div>
                          ) : (
                            (() => {
                              const enabledServers = new Set(
                                form.tools.mcpServers,
                              );

                              const toggleIntegration = (id: string) => {
                                if (locked) return;
                                setForm((f) => {
                                  const servers = new Set(f.tools.mcpServers);
                                  const avail = [...f.tools.available];
                                  if (servers.has(id)) {
                                    servers.delete(id);
                                    return {
                                      ...f,
                                      tools: {
                                        ...f.tools,
                                        mcpServers: [...servers],
                                        available: avail.filter(
                                          (p) => !p.startsWith(`${id}_`),
                                        ),
                                      },
                                    };
                                  } else {
                                    servers.add(id);
                                    avail.push(`${id}_*`);
                                    return {
                                      ...f,
                                      tools: {
                                        ...f.tools,
                                        mcpServers: [...servers],
                                        available: avail,
                                      },
                                    };
                                  }
                                });
                              };

                              const sorted = [...availableTools].sort(
                                (a, b) => {
                                  const aOn = enabledServers.has(a.id) ? 0 : 1;
                                  const bOn = enabledServers.has(b.id) ? 0 : 1;
                                  return aOn - bOn;
                                },
                              );

                              return (
                                <div className="editor__tools-grouped">
                                  {sorted.map((integration) => {
                                    const enabled = enabledServers.has(
                                      integration.id,
                                    );
                                    const hasWildcard =
                                      form.tools.available.includes(
                                        `${integration.id}_*`,
                                      );
                                    return (
                                      <div
                                        key={integration.id}
                                        className={`editor__tools-server${enabled ? '' : ' editor__tools-server--disabled'}`}
                                      >
                                        <div
                                          className="editor__tools-server-header"
                                          onClick={() =>
                                            toggleIntegration(integration.id)
                                          }
                                          style={{
                                            cursor: locked
                                              ? 'default'
                                              : 'pointer',
                                          }}
                                        >
                                          <Checkbox
                                            checked={enabled}
                                            onChange={() => {}}
                                            disabled={locked}
                                          />
                                          <span className="editor__tools-server-name">
                                            {integration.displayName ||
                                              integration.id}
                                          </span>
                                          {enabled && hasWildcard && (
                                            <span className="editor__tools-server-count">
                                              all tools
                                            </span>
                                          )}
                                          {enabled && !hasWildcard && (
                                            <span className="editor__tools-server-count">
                                              selective
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()
                          )}
                        </div>
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
        <ACPConnectionsSection
          acpAgents={acpAgents as unknown as AgentSummary[]}
          apiBase={apiBase}
        />
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
