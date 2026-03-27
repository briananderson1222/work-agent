import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DetailHeader } from '../components/DetailHeader';
import { ModelSelector } from '../components/ModelSelector';
import { PathAutocomplete } from '../components/PathAutocomplete';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectConfig } from '../contexts/ProjectsContext';
import './page-layout.css';
import './editor-layout.css';
import './ProjectSettingsView.css';

type ProjectForm = Pick<
  ProjectConfig,
  'name' | 'icon' | 'description' | 'defaultModel' | 'workingDirectory'
>;

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

  useEffect(() => {
    if (project) {
      const f: ProjectForm = {
        name: project.name,
        icon: project.icon ?? '',
        description: project.description ?? '',
        defaultModel: project.defaultModel ?? '',
        workingDirectory: project.workingDirectory ?? '',
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
        defaultModel: saved.defaultModel ?? '',
        workingDirectory: saved.workingDirectory ?? '',
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
    return <div className="project-settings__loading">Loading…</div>;
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  function setField<K extends keyof ProjectForm>(
    key: K,
    value: ProjectForm[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  return (
    <div className="project-settings">
      {/* Header */}
      <DetailHeader
        title={`${form.icon || project?.icon || ''} ${form.name}`.trim()}
        badge={
          isDirty
            ? { label: 'unsaved', variant: 'warning' as const }
            : undefined
        }
      >
        <button
          className="editor-btn"
          onClick={() => navigate(`/projects/${slug}`)}
        >
          ← Back
        </button>
        <button
          className="editor-btn editor-btn--primary"
          disabled={saveMutation.isPending || !form.name}
          onClick={() => saveMutation.mutate(form)}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </DetailHeader>

      {error && <div className="project-settings__error">{error}</div>}

      {/* Body */}
      <div className="project-settings__body">
        {/* Basic Info */}
        <section className="project-settings__section">
          <div className="project-settings__section-title">Basic Info</div>

          <div className="editor-field">
            <label className="editor-label">Name *</label>
            <div className="project-settings__name-row">
              <input
                className="editor-input project-settings__icon-input"
                type="text"
                value={form.icon ?? ''}
                placeholder="🚀"
                onChange={(e) => setField('icon', e.target.value)}
              />
              <input
                className="editor-input project-settings__name-input"
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>
          </div>
          <div className="editor-field">
            <label className="editor-label">Working Directory</label>
            <PathAutocomplete
              apiBase={apiBase}
              value={form.workingDirectory ?? ''}
              onChange={(v) => setField('workingDirectory', v)}
              placeholder="/path/to/project"
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

        {/* Default AI Model */}
        <section className="project-settings__section">
          <div className="project-settings__section-title project-settings__section-title--sm">
            Default AI Model
          </div>
          <div className="editor-field">
            <ModelSelector
              value={form.defaultModel ?? ''}
              onChange={(modelId) => setField('defaultModel', modelId)}
              placeholder="System default"
            />
            <span className="editor-hint">
              Leave empty to use the system default.
            </span>
          </div>
        </section>

        {/* Layouts — list + save as template */}
        <LayoutsSection slug={slug} apiBase={apiBase} />

        {/* Knowledge */}
        <KnowledgeSection slug={slug} apiBase={apiBase} />

        {/* Danger Zone */}
        <section className="project-settings__section">
          <div
            className="project-settings__section-title project-settings__section-title--sm"
            style={{ color: 'var(--error-text)' }}
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
            <div className="knowledge-section__doc-list project-settings__actions--top">
              {available.map((item) => (
                <button
                  key={`${item.source}-${item.slug}`}
                  className="project-dashboard__layout-btn"
                  disabled={adding === item.slug}
                  onClick={() => addLayout(item)}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <div className="project-settings__layout-item">
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
            <div className="project-settings__actions">
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

  const workingDir = project?.workingDirectory;
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

      {/* Sources — working directory */}
      <div className="knowledge-section__card">
        <div className="knowledge-section__card-header">
          <span className="knowledge-section__card-label">Sources</span>
          <button
            className="knowledge-section__action-btn"
            onClick={handleScan}
            disabled={scanning || !workingDir}
          >
            {scanning ? '⟳ Scanning…' : '⟳ Index directory'}
          </button>
        </div>
        {workingDir ? (
          <div className="knowledge-section__source-list">
            <div className="knowledge-section__source">
              <span className="knowledge-section__source-icon">📁</span>
              <div className="knowledge-section__source-info">
                <span className="knowledge-section__source-name">
                  {workingDir.split('/').filter(Boolean).pop()}
                </span>
                <span className="knowledge-section__source-path">
                  {workingDir}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="knowledge-section__empty">
            No working directory configured.
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
