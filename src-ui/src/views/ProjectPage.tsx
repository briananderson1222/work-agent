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
  source?: 'upload' | 'directory-scan';
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeStatus {
  documentCount: number;
  totalChunks: number;
  lastIndexed: string | null;
}

interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  agentSlug: string;
  layoutId?: string;
  createdAt: string;
  updatedAt: string;
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function ProjectPage({ slug }: { slug: string }) {
  const { apiBase } = useApiBase();
  const { setLayout, setConversation, navigate } = useNavigation();
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

  const { data: conversations = [] } = useQuery<ConversationRecord[]>({
    queryKey: ['project-conversations', slug],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/conversations?limit=10`,
      );
      const json = await res.json();
      return json.success ? json.data : [];
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/bulk-delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    },
    onSuccess: () => {
      setSelectedDocs(new Set());
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

  // ── Directory scan with confirmation ──
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanInclude, setScanInclude] = useState('');
  const [scanExclude, setScanExclude] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    indexed: number;
    skipped: number;
  } | null>(null);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setShowScanDialog(false);
    try {
      const body: Record<string, unknown> = {};
      const inc = scanInclude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const exc = scanExclude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (inc.length) body.includePatterns = inc;
      if (exc.length) body.excludePatterns = exc;
      const res = await fetch(
        `${apiBase}/api/projects/${slug}/knowledge/scan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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

  // ── Bulk selection ──
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllInGroup(groupDocs: DocMeta[]) {
    const ids = groupDocs.map((d) => d.id);
    const allSelected = ids.every((id) => selectedDocs.has(id));
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  // ── Collapsible sections ──
  const [dirOpen, setDirOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(true);

  const dirDocs = docs.filter((d) => d.source === 'directory-scan');
  const uploadDocs = docs.filter((d) => d.source !== 'directory-scan');

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

  function handleConversationClick(conv: ConversationRecord) {
    const layoutSlug = conv.layoutId || (layouts as any[])[0]?.slug;
    if (layoutSlug) {
      setLayout(slug, layoutSlug);
      setTimeout(() => setConversation(conv.id), 100);
    }
  }

  if (isLoading || !project) {
    return (
      <div className="project-page">
        <div className="project-page__inner project-page__loading">
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
            <div className="project-page__identity-info">
              <h2 className="project-page__name">{project.name}</h2>
              {!editingDir && (
                <button
                  className="project-page__dir-display"
                  onClick={() => {
                    setDirDraft(project.workingDirectory ?? '');
                    setEditingDir(true);
                  }}
                >
                  <span className="project-page__dir-path">
                    {project.workingDirectory || 'Set working directory…'}
                  </span>
                  <span className="project-page__dir-edit-icon">✎</span>
                </button>
              )}
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

        {/* Working directory edit — full width below header */}
        {editingDir && (
          <div className="project-page__dir-inline">
            <PathAutocomplete
              apiBase={apiBase}
              value={dirDraft}
              onChange={setDirDraft}
              onSubmit={() => saveDirMutation.mutate(dirDraft)}
              placeholder="/path/to/project"
              className="project-page__dir-input"
            />
            <button
              className="project-page__dir-save"
              onClick={() => saveDirMutation.mutate(dirDraft)}
              disabled={saveDirMutation.isPending}
            >
              {saveDirMutation.isPending ? '…' : '✓'}
            </button>
            <button
              className="project-page__dir-cancel"
              onClick={() => setEditingDir(false)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Layout cards */}
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
                  <span className="project-page__card-name">
                    {layout.name}
                  </span>
                  {layout.description && (
                    <span className="project-page__card-desc">
                      {layout.description}
                    </span>
                  )}
                  <span className="project-page__card-type">
                    {layout.type}
                  </span>
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

        {/* ── Knowledge & Documents ── */}
        <div className="project-page__knowledge">
          <div className="project-page__section-header">
            <span className="project-page__section-label">
              Knowledge & Documents
            </span>
            <div className="project-page__knowledge-actions">
              {knowledgeStatus && knowledgeStatus.totalChunks > 0 && (
                <span className="project-page__knowledge-stats">
                  {knowledgeStatus.documentCount} docs ·{' '}
                  {knowledgeStatus.totalChunks} chunks
                  {knowledgeStatus.lastIndexed &&
                    ` · ${timeAgo(knowledgeStatus.lastIndexed)}`}
                </span>
              )}
              {selectedDocs.size > 0 && (
                <button
                  className="project-page__add-btn project-page__add-btn--danger"
                  onClick={() =>
                    bulkDeleteMutation.mutate([...selectedDocs])
                  }
                  disabled={bulkDeleteMutation.isPending}
                >
                  {bulkDeleteMutation.isPending
                    ? 'Deleting…'
                    : `Delete ${selectedDocs.size} selected`}
                </button>
              )}
              {project.workingDirectory && (
                <button
                  className="project-page__add-btn"
                  onClick={() => setShowScanDialog(true)}
                  disabled={scanning}
                >
                  {scanning ? '⟳ Scanning…' : '⟳ Index directory'}
                </button>
              )}
            </div>
          </div>

          {scanResult && (
            <div className="project-page__scan-result">
              ✓ Indexed {scanResult.indexed} files, skipped{' '}
              {scanResult.skipped}
            </div>
          )}

          {/* Directory-scanned files */}
          {dirDocs.length > 0 && (
            <div className="project-page__doc-group">
              <button
                className="project-page__doc-group-header"
                onClick={() => setDirOpen((o) => !o)}
              >
                <span className="project-page__doc-group-chevron">
                  {dirOpen ? '▾' : '▸'}
                </span>
                <span className="project-page__doc-group-icon">📁</span>
                <span className="project-page__doc-group-label">
                  Directory Index
                </span>
                <span className="project-page__doc-group-count">
                  {dirDocs.length} files
                </span>
                <input
                  type="checkbox"
                  className="project-page__doc-group-check"
                  checked={dirDocs.every((d) => selectedDocs.has(d.id))}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleAllInGroup(dirDocs);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Select all"
                />
              </button>
              {dirOpen && (
                <div className="project-page__doc-group-body">
                  <div className="project-page__doc-group-meta">
                    From: {project.workingDirectory}
                  </div>
                  {dirDocs.map((doc) => (
                    <div key={doc.id} className="project-page__doc">
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="project-page__doc-check"
                      />
                      <span className="project-page__doc-name">
                        {doc.filename}
                      </span>
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
            </div>
          )}

          {/* Uploaded files */}
          <div className="project-page__doc-group">
            <button
              className="project-page__doc-group-header"
              onClick={() => setUploadOpen((o) => !o)}
            >
              <span className="project-page__doc-group-chevron">
                {uploadOpen ? '▾' : '▸'}
              </span>
              <span className="project-page__doc-group-icon">📎</span>
              <span className="project-page__doc-group-label">
                Uploaded Documents
              </span>
              {uploadDocs.length > 0 && (
                <>
                  <span className="project-page__doc-group-count">
                    {uploadDocs.length} files
                  </span>
                  <input
                    type="checkbox"
                    className="project-page__doc-group-check"
                    checked={
                      uploadDocs.length > 0 &&
                      uploadDocs.every((d) => selectedDocs.has(d.id))
                    }
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleAllInGroup(uploadDocs);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="Select all"
                  />
                </>
              )}
            </button>
            {uploadOpen && (
              <div className="project-page__doc-group-body">
                <div className="project-page__doc-group-meta">
                  Stored in vector database (LanceDB) — not on the filesystem
                </div>

                {/* Drop zone */}
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

                {uploadDocs.map((doc) => (
                  <div key={doc.id} className="project-page__doc">
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="project-page__doc-check"
                    />
                    <span className="project-page__doc-name">
                      {doc.filename}
                    </span>
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
          </div>
        </div>

        {/* Recent Conversations */}
        {conversations.length > 0 && (
          <div className="project-page__conversations">
            <div className="project-page__section-header">
              <span className="project-page__section-label">
                Recent Conversations
              </span>
            </div>
            <div className="project-page__conversation-list">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  className="project-page__conversation-item"
                  onClick={() => handleConversationClick(conv)}
                >
                  <span className="project-page__conversation-title">
                    {conv.title || 'Untitled'}
                  </span>
                  <span className="project-page__conversation-agent">
                    {conv.agentSlug}
                  </span>
                  <span className="project-page__conversation-time">
                    {timeAgo(conv.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scan Confirmation Dialog */}
        {showScanDialog && (
          <div
            className="project-page__modal-overlay"
            onClick={() => setShowScanDialog(false)}
          >
            <div
              className="project-page__modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="project-page__modal-title">
                Index Working Directory
              </h3>
              <div className="project-page__scan-warning">
                ⚠ This will scan and index files from your working directory
                into the project's vector database. Files are chunked and
                embedded for semantic search.
              </div>
              <div className="project-page__scan-path">
                📁 {project.workingDirectory}
              </div>
              <div className="project-page__scan-fields">
                <label className="project-page__scan-label">
                  Include patterns
                  <span className="project-page__scan-hint">
                    comma-separated globs, e.g. src/**, docs/**
                  </span>
                  <input
                    className="project-page__scan-input"
                    type="text"
                    value={scanInclude}
                    onChange={(e) => setScanInclude(e.target.value)}
                    placeholder="Leave empty to include all"
                  />
                </label>
                <label className="project-page__scan-label">
                  Exclude patterns
                  <span className="project-page__scan-hint">
                    comma-separated globs, e.g. **/*.test.ts, dist/**
                  </span>
                  <input
                    className="project-page__scan-input"
                    type="text"
                    value={scanExclude}
                    onChange={(e) => setScanExclude(e.target.value)}
                    placeholder="node_modules, .git, dist already excluded"
                  />
                </label>
              </div>
              <div className="project-page__scan-actions">
                <button
                  className="project-page__add-btn"
                  onClick={() => setShowScanDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="project-page__add-btn project-page__add-btn--primary"
                  onClick={handleScan}
                >
                  Index Files
                </button>
              </div>
            </div>
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
