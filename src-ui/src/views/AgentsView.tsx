import { useAgentsQuery } from '@stallion-ai/sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACPConnectionsSection } from '../components/ACPConnectionsSection';
import { AgentIcon } from '../components/AgentIcon';
import { ConfirmModal } from '../components/ConfirmModal';
import { DetailHeader } from '../components/DetailHeader';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import {
  type AgentData,
  useAgentActions,
  useAgents,
} from '../contexts/AgentsContext';
import { useConfig } from '../contexts/ConfigContext';
import { useACPConnections } from '../hooks/useACPConnections';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useUrlSelection } from '../hooks/useUrlSelection';
import type { AgentSummary, NavigationView, Tool } from '../types';
import { AgentAddModal } from './AgentAddModal';
import { AgentEditorForm, type AgentFormData } from './AgentEditorForm';
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
  skills: [],
  prompts: [],
};

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
    skills: agent.skills || [],
    prompts: agent.prompts || [],
  };
}

function isDirty(form: AgentFormData, saved: AgentFormData): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

export function AgentsView({
  agents,
  apiBase,
  bedrockReady: _bedrockReady,
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
  const { data: availableTools = [] } = useQuery<Tool[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/integrations`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
  });
  const { data: availableSkills = [] } = useQuery<any[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/system/skills`);
      const json = await res.json();
      return json.data ?? [];
    },
  });
  const { data: availablePrompts = [] } = useQuery<any[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/prompts`);
      const json = await res.json();
      return json.data ?? [];
    },
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addModalType, setAddModalType] = useState<
    'integrations' | 'skills' | 'prompts' | null
  >(null);
  const [integrationTools, setIntegrationTools] = useState<
    Record<string, Tool[]>
  >({});

  // Use live agents from context, fall back to prop
  const allAgents = liveAgents.length > 0 ? liveAgents : agents;
  const acpAgents = allAgents.filter((a) => a.source === 'acp');
  const { data: acpConnections = [] } = useACPConnections();

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase();
    return allAgents.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q),
    );
  }, [allAgents, search]);

  // Group: standalone → workspace-scoped → ACP connections
  const listItems = useMemo(() => {
    const standalone = filteredAgents.filter(
      (a) => !a.slug.includes(':') && a.source !== 'acp',
    );
    const layoutAgents = filteredAgents.filter(
      (a) => a.slug.includes(':') && a.source !== 'acp',
    );
    const agentItems = [...standalone, ...layoutAgents].map((a) => ({
      id: a.slug,
      name: a.name,
      subtitle: a.slug,
      icon: <AgentIcon agent={a} size="small" />,
    }));
    // Add one entry per ACP connection instead of individual modes
    const connItems = acpConnections.map((c: any) => ({
      id: `__acp:${c.id}`,
      name: c.name || c.id,
      subtitle: `${(c.modes || []).length} agents · ACP`,
      icon: c.icon ? (
        <img src={c.icon} alt="" className="agents-list__acp-icon" />
      ) : (
        <span className="agents-list__acp-emoji">🔌</span>
      ),
    }));
    return [...agentItems, ...connItems];
  }, [filteredAgents, acpConnections]);

  const loadAgent = useCallback(
    async (slug: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(
          `${apiBase}/api/agents/${encodeURIComponent(slug)}`,
        );
        if (res.status === 404) throw new Error('Agent not found');
        if (!res.ok) throw new Error('Failed to load agent');
        const data = await res.json();
        const agent = data.data;
        if (!agent) throw new Error('Agent not found');
        const f = formFromAgent(agent);
        setForm(f);
        setSavedForm(f);
        setToolsConfig(agent.toolsConfig || null);
        setIsLocked(true);

        // Fetch per-agent tools with server metadata
        try {
          const toolsRes = await fetch(`${apiBase}/agents/${slug}/tools`);
          if (toolsRes.ok) {
            const toolsData = await toolsRes.json();
            const grouped: Record<string, Tool[]> = {};
            for (const tool of toolsData.data || []) {
              if (tool.server) {
                if (!grouped[tool.server]) grouped[tool.server] = [];
                grouped[tool.server].push(tool);
              }
            }
            setIntegrationTools(grouped);
          }
        } catch {
          /* non-critical */
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    if (selectedSlug && !isCreating) {
      loadAgent(selectedSlug);
    }
  }, [selectedSlug, isCreating, loadAgent]);

  function handleSelect(slug: string) {
    guard(() => {
      urlSelect(slug);
      setIsCreating(false);
      setError(null);
      setValidationErrors({});
    });
  }

  function handleNew(initialForm?: Partial<AgentFormData>) {
    guard(() => {
      urlSelect('new');
      setIsCreating(true);
      setTemplatePicked(!!initialForm || agents.length === 0);
      const base = initialForm ? { ...EMPTY_FORM, ...initialForm } : EMPTY_FORM;
      setForm(base);
      setSavedForm(base);
      setError(null);
      setValidationErrors({});
    });
  }

  function handleDeselect() {
    urlDeselect();
    setIsCreating(false);
    setError(null);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.prompt.trim()) errors.prompt = 'System prompt is required';
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
        skills: form.skills.length > 0 ? form.skills : undefined,
        prompts: form.prompts.length > 0 ? form.prompts : undefined,
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
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  const isPlugin = selectedSlug?.includes(':') && !isCreating;
  const selectedAgent = allAgents.find((a) => a.slug === selectedSlug);
  const isAcp = selectedAgent?.source === 'acp';
  const locked = !!(isPlugin && isLocked) || !!isAcp;
  const selectedAcpConnection = selectedSlug?.startsWith('__acp:')
    ? selectedSlug.slice(6)
    : null;
  const notFound = !isCreating && error === 'Agent not found';

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
        onAdd={handleNew}
        addLabel="+ New Agent"
        emptyIcon="⬡"
        emptyTitle="No agent selected"
        emptyDescription="Select an agent to edit, or create a new one"
        emptyContent={
          <div className="agents-empty-wrapper">
            {agents.length === 0 ? (
              <div className="agents-onboard">
                <h3 className="agents-onboard__title">Get started</h3>
                <p className="agents-onboard__desc">
                  Create your first agent from a template
                </p>
                <div className="template-grid">
                  {templates.map((t: any) => (
                    <button
                      key={t.id}
                      className="template-card"
                      onClick={() => handleNew(t.form)}
                    >
                      <span className="template-card__icon">{t.icon}</span>
                      <span className="template-card__label">{t.label}</span>
                      <span className="template-card__desc">
                        {t.description}
                      </span>
                      {t.source !== 'built-in' && (
                        <span className="template-card__source">
                          {t.source}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="split-pane__empty">
                <div className="split-pane__empty-icon">⬡</div>
                <p className="split-pane__empty-title">No agent selected</p>
                <p className="split-pane__empty-desc">
                  Select an agent to edit, or create a new one
                </p>
              </div>
            )}
          </div>
        }
      >
        {selectedAcpConnection ? (
          <div className="agent-editor__acp-section">
            <ACPConnectionsSection
              acpAgents={acpAgents as unknown as AgentSummary[]}
              apiBase={apiBase}
            />
          </div>
        ) : isLoading ? (
          <div className="editor__loading">Loading agent...</div>
        ) : notFound ? (
          <div className="split-pane__empty">
            <div className="split-pane__empty-icon">⬡</div>
            <p className="split-pane__empty-title">Agent not found</p>
            <p className="split-pane__empty-desc">
              The agent "{selectedSlug}" doesn't exist or was deleted.
            </p>
            <button
              type="button"
              className="editor-btn editor-btn--primary"
              onClick={handleDeselect}
            >
              Back to agents
            </button>
          </div>
        ) : (
          <div className="agent-inline-editor">
            {/* Editor header */}
            <DetailHeader
              title={isCreating ? 'New Agent' : form.name || selectedSlug || ''}
              icon={
                !isCreating && selectedAgent ? (
                  <AgentIcon
                    agent={selectedAgent}
                    size="medium"
                    className="editor-icon-preview"
                  />
                ) : undefined
              }
              badge={
                isAcp
                  ? { label: 'ACP', variant: 'muted' as const }
                  : isPlugin
                    ? {
                        label: selectedSlug?.split(':')[0] || 'plugin',
                        variant: 'info' as const,
                      }
                    : undefined
              }
            >
              {!isCreating && selectedSlug && !isAcp && (
                <button
                  type="button"
                  className="editor-btn editor-btn--danger"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={locked}
                >
                  Delete
                </button>
              )}
              {!isAcp && (
                <button
                  type="button"
                  className="editor-btn editor-btn--primary agent-editor__save-btn"
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
              )}
            </DetailHeader>

            {error && (
              <div className="management-view__error agent-editor__error-banner">
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

            {/* ACP info banner */}
            {isAcp && (
              <div className="editor__lock-banner editor__lock-banner--info">
                <span>
                  ℹ️ This agent is managed by ACP. Configuration is read-only.
                </span>
              </div>
            )}

            <div className="agent-inline-editor__body">
              {isCreating && !templatePicked && agents.length > 0 ? (
                <div className="agent-editor__template-picker">
                  <h3 className="agent-editor__template-title">
                    Start with a template
                  </h3>
                  <p className="agent-editor__template-desc">
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
                <AgentEditorForm
                  form={form}
                  setForm={setForm}
                  isCreating={isCreating}
                  locked={locked}
                  isPlugin={isPlugin}
                  isLocked={isLocked}
                  validationErrors={validationErrors}
                  availableTools={availableTools}
                  availableSkills={availableSkills}
                  availablePrompts={availablePrompts}
                  integrationTools={integrationTools}
                  appConfig={appConfig}
                  enrich={enrich}
                  isEnriching={isEnriching}
                  onNavigate={onNavigate}
                  onOpenAddModal={setAddModalType}
                />
              )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Agent"
        message={`Are you sure you want to delete "${form.name || selectedSlug}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        variant="danger"
      />

      {addModalType && (
        <AgentAddModal
          type={addModalType}
          availableTools={availableTools}
          availableSkills={availableSkills}
          availablePrompts={availablePrompts}
          form={form}
          setForm={setForm}
          onClose={() => setAddModalType(null)}
        />
      )}

      <DiscardModal />
    </div>
  );
}
