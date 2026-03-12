import type { ProviderConnectionConfig } from '@stallion-ai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectConfig } from '../contexts/ProjectsContext';
import './page-layout.css';
import './editor-layout.css';

interface ProjectDirectory {
  id: string;
  path: string;
  label: string;
  role: 'primary' | 'reference';
}

type ProjectForm = Pick<
  ProjectConfig,
  'name' | 'icon' | 'description' | 'defaultProviderId' | 'defaultModel'
> & {
  directories: ProjectDirectory[];
};

export function ProjectSettingsView({ slug }: { slug: string }) {
  const { apiBase } = useApiBase();
  const { navigate } = useNavigation();
  const qc = useQueryClient();

  const [form, setForm] = useState<ProjectForm | null>(null);
  const [savedForm, setSavedForm] = useState<ProjectForm | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: project, isLoading } = useQuery<ProjectConfig>({
    queryKey: ['projects', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    enabled: !!slug,
  });

  const { data: providers = [] } = useQuery<ProviderConnectionConfig[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/providers`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const selectedProviderId = form?.defaultProviderId ?? '';

  const { data: providerModels = [] } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ['provider-models', selectedProviderId],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/providers/${selectedProviderId}/models`,
      );
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!selectedProviderId,
  });

  useEffect(() => {
    if (project) {
      const f: ProjectForm = {
        name: project.name,
        icon: project.icon ?? '',
        description: project.description ?? '',
        defaultProviderId: project.defaultProviderId ?? '',
        defaultModel: project.defaultModel ?? '',
        directories: (project.directories ?? []) as ProjectDirectory[],
      };
      setForm(f);
      setSavedForm(f);
    }
  }, [project]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProjectForm) => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return json.data as ProjectConfig;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', slug] });
      const f: ProjectForm = {
        name: saved.name,
        icon: saved.icon ?? '',
        description: saved.description ?? '',
        defaultProviderId: saved.defaultProviderId ?? '',
        defaultModel: saved.defaultModel ?? '',
        directories: (saved.directories ?? []) as ProjectDirectory[],
      };
      setSavedForm(f);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/');
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading || !form) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}
      >
        Loading…
      </div>
    );
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  function setField<K extends keyof ProjectForm>(
    key: K,
    value: ProjectForm[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function addDirectory() {
    const dir: ProjectDirectory = {
      id: crypto.randomUUID(),
      path: '',
      label: '',
      role: 'primary',
    };
    setForm((f) => (f ? { ...f, directories: [...f.directories, dir] } : f));
  }

  function updateDirectory(id: string, updates: Partial<ProjectDirectory>) {
    setForm((f) =>
      f
        ? {
            ...f,
            directories: f.directories.map((d) =>
              d.id === id ? { ...d, ...updates } : d,
            ),
          }
        : f,
    );
  }

  function removeDirectory(id: string) {
    setForm((f) =>
      f ? { ...f, directories: f.directories.filter((d) => d.id !== id) } : f,
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {form.icon || project?.icon} {form.name}
          {isDirty && (
            <span style={{ color: 'var(--accent-primary)', fontSize: '10px' }}>
              ●
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="editor-btn editor-btn--danger"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </button>
          <button
            className="editor-btn editor-btn--primary"
            disabled={saveMutation.isPending || !form.name}
            onClick={() => saveMutation.mutate(form)}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            margin: '12px 24px',
            padding: '10px 14px',
            background: 'var(--error-bg)',
            border: '1px solid var(--error-border)',
            borderRadius: '6px',
            color: 'var(--error-text)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Basic Info */}
        <section
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
            }}
          >
            Basic Info
          </div>

          <div className="editor-field">
            <label className="editor-label">Name *</label>
            <input
              className="editor-input"
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>
          <div className="editor-field">
            <label className="editor-label">
              Icon{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                (emoji)
              </span>
            </label>
            <input
              className="editor-input"
              type="text"
              value={form.icon ?? ''}
              placeholder="🚀"
              onChange={(e) => setField('icon', e.target.value)}
            />
          </div>
          <div className="editor-field">
            <label className="editor-label">Description</label>
            <textarea
              className="editor-textarea"
              value={form.description ?? ''}
              rows={2}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>
        </section>

        {/* Directories */}
        <section
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Directories
            </span>
            <button
              className="workspace-editor__add-btn"
              onClick={addDirectory}
            >
              + Add
            </button>
          </div>

          {form.directories.length === 0 ? (
            <div
              style={{
                padding: '16px',
                border: '1px dashed var(--border-primary)',
                borderRadius: '6px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              No directories. Add one to index files for this project.
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {form.directories.map((dir) => (
                <div
                  key={dir.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                  }}
                >
                  <input
                    className="editor-input"
                    type="text"
                    value={dir.path}
                    placeholder="/path/to/dir"
                    style={{ margin: 0 }}
                    onChange={(e) =>
                      updateDirectory(dir.id, {
                        path: e.target.value,
                        label:
                          dir.label ||
                          e.target.value.split('/').filter(Boolean).pop() ||
                          '',
                      })
                    }
                  />
                  <input
                    className="editor-input"
                    type="text"
                    value={dir.label}
                    placeholder="Label"
                    style={{ margin: 0, maxWidth: '120px' }}
                    onChange={(e) =>
                      updateDirectory(dir.id, { label: e.target.value })
                    }
                  />
                  <select
                    className="editor-select"
                    value={dir.role}
                    style={{ margin: 0, maxWidth: '110px' }}
                    onChange={(e) =>
                      updateDirectory(dir.id, {
                        role: e.target.value as 'primary' | 'reference',
                      })
                    }
                  >
                    <option value="primary">primary</option>
                    <option value="reference">reference</option>
                  </select>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--error-text)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '0 4px',
                    }}
                    onClick={() => removeDirectory(dir.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Model */}
        <section
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '16px',
            }}
          >
            Model
          </div>
          <div className="editor-field">
            <label className="editor-label">Default Provider</label>
            <select
              className="editor-select"
              value={form.defaultProviderId ?? ''}
              onChange={(e) => {
                setField('defaultProviderId', e.target.value);
                setField('defaultModel', '');
              }}
            >
              <option value="">System Default</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label className="editor-label">Default Model</label>
            {selectedProviderId ? (
              <select
                className="editor-select"
                value={form.defaultModel ?? ''}
                onChange={(e) => setField('defaultModel', e.target.value)}
              >
                <option value="">— select model —</option>
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="editor-input"
                type="text"
                value={form.defaultModel ?? ''}
                placeholder="e.g. gpt-4o"
                onChange={(e) => setField('defaultModel', e.target.value)}
              />
            )}
          </div>
        </section>

        {/* Layouts — list + save as template */}
        <LayoutsSection slug={slug} apiBase={apiBase} />

        {/* Knowledge */}
        <KnowledgeSection slug={slug} apiBase={apiBase} />

        {/* Danger Zone */}
        <section style={{ padding: '20px 24px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--error-text)',
              marginBottom: '12px',
            }}
          >
            Danger Zone
          </div>
          <button
            className="editor-btn editor-btn--danger"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Project
          </button>
        </section>
      </div>

      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete Project"
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

function LayoutsSection({ slug, apiBase }: { slug: string; apiBase: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [available, setAvailable] = useState<
    Array<{
      source: string;
      plugin?: string;
      name: string;
      slug: string;
      icon?: string;
      description?: string;
      type: string;
    }>
  >([]);
  const [adding, setAdding] = useState<string | null>(null);

  const { data: layouts = [] } = useQuery<
    Array<{
      id: string;
      slug: string;
      name: string;
      icon?: string;
      type: string;
      config?: Record<string, unknown>;
    }>
  >({
    queryKey: ['projects', slug, 'layouts'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}/layouts`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (layoutSlug: string) => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/layouts/${layoutSlug}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['projects', slug, 'layouts'] }),
  });

  useEffect(() => {
    if (!showAdd) return;
    fetch(`${apiBase}/api/projects/layouts/available`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAvailable(d.data ?? []);
      })
      .catch(() => {});
  }, [showAdd, apiBase]);

  async function addLayout(item: (typeof available)[0]) {
    setAdding(item.slug);
    try {
      if (item.source === 'plugin' && item.plugin) {
        await fetch(`${apiBase}/api/projects/${slug}/layouts/from-plugin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: item.plugin }),
        });
      } else {
        await fetch(`${apiBase}/api/projects/${slug}/layouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: item.type,
            name: item.name,
            slug: `${item.slug}-${Date.now().toString(36)}`,
            icon: item.icon,
            config: {},
          }),
        });
      }
      qc.invalidateQueries({ queryKey: ['projects', slug, 'layouts'] });
      setShowAdd(false);
    } catch {
      /* ignore */
    }
    setAdding(null);
  }

  return (
    <section className="knowledge-section">
      <div className="knowledge-section__header">
        <h3 className="knowledge-section__title">📐 Layouts</h3>
        <button
          className="knowledge-section__action-btn"
          onClick={() => setShowAdd(true)}
        >
          + Add Layout
        </button>
      </div>

      {layouts.length > 0 ? (
        <div className="knowledge-section__doc-list">
          {layouts.map((layout) => (
            <div key={layout.id} className="knowledge-section__doc">
              <span className="knowledge-section__doc-name">
                {layout.icon && `${layout.icon} `}
                {layout.name}
              </span>
              <span className="knowledge-section__badge">{layout.type}</span>
              <button
                className="knowledge-section__doc-remove"
                onClick={() => removeMutation.mutate(layout.slug)}
                title="Remove layout"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="knowledge-section__empty">
          No layouts. Click "+ Add Layout" to get started.
        </p>
      )}

      {showAdd && (
        <div
          className="project-dashboard__modal-overlay"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="project-dashboard__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="knowledge-section__title">Add Layout</h3>
            <div
              className="knowledge-section__doc-list"
              style={{ marginTop: '12px' }}
            >
              {available.map((item) => (
                <button
                  key={`${item.source}-${item.slug}`}
                  className="project-dashboard__layout-btn"
                  disabled={adding === item.slug}
                  onClick={() => addLayout(item)}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="knowledge-section__source-name">
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="knowledge-section__source-path">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span className="knowledge-section__badge">
                    {item.source === 'plugin' ? item.plugin : item.type}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                className="knowledge-section__action-btn"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface DocMeta {
  id: string;
  filename: string;
  chunkCount: number;
  createdAt: string;
}
interface KnowledgeStatus {
  provider: string;
  documentCount: number;
  totalChunks: number;
  lastIndexed: string | null;
}

function KnowledgeSection({
  slug,
  apiBase,
}: {
  slug: string;
  apiBase: string;
}) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    indexed: number;
    skipped: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useQuery<DocMeta[]>({
    queryKey: ['knowledge', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}/knowledge`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const { data: status } = useQuery<KnowledgeStatus>({
    queryKey: ['knowledge-status', slug],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/status`,
      );
      const json = await res.json();
      return json.success ? json.data : null;
    },
  });

  const { data: project } = useQuery<any>({
    queryKey: ['projects', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`);
      const json = await res.json();
      return json.success ? json.data : null;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/${docId}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', slug] });
      qc.invalidateQueries({ queryKey: ['knowledge-status', slug] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}/knowledge`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', slug] });
      qc.invalidateQueries({ queryKey: ['knowledge-status', slug] });
    },
  });

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/scan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const json = await res.json();
      if (json.success) setScanResult(json.data);
      qc.invalidateQueries({ queryKey: ['knowledge', slug] });
      qc.invalidateQueries({ queryKey: ['knowledge-status', slug] });
    } catch {
      /* ignore */
    }
    setScanning(false);
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        await fetch(`${apiBase}/api/projects/${slug}/knowledge/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
      } catch {
        /* skip */
      }
    }
    qc.invalidateQueries({ queryKey: ['knowledge', slug] });
    qc.invalidateQueries({ queryKey: ['knowledge-status', slug] });
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  const directories = project?.directories ?? [];
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <section className="knowledge-section">
      <div className="knowledge-section__header">
        <h3 className="knowledge-section__title">📚 Knowledge Base</h3>
        {status && (
          <span className="knowledge-section__stat">
            {status.totalChunks} chunks · {status.documentCount} docs
            {status.lastIndexed && ` · indexed ${timeAgo(status.lastIndexed)}`}
          </span>
        )}
      </div>

      {/* Sources — project directories */}
      <div className="knowledge-section__card">
        <div className="knowledge-section__card-header">
          <span className="knowledge-section__card-label">Sources</span>
          <button
            className="knowledge-section__action-btn"
            onClick={handleScan}
            disabled={scanning || directories.length === 0}
          >
            {scanning ? '⟳ Scanning…' : '⟳ Index directories'}
          </button>
        </div>
        {directories.length > 0 ? (
          <div className="knowledge-section__source-list">
            {directories.map((dir: any) => (
              <div key={dir.id} className="knowledge-section__source">
                <span className="knowledge-section__source-icon">📁</span>
                <div className="knowledge-section__source-info">
                  <span className="knowledge-section__source-name">
                    {dir.label || dir.path.split('/').pop()}
                  </span>
                  <span className="knowledge-section__source-path">
                    {dir.path}
                  </span>
                </div>
                <span className="knowledge-section__badge">{dir.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="knowledge-section__empty">
            No directories configured. Add them in project settings above.
          </p>
        )}
        {scanResult && (
          <div className="knowledge-section__scan-result">
            ✓ Indexed {scanResult.indexed} files, skipped {scanResult.skipped}
          </div>
        )}
      </div>

      {/* Documents — uploaded files */}
      <div className="knowledge-section__card">
        <div className="knowledge-section__card-header">
          <span className="knowledge-section__card-label">Documents</span>
          <span className="knowledge-section__stat">{docs.length} files</span>
        </div>

        {/* Drop zone */}
        <div
          className={`knowledge-section__dropzone${dragOver ? ' knowledge-section__dropzone--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.html,.ts,.tsx,.js,.py,.yaml,.yml,.toml,.xml,.sql,.sh,.css"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <span>Uploading…</span>
          ) : (
            <span>
              {dragOver
                ? 'Drop files here'
                : 'Drop files here or click to browse'}
            </span>
          )}
        </div>

        {/* Document list */}
        {docs.length > 0 && (
          <div className="knowledge-section__doc-list">
            {docs.map((doc) => (
              <div key={doc.id} className="knowledge-section__doc">
                <span className="knowledge-section__doc-name">
                  {doc.filename}
                </span>
                <span className="knowledge-section__badge">
                  {doc.chunkCount} chunks
                </span>
                <button
                  className="knowledge-section__doc-remove"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="knowledge-section__status">
        <span className="knowledge-section__status-item">
          Provider: {status?.provider ?? 'LanceDB (file-based)'}
        </span>
        {docs.length > 0 && (
          <button
            className="knowledge-section__clear-btn"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>
    </section>
  );
}
