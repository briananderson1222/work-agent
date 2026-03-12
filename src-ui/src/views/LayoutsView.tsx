import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { LayoutIcon } from '../components/LayoutIcon';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useAIEnrich } from '../hooks/useAIEnrich';
import { useUrlSelection } from '../hooks/useUrlSelection';
import type {
  AgentSummary,
  LayoutPrompt,
  LayoutTab,
  StandaloneLayoutConfig,
} from '../types';
import './page-layout.css';
import './editor-layout.css';

const TAB_COMPONENTS = ['chat', 'canvas', 'custom'] as const;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const EMPTY_FORM: StandaloneLayoutConfig = {
  name: '',
  slug: '',
  icon: '',
  description: '',
  tabs: [{ id: 'main', label: 'Main', component: 'chat' }],
  globalPrompts: [],
};

export function LayoutsView() {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const {
    selectedId: urlSlug,
    select: urlSelect,
    deselect: urlDeselect,
  } = useUrlSelection('/layouts');
  const qc = useQueryClient();
  const { enrich, isEnriching } = useAIEnrich();

  const selectedSlug = urlSlug === 'new' ? null : urlSlug;
  const [isNew, setIsNew] = useState(urlSlug === 'new');
  const [templatePicked, setTemplatePicked] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<StandaloneLayoutConfig>(EMPTY_FORM);
  const [savedForm, setSavedForm] =
    useState<StandaloneLayoutConfig>(EMPTY_FORM);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedTabs, setExpandedTabs] = useState<Set<number>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(
    new Set(),
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch layout list
  const { data: layouts = [], isLoading } = useQuery<StandaloneLayoutConfig[]>({
    queryKey: ['layouts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/layouts`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  // Fetch layout templates
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'layout'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/templates?type=layout`);
      const json = await res.json();
      return json.data || [];
    },
  });

  // Fetch agents for prompt dropdowns
  const { data: agents = [] } = useQuery<AgentSummary[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/agents`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  // Fetch single layout when selected
  const { data: layoutDetail } = useQuery<StandaloneLayoutConfig>({
    queryKey: ['layout', selectedSlug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/layouts/${selectedSlug}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!selectedSlug && !isNew,
  });

  useEffect(() => {
    if (layoutDetail) {
      setForm(layoutDetail);
      setSavedForm(layoutDetail);
      setExpandedTabs(new Set());
      setExpandedPrompts(new Set());
    }
  }, [layoutDetail]);

  const saveMutation = useMutation({
    mutationFn: async (data: StandaloneLayoutConfig) => {
      const url = isNew
        ? `${apiBase}/layouts`
        : `${apiBase}/layouts/${selectedSlug}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return json.data as StandaloneLayoutConfig;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['layouts'] });
      qc.invalidateQueries({ queryKey: ['layout', saved.slug] });
      setSavedForm(saved);
      setForm(saved);
      setIsNew(false);
      urlSelect(saved.slug);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/layouts/${selectedSlug}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layouts'] });
      navigate('/layouts');
      urlDeselect();
      setIsNew(false);
      setForm(EMPTY_FORM);
      setSavedForm(EMPTY_FORM);
    },
    onError: (err: Error) => setError(err.message),
  });

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const filtered = useMemo(
    () =>
      layouts.filter(
        (w) =>
          w.name.toLowerCase().includes(search.toLowerCase()) ||
          w.slug.toLowerCase().includes(search.toLowerCase()),
      ),
    [layouts, search],
  );

  const listItems = filtered.map((w) => ({
    id: w.slug,
    name: w.name,
    subtitle: (w as any).plugin ? (w as any).plugin : undefined,
    icon: <LayoutIcon layout={w} size={28} />,
  }));

  function handleSelect(slug: string) {
    urlSelect(slug);
    setIsNew(false);
    setError(null);
    setAdvancedOpen(false);
  }

  function handleNew() {
    urlSelect('new');
    setIsNew(true);
    setTemplatePicked(layouts.length === 0);
    setForm(EMPTY_FORM);
    setSavedForm(EMPTY_FORM);
    setExpandedTabs(new Set());
    setExpandedPrompts(new Set());
    setError(null);
    setAdvancedOpen(false);
  }

  function handleDeselect() {
    urlDeselect();
    setIsNew(false);
    setError(null);
  }

  // Tab helpers
  function setTabs(tabs: LayoutTab[]) {
    setForm((f) => ({ ...f, tabs }));
  }

  function addTab() {
    const tab: LayoutTab = {
      id: `tab-${Date.now()}`,
      label: 'New Tab',
      component: 'chat',
    };
    setForm((f) => ({ ...f, tabs: [...f.tabs, tab] }));
    setExpandedTabs((prev) => new Set([...prev, form.tabs.length]));
  }

  function updateTab(i: number, updates: Partial<LayoutTab>) {
    setForm((f) => ({
      ...f,
      tabs: f.tabs.map((t, idx) => (idx === i ? { ...t, ...updates } : t)),
    }));
  }

  function removeTab(i: number) {
    setForm((f) => ({ ...f, tabs: f.tabs.filter((_, idx) => idx !== i) }));
  }

  function moveTab(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.tabs.length) return;
    setForm((f) => {
      const tabs = [...f.tabs];
      [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
      return { ...f, tabs };
    });
  }

  // Prompt helpers
  function addPrompt() {
    const p: LayoutPrompt = { id: `p-${Date.now()}`, label: '', prompt: '' };
    setForm((f) => ({ ...f, globalPrompts: [...(f.globalPrompts ?? []), p] }));
  }

  function updatePrompt(i: number, updates: Partial<LayoutPrompt>) {
    setForm((f) => ({
      ...f,
      globalPrompts: (f.globalPrompts ?? []).map((p, idx) =>
        idx === i ? { ...p, ...updates } : p,
      ),
    }));
  }

  function removePrompt(i: number) {
    setForm((f) => ({
      ...f,
      globalPrompts: (f.globalPrompts ?? []).filter((_, idx) => idx !== i),
    }));
  }

  function togglePrompt(key: string) {
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleTab(i: number) {
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const showEditor =
    isNew || (!!selectedSlug && selectedSlug !== '__new__' && !!layoutDetail);

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="layouts"
        title="Layouts"
        subtitle="Manage layout configurations and tabs"
        items={listItems}
        loading={isLoading}
        selectedId={selectedSlug}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
        onSearch={setSearch}
        searchPlaceholder="Search layouts..."
        onAdd={handleNew}
        addLabel="+ New Layout"
        emptyIcon="🗂️"
        emptyTitle="No layout selected"
        emptyDescription="Select a layout to edit or create a new one"
        emptyContent={
          layouts.length === 0 ? (
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
                Create your first layout from a template
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
                        if (t.tabs) setTabs(t.tabs);
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
        {showEditor && (
          <div className="workspace-editor">
            {/* Header */}
            <div className="workspace-editor__header">
              <div>
                <div className="workspace-editor__title">
                  {isNew ? 'New Layout' : form.name}
                  {isDirty && (
                    <span className="workspace-editor__dirty">●</span>
                  )}
                </div>
              </div>
              <div className="workspace-editor__header-actions">
                {!isNew && (
                  <button
                    className="editor-btn editor-btn--danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </button>
                )}
                <button
                  className="editor-btn editor-btn--primary"
                  disabled={saveMutation.isPending || !form.name || !form.slug}
                  onClick={() => saveMutation.mutate(form)}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {error && <div className="workspace-editor__error">{error}</div>}

            <div className="workspace-editor__body">
              {isNew && !templatePicked && layouts.length > 0 ? (
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
                          setForm((f) => ({
                            ...f,
                            ...t.form,
                            tabs: t.tabs as LayoutTab[],
                          }));
                          setSavedForm((f) => ({
                            ...f,
                            ...t.form,
                            tabs: t.tabs as LayoutTab[],
                          }));
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
                  {/* ── Basic Section ── */}
                  <section className="workspace-editor__section">
                    <div className="editor-field">
                      <span className="editor-label">Name *</span>
                      <input
                        className="editor-input"
                        type="text"
                        value={form.name}
                        placeholder="My Layout"
                        onChange={(e) => {
                          const name = e.target.value;
                          setForm((f) => ({
                            ...f,
                            name,
                            slug: isNew ? slugify(name) : f.slug,
                          }));
                        }}
                      />
                    </div>

                    <div className="editor-field">
                      <span className="editor-label">
                        Slug *{' '}
                        <span className="editor-hint">
                          (URL-safe, set on create)
                        </span>
                      </span>
                      <input
                        className="editor-input"
                        type="text"
                        value={form.slug}
                        placeholder="my-layout"
                        disabled={!isNew}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, '-'),
                          }))
                        }
                      />
                    </div>

                    <div className="editor-field">
                      <span className="editor-label">Icon</span>
                      <div className="editor-icon-row">
                        <LayoutIcon
                          layout={{ name: form.name || 'L', icon: form.icon }}
                          size={40}
                        />
                        <input
                          className="editor-input"
                          type="text"
                          value={form.icon ?? ''}
                          placeholder="Emoji or leave empty for initials"
                          onChange={(e) =>
                            setForm((f) => ({ ...f, icon: e.target.value }))
                          }
                        />
                      </div>
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
                              `Write a brief one-sentence description for a layout named "${form.name}".`,
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
                      <textarea
                        className="editor-textarea"
                        value={form.description ?? ''}
                        placeholder="A brief description of this layout"
                        rows={2}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </section>

                  {/* ── Tabs Section ── */}
                  <section className="workspace-editor__section">
                    <div className="workspace-editor__section-header">
                      <span className="workspace-editor__section-title">
                        Tabs
                      </span>
                      <button
                        className="workspace-editor__add-btn"
                        onClick={addTab}
                      >
                        + Add Tab
                      </button>
                    </div>

                    <div className="workspace-editor__list">
                      {form.tabs.map((tab, i) => {
                        const open = expandedTabs.has(i);
                        return (
                          <div key={tab.id} className="workspace-editor__item">
                            <div
                              className="workspace-editor__item-header"
                              onClick={() => toggleTab(i)}
                            >
                              <span className="workspace-editor__item-name">
                                {tab.label || 'Untitled Tab'}
                              </span>
                              <span className="workspace-editor__item-meta">
                                {tab.component}
                              </span>
                              <div
                                className="workspace-editor__item-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => moveTab(i, -1)}
                                  disabled={i === 0}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveTab(i, 1)}
                                  disabled={i === form.tabs.length - 1}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                {form.tabs.length > 1 && (
                                  <button
                                    className="workspace-editor__remove-btn"
                                    onClick={() => removeTab(i)}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <span className="workspace-editor__chevron">
                                {open ? '▼' : '▶'}
                              </span>
                            </div>
                            {open && (
                              <div className="workspace-editor__item-body">
                                <div className="workspace-editor__tab-grid">
                                  <div className="editor-field">
                                    <span className="editor-label">ID</span>
                                    <input
                                      className="editor-input"
                                      type="text"
                                      value={tab.id}
                                      onChange={(e) =>
                                        updateTab(i, { id: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="editor-field">
                                    <span className="editor-label">Label</span>
                                    <input
                                      className="editor-input"
                                      type="text"
                                      value={tab.label}
                                      onChange={(e) =>
                                        updateTab(i, { label: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="editor-field">
                                    <span className="editor-label">
                                      Component
                                    </span>
                                    <select
                                      className="editor-select"
                                      value={tab.component}
                                      onChange={(e) =>
                                        updateTab(i, {
                                          component: e.target.value,
                                        })
                                      }
                                    >
                                      {TAB_COMPONENTS.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* ── Advanced Section ── */}
                  <section className="workspace-editor__section workspace-editor__section--advanced">
                    <button
                      className="workspace-editor__advanced-toggle"
                      onClick={() => setAdvancedOpen((o) => !o)}
                    >
                      <span>Advanced</span>
                      <span className="workspace-editor__chevron">
                        {advancedOpen ? '▼' : '▶'}
                      </span>
                    </button>

                    {advancedOpen && (
                      <div className="workspace-editor__advanced-body">
                        <div className="workspace-editor__section-header">
                          <span className="workspace-editor__section-title">
                            Global Prompts
                          </span>
                          <button
                            className="workspace-editor__add-btn"
                            onClick={addPrompt}
                          >
                            + Add Prompt
                          </button>
                        </div>

                        {(form.globalPrompts ?? []).length === 0 ? (
                          <div className="workspace-editor__empty-hint">
                            No global prompts. Add one to make it available
                            across all tabs.
                          </div>
                        ) : (
                          <div className="workspace-editor__list">
                            {(form.globalPrompts ?? []).map((p, i) => {
                              const key = `gp-${i}`;
                              const open = expandedPrompts.has(key);
                              const agentName = agents.find(
                                (a) => a.slug === p.agent,
                              )?.name;
                              return (
                                <div
                                  key={p.id}
                                  className="workspace-editor__item"
                                >
                                  <div
                                    className="workspace-editor__item-header"
                                    onClick={() => togglePrompt(key)}
                                  >
                                    <span className="workspace-editor__item-name">
                                      {p.label || 'Untitled Prompt'}
                                    </span>
                                    {agentName && (
                                      <span className="workspace-editor__item-meta">
                                        → {agentName}
                                      </span>
                                    )}
                                    <div
                                      className="workspace-editor__item-actions"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        className="workspace-editor__remove-btn"
                                        onClick={() => removePrompt(i)}
                                      >
                                        ×
                                      </button>
                                    </div>
                                    <span className="workspace-editor__chevron">
                                      {open ? '▼' : '▶'}
                                    </span>
                                  </div>
                                  {open && (
                                    <div className="workspace-editor__item-body">
                                      <div className="workspace-editor__prompt-grid">
                                        <input
                                          className="editor-input"
                                          type="text"
                                          placeholder="Label"
                                          value={p.label}
                                          onChange={(e) =>
                                            updatePrompt(i, {
                                              label: e.target.value,
                                            })
                                          }
                                        />
                                        <select
                                          className="editor-select"
                                          value={p.agent ?? ''}
                                          onChange={(e) =>
                                            updatePrompt(i, {
                                              agent:
                                                e.target.value || undefined,
                                            })
                                          }
                                        >
                                          <option value="">No agent</option>
                                          {agents.map((a) => (
                                            <option key={a.slug} value={a.slug}>
                                              {a.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <textarea
                                        className="editor-textarea"
                                        placeholder="Prompt text"
                                        value={p.prompt}
                                        rows={3}
                                        onChange={(e) =>
                                          updatePrompt(i, {
                                            prompt: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </SplitPaneLayout>

      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete Layout"
        message={`Delete "${form.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setDeleteOpen(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
