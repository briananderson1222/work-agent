import type { Playbook } from '@stallion-ai/contracts/catalog';
import {
  useAgentsQuery,
  useCreateLocalSkillMutation,
  useCreatePlaybookMutation,
  useDeletePlaybookMutation,
  useImportPlaybooksMutation,
  usePlaybooksQuery,
  useTrackPlaybookRunMutation,
  useUpdatePlaybookMutation,
} from '@stallion-ai/sdk';
import { playbookToGuidanceAsset } from '@stallion-ai/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApiBase } from '../../contexts/ApiBaseContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { useToast } from '../../contexts/ToastContext';
import {
  useCreateChatSession,
  useSendMessage,
} from '../../hooks/useActiveChatSessions';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { useUrlSelection } from '../../hooks/useUrlSelection';
import {
  buildPlaybookPayload,
  EMPTY_PLAYBOOK_FORM,
  extractTemplateVariables,
  formatPlaybookStatsSummary,
  type PlaybookForm,
  playbookToForm,
} from './utils';
import { buildPlaybookCategories, filterAndSortPlaybooks } from './view-utils';

type AgentOption = { slug: string; name: string };

export function usePlaybooksViewModel() {
  const { apiBase } = useApiBase();
  const {
    selectedId: urlId,
    select: urlSelect,
    deselect: urlDeselect,
  } = useUrlSelection('/playbooks');
  const { showToast } = useToast();
  const { navigate, setDockState, setActiveChat } = useNavigation();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);

  const selectedId = urlId === 'new' ? null : urlId;
  const [isNew, setIsNew] = useState(urlId === 'new');
  const [form, setForm] = useState<PlaybookForm>(EMPTY_PLAYBOOK_FORM);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'category'>('date');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const { data: prompts = [], isLoading } = usePlaybooksQuery() as {
    data?: Playbook[];
    isLoading: boolean;
  };
  const { data: agents = [] } = useAgentsQuery() as {
    data?: AgentOption[];
  };
  const trackRunMutation = useTrackPlaybookRunMutation();
  const createLocalSkillMutation = useCreateLocalSkillMutation();

  const handleRun = useCallback(
    async (resolvedContent: string, agentSlug: string) => {
      const agent = agents.find((entry) => entry.slug === agentSlug);
      if (!agent) return;
      const sessionId = createChatSession(
        agent.slug,
        agent.name,
        form.name || 'Prompt Test',
      );
      setDockState(true);
      setActiveChat(null);
      setShowRunModal(false);
      await sendMessage(sessionId, agent.slug, undefined, resolvedContent);
      if (selectedId) {
        await trackRunMutation.mutateAsync(selectedId).catch(() => undefined);
      }
    },
    [
      agents,
      createChatSession,
      form.name,
      selectedId,
      sendMessage,
      setActiveChat,
      setDockState,
      trackRunMutation,
    ],
  );

  const createMutation = useCreatePlaybookMutation({
    onSuccess: (playbook) => {
      setIsNew(false);
      urlSelect(playbook.id);
      setDirty(false);
      showToast('Playbook created');
    },
    onError: () => showToast('Failed to create playbook'),
  });

  const updateMutation = useUpdatePlaybookMutation({
    onSuccess: () => {
      setDirty(false);
      showToast('Playbook saved');
    },
    onError: () => showToast('Failed to save playbook'),
  });

  const deleteMutation = useDeletePlaybookMutation({
    onSuccess: () => {
      urlDeselect();
      setIsNew(false);
      setDirty(false);
      showToast('Playbook deleted');
    },
    onError: () => showToast('Failed to delete playbook'),
  });

  const importMutation = useImportPlaybooksMutation({
    onSuccess: ({ count, failed }) => {
      setShowImportModal(false);
      showToast(
        failed > 0
          ? `Imported ${count} playbook${count !== 1 ? 's' : ''} (${failed} failed)`
          : `Imported ${count} playbook${count !== 1 ? 's' : ''}`,
      );
    },
    onError: () => showToast('Import failed'),
  });

  const categories = useMemo(() => buildPlaybookCategories(prompts), [prompts]);
  const filtered = useMemo(
    () => filterAndSortPlaybooks(prompts, search, sortBy),
    [prompts, search, sortBy],
  );
  const guidanceAssets = useMemo(
    () => filtered.map(playbookToGuidanceAsset),
    [filtered],
  );
  const listItems = useMemo(
    () =>
      guidanceAssets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        subtitle: [
          asset.category,
          asset.tags?.slice(0, 2).join(', '),
          formatPlaybookStatsSummary(
            filtered.find((playbook) => playbook.id === asset.id)!,
          ),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [filtered, guidanceAssets],
  );
  const selectedPrompt = prompts.find((playbook) => playbook.id === selectedId);
  const isEditing = isNew || !!selectedId;
  const templateVars = useMemo(
    () => extractTemplateVariables(form.content),
    [form.content],
  );

  useEffect(() => {
    if (selectedPrompt && !isNew && !dirty) {
      setForm(playbookToForm(selectedPrompt));
    }
  }, [dirty, isNew, selectedPrompt]);

  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  function selectPrompt(id: string) {
    guard(() => {
      const playbook = prompts.find((entry) => entry.id === id);
      if (!playbook) return;
      urlSelect(id);
      setIsNew(false);
      setForm(playbookToForm(playbook));
      setDirty(false);
      setTouched({});
      setAdvancedOpen(false);
    });
  }

  function startNew() {
    guard(() => {
      urlDeselect();
      setIsNew(true);
      setForm(EMPTY_PLAYBOOK_FORM);
      setDirty(false);
      setTouched({});
      setAdvancedOpen(false);
    });
  }

  function handleDeselect() {
    urlDeselect();
    setIsNew(false);
  }

  function updateField(field: keyof PlaybookForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  function handleSave() {
    if (
      prompts.some(
        (playbook) =>
          playbook.name === form.name.trim() && playbook.id !== selectedId,
      )
    ) {
      showToast('A prompt with this name already exists');
      return;
    }
    const payload = buildPlaybookPayload(form);
    if (isNew) {
      createMutation.mutate(payload);
    } else if (selectedId) {
      updateMutation.mutate({ id: selectedId, ...payload });
    }
  }

  function handleDuplicate() {
    createMutation.mutate({
      ...buildPlaybookPayload(form),
      name: `Copy of ${form.name}`,
    });
  }

  function confirmDelete() {
    setShowDeleteModal(false);
    if (selectedId) {
      deleteMutation.mutate(selectedId);
    }
  }

  function handleImport(
    items: Array<{
      name: string;
      content: string;
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
      storageMode?: 'json-inline' | 'markdown-file';
    }>,
  ) {
    importMutation.mutate(items);
  }

  async function handlePackageAsSkill() {
    if (!form.name.trim() || !form.content.trim()) {
      showToast('Name and content are required');
      return;
    }
    try {
      await createLocalSkillMutation.mutateAsync({
        name: form.name.trim(),
        body: form.content,
        description: form.description || undefined,
        category: form.category || undefined,
        tags: form.tags
          ? form.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
        agent: form.agent || undefined,
        global: form.global || undefined,
      });
      showToast('Skill package created');
      navigate(`/skills/${encodeURIComponent(form.name.trim())}`);
    } catch {
      showToast('Failed to package playbook as skill');
    }
  }

  return {
    advancedOpen,
    agents,
    categories,
    confirmDelete,
    createPending: createMutation.isPending,
    deletePending: deleteMutation.isPending,
    dirty,
    DiscardModal,
    form,
    handleDeselect,
    handleDuplicate,
    handleImport,
    handlePackageAsSkill,
    handleRun,
    handleSave,
    importPending: importMutation.isPending,
    isEditing,
    isLoading,
    isNew,
    listItems,
    onFieldBlur: (field: string) =>
      setTouched((current) => ({ ...current, [field]: true })),
    onGlobalChange: (value: string) => {
      setForm((current) => ({ ...current, global: value }));
      setDirty(true);
    },
    search,
    selectPrompt,
    selectedId,
    selectedPrompt,
    setAdvancedOpen,
    setSearch,
    setShowDeleteModal,
    setShowImportModal,
    setShowRunModal,
    setSortBy,
    showDeleteModal,
    showImportModal,
    showRunModal,
    sortBy,
    startNew,
    templateVars,
    touched,
    updateField,
    updatePending: updateMutation.isPending,
  };
}
