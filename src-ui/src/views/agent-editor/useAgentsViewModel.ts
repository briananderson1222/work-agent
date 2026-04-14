import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import {
  type AgentTemplate,
  useAgentQuery,
  useAgentTemplatesQuery,
  useAgentToolsQuery,
  useIntegrationsQuery,
  usePromptsQuery,
  useRuntimeConnectionsQuery,
  useSkillsQuery,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useState } from 'react';
import {
  type AgentData,
  useAgentActions,
  useAgents,
} from '../../contexts/AgentsContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useACPConnections } from '../../hooks/useACPConnections';
import { useAIEnrich } from '../../hooks/useAIEnrich';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { useUrlSelection } from '../../hooks/useUrlSelection';
import type { NavigationView, Tool } from '../../types';
import { defaultManagedRuntimeConnection } from '../../utils/execution';
import {
  buildAgentsViewEmptyContent,
  buildAgentsViewItems,
} from './agentsViewHelpers';
import {
  buildAgentPayload,
  createEmptyAgentForm,
  createNewAgentForm,
  formFromAgent,
  groupAgentToolsByServer,
  isAgentFormDirty,
  validateAgentForm,
} from './agentsViewUtils';
import type { AgentFormData } from './types';
import { getAgentType } from './utils';

interface UseAgentsViewModelArgs {
  agents: AgentData[];
  onNavigate: (view: NavigationView) => void;
}

export function useAgentsViewModel({
  agents,
  onNavigate,
}: UseAgentsViewModelArgs) {
  const liveAgents = useAgents();
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
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery() as {
    data?: ConnectionConfig[];
  };
  const defaultManagedRuntimeId =
    defaultManagedRuntimeConnection(runtimeConnections)?.id ?? '';
  const [form, setForm] = useState<AgentFormData>(() =>
    createEmptyAgentForm(defaultManagedRuntimeId),
  );
  const [savedForm, setSavedForm] = useState<AgentFormData>(() =>
    createEmptyAgentForm(defaultManagedRuntimeId),
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

  const allAgents = liveAgents.length > 0 ? liveAgents : agents;
  const acpAgents = allAgents.filter((agent) => agent.source === 'acp');
  const { data: acpConnections = [] } = useACPConnections();

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase();
    return allAgents.filter(
      (agent) =>
        !q ||
        agent.name.toLowerCase().includes(q) ||
        agent.slug.toLowerCase().includes(q),
    );
  }, [allAgents, search]);

  const listItems = useMemo(
    () => buildAgentsViewItems(filteredAgents, acpConnections),
    [filteredAgents, acpConnections],
  );

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

    const nextForm = formFromAgent(loadedAgent, defaultManagedRuntimeId);
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsLocked(true);
  }, [defaultManagedRuntimeId, loadedAgent, isCreating]);

  useEffect(() => {
    if (!defaultManagedRuntimeId) {
      return;
    }
    setForm((current) =>
      current.execution.runtimeConnectionId
        ? current
        : {
            ...current,
            execution: {
              ...current.execution,
              runtimeConnectionId: defaultManagedRuntimeId,
            },
          },
    );
    setSavedForm((current) =>
      current.execution.runtimeConnectionId
        ? current
        : {
            ...current,
            execution: {
              ...current.execution,
              runtimeConnectionId: defaultManagedRuntimeId,
            },
          },
    );
  }, [defaultManagedRuntimeId]);

  useEffect(() => {
    setIntegrationTools(groupAgentToolsByServer(agentTools));
  }, [agentTools]);

  const validate = (): boolean => {
    const agentType = getAgentType(
      form.execution.runtimeConnectionId,
      runtimeConnections,
    );
    const errors = validateAgentForm(form, isCreating, agentType);
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const dirty = isAgentFormDirty(form, savedForm);
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

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
      const base = createNewAgentForm(initialForm, defaultManagedRuntimeId);
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

  const isPlugin = !!selectedSlug?.includes(':') && !isCreating;
  const selectedAgent = allAgents.find((agent) => agent.slug === selectedSlug);
  const isAcp = selectedAgent?.source === 'acp';
  const locked = !!(isPlugin && isLocked) || !!isAcp;
  const error =
    actionError ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? String(loadError)
        : null);
  const notFound = !isCreating && error === 'Agent not found';
  const editorId = isCreating ? '__new__' : (selectedSlug ?? null);

  return {
    DiscardModal,
    acpAgents,
    appConfig,
    availablePrompts,
    availableSkills,
    availableTools,
    dirty,
    editorId,
    emptyContent,
    enrich,
    error,
    form,
    handleDelete,
    handleDeselect,
    handleNew,
    handleSave,
    handleSelect,
    integrationTools,
    isAcp,
    isCreating,
    isEnriching,
    isLoading,
    isLocked,
    isPlugin,
    isSaving,
    listItems,
    locked,
    notFound,
    onNavigate,
    search,
    selectedAcpConnection,
    selectedAgent,
    selectedSlug,
    setForm,
    setIsLocked,
    setSearch,
    setSavedForm,
    setTemplatePicked,
    templatePicked,
    templates,
    validationErrors,
  };
}
