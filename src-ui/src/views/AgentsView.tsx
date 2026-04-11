import {
  type AgentTemplate,
  useAgentQuery,
  useAgentTemplatesQuery,
  useAgentsQuery,
  useAgentToolsQuery,
  useIntegrationsQuery,
  usePromptsQuery,
  useSkillsQuery,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useState } from 'react';
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
import type { NavigationView, Tool } from '../types';
import {
  buildAgentPayload,
  createEmptyAgentForm,
  createNewAgentForm,
  formFromAgent,
  groupAgentToolsByServer,
  isAgentFormDirty,
  validateAgentForm,
} from './agent-editor/agentsViewUtils';
import {
  buildAgentsViewEmptyContent,
  buildAgentsViewItems,
} from './agent-editor/agentsViewHelpers';
import {
  AgentsViewEditorPane,
} from './agent-editor/AgentsViewEditorPane';
import type { AgentFormData } from './agent-editor/types';
import './editor-layout.css';
import './page-layout.css';

interface AgentsViewProps {
  agents: AgentData[];
  availableModels: Array<{ id: string; name: string }>;
  defaultModel?: string;
  bedrockReady: boolean;
  onNavigate: (view: NavigationView) => void;
}

export function AgentsView({
  agents,
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

  const selectedSlug = urlSlug === 'new' ? null : urlSlug;
  const selectedAcpConnection = selectedSlug?.startsWith('__acp:')
    ? selectedSlug.slice(6)
    : null;
  const selectedAgentSlug =
    selectedSlug && !selectedAcpConnection ? selectedSlug : undefined;
  const [isCreating, setIsCreating] = useState(urlSlug === 'new');
  const [templatePicked, setTemplatePicked] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<AgentFormData>(() => createEmptyAgentForm());
  const [savedForm, setSavedForm] = useState<AgentFormData>(() =>
    createEmptyAgentForm(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const { data: templates = [] } = useAgentTemplatesQuery() as {
    data?: AgentTemplate[];
  };
  const { data: availableTools = [] } = useIntegrationsQuery() as {
    data?: Tool[];
  };
  const { data: availableSkills = [] } = useSkillsQuery() as {
    data?: any[];
  };
  const { data: availablePrompts = [] } = usePromptsQuery() as {
    data?: any[];
  };
  const {
    data: loadedAgent,
    isLoading,
    error: loadError,
    refetch: refetchAgent,
  } = useAgentQuery(selectedAgentSlug, {
    enabled: !!selectedAgentSlug && !isCreating,
  });
  const { data: agentTools = [], refetch: refetchAgentTools } =
    useAgentToolsQuery(selectedAgentSlug, {
      enabled: !!selectedAgentSlug && !isCreating,
    }) as {
      data?: Tool[];
      refetch: () => Promise<unknown>;
    };
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

  const listItems = useMemo(() => {
    return buildAgentsViewItems(filteredAgents, acpConnections);
  }, [filteredAgents, acpConnections]);

  const emptyContent = buildAgentsViewEmptyContent({
    agentsCount: agents.length,
    templates,
    onCreateFromTemplate: (templateForm) => {
      handleNew(templateForm);
    },
    onCreateBlank: () => {
      handleNew();
      setTemplatePicked(true);
    },
  });

  useEffect(() => {
    if (!loadedAgent || isCreating) {
      return;
    }

    const nextForm = formFromAgent(loadedAgent);
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsLocked(true);
  }, [loadedAgent, isCreating]);

  useEffect(() => {
    setIntegrationTools(groupAgentToolsByServer(agentTools));
  }, [agentTools]);

  function handleSelect(slug: string) {
    guard(() => {
      urlSelect(slug);
      setIsCreating(false);
      setActionError(null);
      setValidationErrors({});
    });
  }

  function handleNew(initialForm?: Partial<AgentFormData>) {
    guard(() => {
      urlSelect('new');
      setIsCreating(true);
      setTemplatePicked(!!initialForm || agents.length === 0);
      const base = createNewAgentForm(initialForm);
      setForm(base);
      setSavedForm(base);
      setActionError(null);
      setValidationErrors({});
    });
  }

  function handleDeselect() {
    urlDeselect();
    setIsCreating(false);
    setActionError(null);
  }

  function validate(): boolean {
    const errors = validateAgentForm(form, isCreating);
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      setIsSaving(true);
      setActionError(null);
      const payload = buildAgentPayload(form);
      if (isCreating) {
        await createAgent(payload as any);
        setIsCreating(false);
        urlSelect(form.slug);
      } else {
        await updateAgent(selectedSlug!, payload);
        await Promise.all([refetchAgent(), refetchAgentTools()]);
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteAgent(selectedSlug!);
      urlDeselect();
      setIsCreating(false);
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  const dirty = isAgentFormDirty(form, savedForm);
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  const isPlugin = !!selectedSlug?.includes(':') && !isCreating;
  const selectedAgent = allAgents.find((a) => a.slug === selectedSlug);
  const isAcp = selectedAgent?.source === 'acp';
  const locked = !!(isPlugin && isLocked) || !!isAcp;
  const error =
    actionError ??
    (loadError instanceof Error ? loadError.message : loadError ? String(loadError) : null);
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
        emptyContent={emptyContent}
      >
        <AgentsViewEditorPane
          selectedAcpConnection={selectedAcpConnection}
          acpAgents={acpAgents}
          isLoading={isLoading}
          notFound={notFound}
          error={error}
          isCreating={isCreating}
          templatePicked={templatePicked}
          agentsCount={agents.length}
          selectedSlug={selectedSlug}
          selectedAgent={selectedAgent}
          isAcp={isAcp}
          isPlugin={isPlugin}
          locked={locked}
          isLocked={isLocked}
          dirty={dirty}
          isSaving={isSaving}
          validationErrors={validationErrors}
          availableTools={availableTools}
          availableSkills={availableSkills}
          availablePrompts={availablePrompts}
          integrationTools={integrationTools}
          appConfig={appConfig}
          enrich={enrich}
          isEnriching={isEnriching}
          onNavigate={onNavigate}
          onDeselect={handleDeselect}
          onDelete={handleDelete}
          onSave={handleSave}
          onUnlockPlugin={() => setIsLocked(false)}
          form={form}
          setForm={setForm}
          templates={templates}
          onPickTemplate={(templateForm) => {
            setForm((current) => ({ ...current, ...templateForm }));
            setSavedForm((current) => ({ ...current, ...templateForm }));
            setTemplatePicked(true);
          }}
          onStartBlank={() => setTemplatePicked(true)}
        />
      </SplitPaneLayout>

      <DiscardModal />
    </div>
  );
}
