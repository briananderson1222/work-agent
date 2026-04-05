import { useAgentsQuery, usePromptsQuery } from '@stallion-ai/sdk';
import type { Prompt } from '@stallion-ai/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DetailHeader } from '../components/DetailHeader';
import { ImportPromptsModal } from '../components/ImportPromptsModal';
import { PromptRunModal } from '../components/PromptRunModal';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { Toggle } from '../components/Toggle';
import {
  useCreateChatSession,
  useSendMessage,
} from '../contexts/ActiveChatsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './page-layout.css';
import './editor-layout.css';

interface PromptForm {
  name: string;
  content: string;
  description: string;
  category: string;
  tags: string;
  agent: string;
  global: boolean;
}

const EMPTY_FORM: PromptForm = {
  name: '',
  content: '',
  description: '',
  category: '',
  tags: '',
  agent: '',
  global: false,
};

function promptToForm(p: Prompt): PromptForm {
  return {
    name: p.name,
    content: p.content,
    description: p.description ?? '',
    category: p.category ?? '',
    tags: (p.tags ?? []).join(', '),
    agent: p.agent ?? '',
    global: p.global ?? false,
  };
}

export function PromptsView() {
  const { apiBase } = useApiBase();
  const {
    selectedId: urlId,
    select: urlSelect,
    deselect: urlDeselect,
  } = useUrlSelection('/prompts');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const selectedId = urlId === 'new' ? null : urlId;
  const [isNew, setIsNew] = useState(urlId === 'new');
  const [form, setForm] = useState<PromptForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'category'>('date');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const { data: prompts = [], isLoading } = usePromptsQuery() as {
    data?: Prompt[];
    isLoading: boolean;
  };

  const { data: agents = [] } = useAgentsQuery() as {
    data?: { slug: string; name: string }[];
  };

  const { setDockState, setActiveChat } = useNavigation();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);

  const handleRun = useCallback(
    async (resolvedContent: string, agentSlug: string) => {
      const agent = agents.find((a) => a.slug === agentSlug);
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
      setDockState,
      setActiveChat,
      sendMessage,
      form.name,
    ],
  );

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`${apiBase}/api/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setIsNew(false);
      urlSelect(data.data?.id ?? '');
      setDirty(false);
      showToast('Prompt created');
    },
    onError: () => showToast('Failed to create prompt'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => {
      const res = await fetch(`${apiBase}/api/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setDirty(false);
      showToast('Prompt saved');
    },
    onError: () => showToast('Failed to save prompt'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/api/prompts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      urlDeselect();
      setIsNew(false);
      setDirty(false);
      showToast('Prompt deleted');
    },
    onError: () => showToast('Failed to delete prompt'),
  });

  const categories = useMemo(
    () => [
      ...new Set(prompts.map((p) => p.category).filter(Boolean) as string[]),
    ],
    [prompts],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = prompts.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)),
    );
    return list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category')
        return (a.category ?? '').localeCompare(b.category ?? '');
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [prompts, search, sortBy]);

  const selectedPrompt = prompts.find((p) => p.id === selectedId);

  // Populate form when navigating directly via URL
  useEffect(() => {
    if (selectedPrompt && !isNew && !dirty) {
      setForm(promptToForm(selectedPrompt));
    }
  }, [selectedPrompt?.id, dirty, isNew, selectedPrompt]);

  // Unsaved changes guard
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  function selectPrompt(id: string) {
    guard(() => {
      const p = prompts.find((x) => x.id === id);
      if (!p) return;
      urlSelect(id);
      setIsNew(false);
      setForm(promptToForm(p));
      setDirty(false);
      setTouched({});
      setAdvancedOpen(false);
    });
  }

  function startNew() {
    guard(() => {
      urlDeselect();
      setIsNew(true);
      setForm(EMPTY_FORM);
      setDirty(false);
      setTouched({});
      setAdvancedOpen(false);
    });
  }

  function handleDeselect() {
    urlDeselect();
    setIsNew(false);
  }

  function updateField(field: keyof PromptForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function buildPayload() {
    return {
      name: form.name,
      content: form.content,
      description: form.description || undefined,
      category: form.category || undefined,
      tags: form.tags
        ? form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      agent: form.agent || undefined,
      global: form.global || undefined,
    };
  }

  const importMutation = useMutation({
    mutationFn: async (
      items: { name: string; content: string; description?: string }[],
    ) => {
      const results = await Promise.all(
        items.map((item) =>
          fetch(`${apiBase}/api/prompts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          }).then((r) => r.ok),
        ),
      );
      const count = results.filter(Boolean).length;
      const failed = results.length - count;
      if (failed > 0 && count === 0) throw new Error('All imports failed');
      return { count, failed };
    },
    onSuccess: ({ count, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      setShowImportModal(false);
      showToast(
        failed > 0
          ? `Imported ${count} prompt${count !== 1 ? 's' : ''} (${failed} failed)`
          : `Imported ${count} prompt${count !== 1 ? 's' : ''}`,
      );
    },
    onError: () => showToast('Import failed'),
  });

  function handleSave() {
    if (
      prompts.some((p) => p.name === form.name.trim() && p.id !== selectedId)
    ) {
      showToast('A prompt with this name already exists');
      return;
    }
    if (isNew) {
      createMutation.mutate(buildPayload());
    } else if (selectedId) {
      updateMutation.mutate({ id: selectedId, body: buildPayload() });
    }
  }

  function handleDuplicate() {
    createMutation.mutate({ ...buildPayload(), name: `Copy of ${form.name}` });
  }

  function handleExport() {
    const parts = ['---'];
    parts.push(`name: "${form.name}"`);
    if (form.description) parts.push(`description: "${form.description}"`);
    if (form.category) parts.push(`category: "${form.category}"`);
    parts.push('---', '', form.content);
    const blob = new Blob([parts.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${form.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const { enrich, isEnriching } = useAIEnrich();
  const isEditing = isNew || !!selectedId;

  const templateVars = useMemo(() => {
    const matches = form.content.match(/\{\{([\w.-]+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(2, -2)))];
  }, [form.content]);

  const listItems = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: [p.category, p.tags?.slice(0, 2).join(', ')]
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="prompts"
        title="Prompts"
        subtitle="Reusable prompts for layouts and agents"
        items={listItems}
        loading={isLoading}
        selectedId={isNew ? '__new__' : selectedId}
        onSelect={selectPrompt}
        onDeselect={handleDeselect}
        onSearch={setSearch}
        searchPlaceholder="Search prompts..."
        onAdd={startNew}
        addLabel="+ New Prompt"
        emptyIcon="⌘"
        emptyTitle="No prompt selected"
        emptyDescription="Select a prompt or create a new one"
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
          <div className="prompt-editor">
            <DetailHeader
              title={isNew ? 'New Prompt' : form.name || 'Edit Prompt'}
              badge={
                dirty
                  ? { label: 'unsaved', variant: 'warning' as const }
                  : undefined
              }
            >
              {!isNew && selectedId && (
                <button
                  className="editor-btn editor-btn--danger"
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete
                </button>
              )}
              {!isNew && selectedId && (
                <button className="editor-btn" onClick={handleDuplicate}>
                  Duplicate
                </button>
              )}
              {!isNew && selectedId && (
                <button className="editor-btn" onClick={handleExport}>
                  Export .md
                </button>
              )}
              {!isNew && selectedId && (
                <button
                  className="editor-btn"
                  onClick={() => setShowRunModal(true)}
                  disabled={!form.content.trim()}
                >
                  ▶ Test
                </button>
              )}
              {isNew && (
                <button
                  className="editor-btn"
                  disabled
                  title="Save prompt first"
                >
                  ▶ Test
                </button>
              )}
              <button
                className="editor-btn editor-btn--primary"
                onClick={handleSave}
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  !form.name.trim() ||
                  !form.content.trim()
                }
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving…'
                  : isNew
                    ? 'Create'
                    : 'Save'}
              </button>
            </DetailHeader>
            {/* Basic section */}
            <div className="editor__section">
              <div className="editor-field">
                <label className="editor-label">Name</label>
                <input
                  type="text"
                  className="editor-input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="Prompt name"
                />
                {touched.name && !form.name.trim() && (
                  <div className="editor-error">Name is required</div>
                )}
              </div>

              <div className="editor-field">
                <div className="editor-label-row">
                  <span className="editor-label">Content *</span>
                  <button
                    type="button"
                    className="editor-enrich-btn"
                    disabled={isEnriching || !form.name}
                    onClick={async () => {
                      const text = await enrich(
                        `Write a reusable prompt template named "${form.name}"${form.description ? ` for: ${form.description}` : ''}${form.category ? ` (category: ${form.category})` : ''}. Include {{variable}} placeholders where the user should fill in context. Output only the prompt text.`,
                      );
                      if (text) updateField('content', text);
                    }}
                  >
                    {isEnriching ? '...' : '✨ Generate'}
                  </button>
                </div>
                <textarea
                  className="editor-textarea editor-textarea--tall editor-textarea--mono"
                  value={form.content}
                  onChange={(e) => updateField('content', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, content: true }))}
                  placeholder="Write your prompt here..."
                  spellCheck={false}
                />
                {touched.content && !form.content.trim() && (
                  <div className="editor-error">Content is required</div>
                )}
                {templateVars.length > 0 && (
                  <div className="editor__tags">
                    <span className="editor-label editor-label--inline">
                      Variables:
                    </span>
                    {templateVars.map((v) => (
                      <span key={v} className="editor__tag">{`{{${v}}}`}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="editor-field">
                <div className="editor-label-row">
                  <span className="editor-label">Description</span>
                  <button
                    type="button"
                    className="editor-enrich-btn"
                    disabled={isEnriching || !form.name}
                    onClick={async () => {
                      const text = await enrich(
                        `Write a brief one-sentence description for a prompt named "${form.name}" with this content: ${form.content.slice(0, 200)}`,
                      );
                      if (text) updateField('description', text);
                    }}
                  >
                    {isEnriching ? '...' : '✨ Generate'}
                  </button>
                </div>
                <textarea
                  className="editor-textarea"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="editor-field editor-field--row">
                <Toggle
                  checked={form.global}
                  onChange={(v) => {
                    setForm((f) => ({ ...f, global: v }));
                    setDirty(true);
                  }}
                  size="sm"
                />
                <span className="editor-label">
                  Available as slash command for all agents
                </span>
              </div>
            </div>

            {/* Advanced section */}
            <div className="editor__section">
              <details
                className="editor__expandable"
                open={advancedOpen}
                onToggle={(e) =>
                  setAdvancedOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary className="editor__expandable-header">
                  <span className="editor__section-title">Advanced</span>
                </summary>
                <div className="editor__expandable-content">
                  <div className="editor-field">
                    <label className="editor-label">Category</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={form.category}
                      onChange={(e) => updateField('category', e.target.value)}
                      placeholder="e.g. coding, writing, analysis"
                      list="prompt-categories"
                    />
                    <datalist id="prompt-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="editor-field">
                    <label className="editor-label">Tags</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={form.tags}
                      onChange={(e) => updateField('tags', e.target.value)}
                      placeholder="comma-separated tags"
                    />
                  </div>
                  {form.tags && (
                    <div className="editor__tags">
                      {form.tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map((t) => (
                          <span key={t} className="editor__tag">
                            {t}
                          </span>
                        ))}
                    </div>
                  )}

                  <div className="editor-field">
                    <label className="editor-label">Agent</label>
                    <select
                      className="editor-select"
                      value={form.agent}
                      onChange={(e) => updateField('agent', e.target.value)}
                    >
                      <option value="">— none —</option>
                      {agents.map((a) => (
                        <option key={a.slug} value={a.slug}>
                          {a.name || a.slug}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>
            </div>

            {/* Footer */}
            <div className="editor__footer">
              {selectedPrompt && (
                <div className="prompt-editor__timestamps">
                  <span>
                    created{' '}
                    {new Date(selectedPrompt.createdAt).toLocaleDateString()}
                  </span>
                  <span>·</span>
                  <span>
                    updated{' '}
                    {new Date(selectedPrompt.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Prompt"
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
