import { useProjectLayoutsQuery } from '@stallion-ai/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PathAutocomplete } from '../components/PathAutocomplete';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import type { ProjectConfig } from '../contexts/ProjectsContext';
import './ProjectPage.css';

interface DocMeta {
  id: string;
  filename: string;
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeStatus {
  documentCount: number;
  totalChunks: number;
  lastIndexed: string | null;
}

interface AvailableLayout {
  source: string;
  plugin?: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  type: string;
}

export function ProjectPage({ slug }: { slug: string }) {
  const { apiBase } = useApiBase();
  const { setLayout, navigate } = useNavigation();
  const qc = useQueryClient();

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

  const { data: layouts = [] } = useProjectLayoutsQuery(slug);

  const { data: docs = [] } = useQuery<DocMeta[]>({
    queryKey: ['knowledge', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/projects/${slug}/knowledge`);
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  const { data: knowledgeStatus } = useQuery<KnowledgeStatus>({
    queryKey: ['knowledge-status', slug],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/status`,
      );
      const json = await res.json();
      return json.success ? json.data : null;
    },
  });

  // ── Drag-and-drop file upload ──
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Inline working directory edit ──
  const [editingDir, setEditingDir] = useState(false);
  const [dirDraft, setDirDraft] = useState('');

  const saveDirMutation = useMutation({
    mutationFn: async (workingDirectory: string) => {
      const res = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workingDirectory: workingDirectory || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', slug] });
      setEditingDir(false);
    },
  });

