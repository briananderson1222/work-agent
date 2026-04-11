import type { Playbook } from '@stallion-ai/contracts/catalog';
import {
  useAgentsQuery,
  useCreatePlaybookMutation,
  useDeletePlaybookMutation,
  useImportPlaybooksMutation,
  usePlaybooksQuery,
  useUpdatePlaybookMutation,
} from '@stallion-ai/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ImportPromptsModal } from '../components/ImportPromptsModal';
import { PromptRunModal } from '../components/PromptRunModal';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import {
  useCreateChatSession,
  useSendMessage,
} from '../hooks/useActiveChatSessions';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useUrlSelection } from '../hooks/useUrlSelection';
import { PlaybooksEditor } from './playbooks/PlaybooksEditor';
import {
  buildPlaybookExportMarkdown,
  buildPlaybookFilename,
  buildPlaybookPayload,
  EMPTY_PLAYBOOK_FORM,
  extractTemplateVariables,
  type PlaybookForm,
  playbookToForm,
} from './playbooks/utils';
import './page-layout.css';
import './editor-layout.css';

type AgentOption = { slug: string; name: string };

export function PlaybooksView() {
  const { apiBase } = useApiBase();
  const {
    selectedId: urlId,
    select: urlSelect,
    deselect: urlDeselect,
  } = useUrlSelection('/playbooks');
  const { showToast } = useToast();

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

  const { setDockState, setActiveChat } = useNavigation();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);

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
    },
    [
      agents,
      createChatSession,
      form.name,
      sendMessage,
      setActiveChat,
      setDockState,
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

  const categories = useMemo(
    () => [
      ...new Set(
        prompts
          .map((playbook) => playbook.category)
          .filter(Boolean) as string[],
      ),
    ],
    [prompts],
  );

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    const list = prompts.filter(
      (playbook) =>
        !query ||
        playbook.name.toLowerCase().includes(query) ||
        playbook.category?.toLowerCase().includes(query) ||
        playbook.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
    return list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') {
        return (a.category ?? '').localeCompare(b.category ?? '');
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [prompts, search, sortBy]);

  const selectedPrompt = prompts.find((playbook) => playbook.id === selectedId);
  const isEditing = isNew || !!selectedId;

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

  function handleExport() {
    const markdown = buildPlaybookExportMarkdown(form);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = buildPlaybookFilename(form.name);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const templateVars = extractTemplateVariables(form.content);

  const listItems = filtered.map((playbook) => ({
    id: playbook.id,
    name: playbook.name,
    subtitle: [playbook.category, playbook.tags?.slice(0, 2).join(', ')]
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="playbooks"
        title="Playbooks"
        subtitle="Reusable playbooks for layouts and agents"
        items={listItems}
        loading={isLoading}
        selectedId={isNew ? '__new__' : selectedId}
        onSelect={selectPrompt}
        onDeselect={handleDeselect}
        onSearch={setSearch}
        searchPlaceholder="Search prompts..."
        onAdd={startNew}
        addLabel="+ New Playbook"
        emptyIcon="⌘"
        emptyTitle="No playbook selected"
        emptyDescription="Select a playbook or create a new one"
        sidebarActions={
          <>
            <select
              className="editor-select editor-select--small"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'name' | 'date' | 'category')
              }
            >
              <option value="date">Newest</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
            </select>
            <button
              className="split-pane__add-btn split-pane__add-btn--secondary"
              onClick={() => setShowImportModal(true)}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing…' : 'Import .md'}
            </button>
          </>
        }
      >
        {isEditing && (
          <PlaybooksEditor
            agents={agents}
            categories={categories}
            dirty={dirty}
            form={form}
            isNew={isNew}
            selectedId={selectedId}
            selectedPrompt={selectedPrompt}
            savePending={createMutation.isPending || updateMutation.isPending}
            advancedOpen={advancedOpen}
            touched={touched}
            onAdvancedOpenChange={setAdvancedOpen}
            onDelete={() => setShowDeleteModal(true)}
            onDuplicate={handleDuplicate}
            onExport={handleExport}
            onFieldBlur={(field) =>
              setTouched((current) => ({ ...current, [field]: true }))
            }
            onFieldChange={updateField}
            onGlobalChange={(value) => {
              setForm((current) => ({ ...current, global: value }));
              setDirty(true);
            }}
            onSave={handleSave}
            onTest={() => setShowRunModal(true)}
            onGenerateContent={(value) => updateField('content', value)}
            onGenerateDescription={(value) => updateField('description', value)}
          />
        )}
      </SplitPaneLayout>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Playbook"
        message={`Delete "${selectedPrompt?.name ?? form.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteModal(false);
          if (selectedId) deleteMutation.mutate(selectedId);
        }}
        onCancel={() => setShowDeleteModal(false)}
      />

      <PromptRunModal
        isOpen={showRunModal}
        prompt={{ name: form.name, content: form.content, agent: form.agent }}
        templateVars={templateVars}
        agents={agents}
        onRun={handleRun}
        onCancel={() => setShowRunModal(false)}
      />

      <ImportPromptsModal
        isOpen={showImportModal}
        onImport={(items) => importMutation.mutate(items)}
        onCancel={() => setShowImportModal(false)}
      />

      <DiscardModal />
    </div>
  );
}
