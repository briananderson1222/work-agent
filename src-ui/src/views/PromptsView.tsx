import { useState, useMemo } from 'react';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { ConfirmModal } from '../components/ConfirmModal';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import './page-layout.css';
import './editor-layout.css';

interface Prompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptForm {
  name: string;
  content: string;
  description: string;
  category: string;
  tags: string;
  agent: string;
}

const EMPTY_FORM: PromptForm = { name: '', content: '', description: '', category: '', tags: '', agent: '' };

function promptToForm(p: Prompt): PromptForm {
  return {
    name: p.name,
    content: p.content,
    description: p.description ?? '',
    category: p.category ?? '',
    tags: (p.tags ?? []).join(', '),
    agent: p.agent ?? '',
  };
}

export function PromptsView() {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const { selectedId: urlId, select: urlSelect, deselect: urlDeselect } = useUrlSelection('/prompts');
  const queryClient = useQueryClient();

  const selectedId = urlId === 'new' ? null : urlId;
  const [isNew, setIsNew] = useState(urlId === 'new');
  const [form, setForm] = useState<PromptForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: prompts = [] } = useQuery<Prompt[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/prompts`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const { data: agents = [] } = useQuery<{ slug: string; name: string }[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/agents`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

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
      urlSelect(data.data?.id ?? "");
      setDirty(false);
    },
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
    },
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
    },
  });

  const categories = useMemo(
    () => [...new Set(prompts.map(p => p.category).filter(Boolean) as string[])],
    [prompts],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prompts.filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.tags?.some(t => t.toLowerCase().includes(q)),
    );
  }, [prompts, search]);

  const selectedPrompt = prompts.find(p => p.id === selectedId);

  function selectPrompt(id: string) {
    const p = prompts.find(x => x.id === id);
    if (!p) return;
    urlSelect(id);
    setIsNew(false);
    setForm(promptToForm(p));
    setDirty(false);
    setAdvancedOpen(false);
  }

  function startNew() {
    urlDeselect();
    setIsNew(true);
    setForm(EMPTY_FORM);
    setDirty(false);
    setAdvancedOpen(false);
  }

  function handleDeselect() {
    urlDeselect();
    setIsNew(false);
  }

  function updateField(field: keyof PromptForm, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function buildPayload() {
    return {
      name: form.name,
      content: form.content,
      description: form.description || undefined,
      category: form.category || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      agent: form.agent || undefined,
    };
  }

  function handleSave() {
    if (isNew) {
      createMutation.mutate(buildPayload());
    } else if (selectedId) {
      updateMutation.mutate({ id: selectedId, body: buildPayload() });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const { enrich, isEnriching } = useAIEnrich();
  const isEditing = isNew || !!selectedId;

  const listItems = filtered.map(p => ({
    id: p.id,
    name: p.name,
    subtitle: [p.category, p.tags?.slice(0, 2).join(', ')].filter(Boolean).join(' · '),
  }));

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="prompts"
        title="Prompts"
        subtitle="Reusable prompts for workspaces and agents"
        items={listItems}
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
      >
        {isEditing && (
          <div className="prompt-editor">
            {/* Basic section */}
            <div className="editor__section">
              <div className="editor__section-header">
                <span className="editor__section-title">
                  {isNew ? 'New Prompt' : (form.name || 'Edit Prompt')}
                </span>
                {dirty && <span className="prompt-editor__unsaved">unsaved changes</span>}
              </div>

              <div className="editor-field">
                <label className="editor-label">Name</label>
                <input
                  type="text"
                  className="editor-input"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Prompt name"
                />
              </div>

              <div className="editor-field">
                <div className="editor-label-row">
                  <span className="editor-label">Content *</span>
                  <button
                    type="button"
                    className="editor-enrich-btn"
                    disabled={isEnriching || !form.name}
                    onClick={async () => {
                      const text = await enrich(`Write a reusable prompt template named "${form.name}"${form.description ? ` for: ${form.description}` : ''}. Output only the prompt text, no explanation.`);
                      if (text) updateField('content', text);
                    }}
                  >
                    {isEnriching ? '...' : '✨ Generate'}
                  </button>
                </div>
                <textarea
                  className="editor-textarea editor-textarea--tall editor-textarea--mono"
                  value={form.content}
                  onChange={e => updateField('content', e.target.value)}
                  placeholder="Write your prompt here..."
                  spellCheck={false}
                />
              </div>

              <div className="editor-field">
                <div className="editor-label-row">
                  <span className="editor-label">Description</span>
                  <button
                    type="button"
                    className="editor-enrich-btn"
                    disabled={isEnriching || !form.name}
                    onClick={async () => {
                      const text = await enrich(`Write a brief one-sentence description for a prompt named "${form.name}" with this content: ${form.content.slice(0, 200)}`);
                      if (text) updateField('description', text);
                    }}
                  >
                    {isEnriching ? '...' : '✨ Generate'}
                  </button>
                </div>
                <textarea
                  className="editor-textarea"
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            {/* Advanced section */}
            <div className="editor__section">
              <details
                className="editor__expandable"
                open={advancedOpen}
                onToggle={e => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
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
                      onChange={e => updateField('category', e.target.value)}
                      placeholder="e.g. coding, writing, analysis"
                      list="prompt-categories"
                    />
                    <datalist id="prompt-categories">
                      {categories.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>

                  <div className="editor-field">
                    <label className="editor-label">Tags</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={form.tags}
                      onChange={e => updateField('tags', e.target.value)}
                      placeholder="comma-separated tags"
                    />
                  </div>
                  {form.tags && (
                    <div className="editor__tags" style={{ marginTop: 8 }}>
                      {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} className="editor__tag">{t}</span>
                      ))}
                    </div>
                  )}

                  <div className="editor-field">
                    <label className="editor-label">Agent</label>
                    <select
                      className="editor-select"
                      value={form.agent}
                      onChange={e => updateField('agent', e.target.value)}
                    >
                      <option value="">— none —</option>
                      {agents.map((a: any) => (
                        <option key={a.slug} value={a.slug}>{a.name || a.slug}</option>
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
                  <span>created {new Date(selectedPrompt.createdAt).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>updated {new Date(selectedPrompt.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div style={{ flex: 1 }} />
              {!isNew && selectedId && (
                <button
                  className="editor-btn editor-btn--danger"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isSaving}
                >
                  Delete
                </button>
              )}
              <button
                className="editor-btn editor-btn--primary"
                onClick={handleSave}
                disabled={isSaving || !form.name || !form.content}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </SplitPaneLayout>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Prompt"
        message={`Delete "${selectedPrompt?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteModal(false);
          if (selectedId) deleteMutation.mutate(selectedId);
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