  // ── Add layout modal ──
  const [showAddLayout, setShowAddLayout] = useState(false);
  const [available, setAvailable] = useState<AvailableLayout[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddLayout) return;
    fetch(`${apiBase}/api/projects/layouts/available`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAvailable(d.data ?? []);
      })
      .catch(() => {});
  }, [showAddLayout, apiBase]);

  async function addLayout(item: AvailableLayout) {
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
            description: item.description,
            config: {},
          }),
        });
      }
      qc.invalidateQueries({ queryKey: ['projects', slug, 'layouts'] });
      setShowAddLayout(false);
    } catch {
      /* ignore */
    }
    setAdding(null);
  }

  if (isLoading || !project) {
    return (
      <div className="project-page">
        <div
          className="project-page__inner"
          style={{ color: 'var(--text-muted)', fontSize: '14px' }}
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="project-page">
      <div className="project-page__inner">
        {/* Header */}
        <div className="project-page__header">
          <div className="project-page__identity">
            {project.icon && (
              <span className="project-page__icon">{project.icon}</span>
            )}
            <div>
              <h2 className="project-page__name">{project.name}</h2>
              {project.description && (
                <p className="project-page__desc">{project.description}</p>
              )}
            </div>
          </div>
          <button
            className="project-page__settings-btn"
            onClick={() => navigate(`/projects/${slug}/edit`)}
          >
            ⚙ Settings
          </button>
        </div>

        {/* Layout cards — the hero */}
        <div className="project-page__layouts">
          <div className="project-page__section-header">
            <span className="project-page__section-label">Open</span>
            <button
              className="project-page__add-btn"
              onClick={() => setShowAddLayout(true)}
            >
              + Add
            </button>
          </div>

          <div className="project-page__cards">
            {(layouts as any[]).length > 0 ? (
              (layouts as any[]).map((layout: any) => (
                <button
                  key={layout.slug}
                  className="project-page__card"
                  onClick={() => setLayout(slug, layout.slug)}
                >
                  {layout.icon && (
                    <span className="project-page__card-icon">
                      {layout.icon}
                    </span>
                  )}
                  <span className="project-page__card-name">{layout.name}</span>
                  {layout.description && (
                    <span className="project-page__card-desc">{layout.description}</span>
                  )}
                  <span className="project-page__card-type">{layout.type}</span>
                </button>
              ))
            ) : (
              <button
                className="project-page__empty-card"
                onClick={() => setShowAddLayout(true)}
              >
                + Add your first layout to get started
              </button>
            )}
          </div>
        </div>

        {/* Details row */}
        <div className="project-page__details">
          <div className="project-page__detail-card">
            <div className="project-page__detail-label">Working Directory</div>
            {editingDir ? (
              <div className="project-page__dir-edit">
                <PathAutocomplete
                  apiBase={apiBase}
                  value={dirDraft}
                  onChange={setDirDraft}
                  placeholder="/path/to/project"
                />
                <div className="project-page__dir-edit-actions">
                  <button
                    className="project-page__add-btn"
                    onClick={() => saveDirMutation.mutate(dirDraft)}
                    disabled={saveDirMutation.isPending}
                  >
                    {saveDirMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="project-page__add-btn"
                    onClick={() => setEditingDir(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="project-page__detail-editable"
                onClick={() => {
                  setDirDraft(project.workingDirectory ?? '');
                  setEditingDir(true);
                }}
              >
                {project.workingDirectory ? (
                  <span className="project-page__detail-value">
                    {project.workingDirectory}
                  </span>
                ) : (
                  <span className="project-page__detail-empty">
                    Click to set working directory
                  </span>
                )}
                <span className="project-page__detail-edit-icon">✎</span>
              </button>
            )}
          </div>
          <div className="project-page__detail-card">
            <div className="project-page__detail-label">Knowledge</div>
            {knowledgeStatus && knowledgeStatus.totalChunks > 0 ? (
              <div className="project-page__detail-stats">
                <span className="project-page__detail-stat">
                  📄 {knowledgeStatus.documentCount} docs
                </span>
                <span className="project-page__detail-stat">
                  🧩 {knowledgeStatus.totalChunks} chunks
                </span>
              </div>
            ) : (
              <div className="project-page__detail-empty">
                No documents yet — drop files below
              </div>
            )}
          </div>
        </div>

        {/* Drop zone + documents */}
        <div className="project-page__section-header">
          <span className="project-page__section-label">Documents</span>
          {docs.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {docs.length} files
            </span>
          )}
        </div>

        <div
          className={`project-page__dropzone${dragOver ? ' project-page__dropzone--active' : ''}`}
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
          <div className="project-page__dropzone-icon">
            {uploading ? '⏳' : '📎'}
          </div>
          <div className="project-page__dropzone-text">
            {uploading
              ? 'Uploading…'
              : dragOver
                ? 'Drop files here'
                : 'Drop files here or click to browse'}
          </div>
          <div className="project-page__dropzone-hint">
            .md .txt .json .ts .py .yaml and more
          </div>
        </div>

        {docs.length > 0 && (
          <div className="project-page__docs">
            {docs.map((doc) => (
              <div key={doc.id} className="project-page__doc">
                <span className="project-page__doc-name">{doc.filename}</span>
                <span className="project-page__doc-badge">
                  {doc.chunkCount} chunks
                </span>
                <button
                  className="project-page__doc-remove"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Layout Modal */}
        {showAddLayout && (
          <div
            className="project-page__modal-overlay"
            onClick={() => setShowAddLayout(false)}
          >
            <div
              className="project-page__modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="project-page__modal-title">Add Layout</h3>
              <div className="project-page__modal-list">
                {available.map((item) => (
                  <button
                    key={`${item.source}-${item.slug}`}
                    className="project-page__modal-item"
                    disabled={adding === item.slug}
                    onClick={() => addLayout(item)}
                  >
                    {item.icon && <span>{item.icon}</span>}
                    <div className="project-page__modal-item-info">
                      <div className="project-page__modal-item-name">
                        {item.name}
                      </div>
                      {item.description && (
                        <div className="project-page__modal-item-desc">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <span className="project-page__doc-badge">
                      {item.source === 'plugin' ? item.plugin : item.type}
                    </span>
                  </button>
                ))}
              </div>
              <div className="project-page__modal-cancel">
                <button
                  className="project-page__add-btn"
                  onClick={() => setShowAddLayout(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
