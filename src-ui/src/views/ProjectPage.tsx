import { useProjectLayoutsQuery, useProjectQuery, useUpdateProjectMutation, useCreateLayoutMutation, useKnowledgeDocsQuery, useKnowledgeNamespacesQuery, useKnowledgeSearchQuery, useKnowledgeDeleteMutation, useKnowledgeBulkDeleteMutation, useKnowledgeStatusQuery, useKnowledgeScanMutation, useProjectConversationsQuery, useAddLayoutFromPluginMutation, fetchKnowledgeDocs, uploadKnowledge, deleteKnowledgeDoc, fetchAvailableLayouts, updateKnowledgeNamespace } from '@stallion-ai/sdk';
import { useQueryClient, } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PathAutocomplete } from '../components/PathAutocomplete';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useGitStatus, useGitLog } from '../hooks/useGitStatus';
import { GitBadge } from '../components/GitBadge';
import './ProjectPage.css';

interface DocMeta {
  id: string;
  filename: string;
  source?: 'upload' | 'directory-scan';
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeNamespace {
  id: string;
  label: string;
  behavior: 'rag' | 'inject';
  builtIn?: boolean;
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

  const { data: project, isLoading } = useProjectQuery(slug);

  const { data: layouts = [] } = useProjectLayoutsQuery(slug);
  const { data: gitStatus } = useGitStatus(project?.workingDirectory);
  const { data: gitLog = [] } = useGitLog(project?.workingDirectory, 5);

  const { data: docs = [] } = useKnowledgeDocsQuery(slug);

  const { data: knowledgeStatus } = useKnowledgeStatusQuery(slug);

  const { data: namespaces = [] } = useKnowledgeNamespacesQuery(slug);

  const [selectedNs, setSelectedNs] = useState<string | null>(null);
  const [rulesContent, setRulesContent] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);

  // Load existing rules content when rules tab is selected
  const { data: rulesSearchData } = useKnowledgeSearchQuery(slug, '*', 'rules', {
    enabled: selectedNs === 'rules' && !rulesLoaded,
  });

  useEffect(() => {
    if (selectedNs !== 'rules' || rulesLoaded || !rulesSearchData) return;
    if (rulesSearchData.length) {
      const byDoc = new Map<string, { filename: string; chunks: Map<number, string> }>();
      for (const r of rulesSearchData) {
        const docId = r.metadata?.docId;
        const idx = r.metadata?.chunkIndex ?? 0;
        const fn = r.metadata?.filename ?? 'rules';
        if (!docId) continue;
        if (!byDoc.has(docId)) byDoc.set(docId, { filename: fn, chunks: new Map() });
        byDoc.get(docId)!.chunks.set(idx, r.text);
      }
      const parts: string[] = [];
      for (const [, { chunks }] of byDoc) {
        const sorted = Array.from(chunks.entries()).sort((a, b) => a[0] - b[0]);
        parts.push(sorted.map(([, t]) => t).join('\n\n'));
      }
      if (parts.length) setRulesContent(parts.join('\n\n---\n\n'));
    }
    setRulesLoaded(true);
  }, [selectedNs, rulesLoaded, rulesSearchData]);

  async function handleSaveRules() {
    if (!rulesContent.trim()) return;
    setSavingRules(true);
    try {
      // Clear existing rules docs first
      const rulesDocs = await fetchKnowledgeDocs(slug, 'rules');
      for (const doc of rulesDocs) {
        await deleteKnowledgeDoc(slug, doc.id, 'rules');
      }
      // Upload new rules
      await uploadKnowledge(slug, 'project-rules.md', rulesContent, 'rules');
      qc.invalidateQueries({ queryKey: ['knowledge', 'docs', slug] });
    } catch { /* ignore */ }
    setSavingRules(false);
  }

  const { data: conversations = [] } = useProjectConversationsQuery(slug);

  // ── Drag-and-drop file upload ──
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        await uploadKnowledge(slug, file.name, content);
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ['knowledge', 'docs', slug] });
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  const deleteMutation = useKnowledgeDeleteMutation(slug);

  const bulkDeleteMutation = useKnowledgeBulkDeleteMutation(slug);

  // ── Inline working directory edit ──
  const [editingDir, setEditingDir] = useState(false);
  const [dirDraft, setDirDraft] = useState('');

  const updateProjectMutation = useUpdateProjectMutation();

  // ── Directory scan with confirmation ──
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanInclude, setScanInclude] = useState('');
  const [scanExclude, setScanExclude] = useState('');
  const [scanResult, setScanResult] = useState<{ indexed: number; skipped: number } | null>(null);

  const scanMutation = useKnowledgeScanMutation(slug);

  async function handleScan() {
    setScanResult(null);
    setShowScanDialog(false);
    const inc = scanInclude.split(',').map(s => s.trim()).filter(Boolean);
    const exc = scanExclude.split(',').map(s => s.trim()).filter(Boolean);
    const options: Record<string, any> = {};
    if (inc.length) options.includePatterns = inc;
    if (exc.length) options.excludePatterns = exc;
    scanMutation.mutate(options, { onSuccess: (data: any) => setScanResult(data) });
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

  const filteredDocs = selectedNs ? docs.filter((d: any) => (d.namespace || 'default') === selectedNs) : docs;
  const dirDocs = filteredDocs.filter((d) => d.source === 'directory-scan');
  const uploadDocs = filteredDocs.filter((d) => d.source !== 'directory-scan');

  // ── Add layout modal ──
  const [showAddLayout, setShowAddLayout] = useState(false);
  const [available, setAvailable] = useState<AvailableLayout[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddLayout) return;
    fetchAvailableLayouts()
      .then(data => setAvailable(data))
      .catch(() => {});
  }, [showAddLayout]);

  const addLayoutFromPluginMutation = useAddLayoutFromPluginMutation(slug);
  const createLayoutMutation = useCreateLayoutMutation(slug);

  async function addLayout(item: AvailableLayout) {
    setAdding(item.slug);
    try {
      if (item.source === 'plugin' && item.plugin) {
        await addLayoutFromPluginMutation.mutateAsync(item.plugin);
      } else {
        await createLayoutMutation.mutateAsync({
          type: item.type,
          name: item.name,
          slug: `${item.slug}-${Date.now().toString(36)}`,
          icon: item.icon,
          description: item.description,
          config: {},
        });
      }
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
              {gitStatus && <GitBadge git={gitStatus} className="project-page__git-badge" />}
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

        {/* Working directory edit — inline below header */}
        {editingDir && (
          <div className="project-page__dir-inline">
            <PathAutocomplete
              apiBase={apiBase}
              value={dirDraft}
              onChange={setDirDraft}
              onSubmit={() => { updateProjectMutation.mutate({ slug, workingDirectory: dirDraft || undefined }, { onSuccess: () => setEditingDir(false) }); }}
              onBlur={() => {
                if (dirDraft !== (project.workingDirectory ?? '')) {
                  updateProjectMutation.mutate({ slug, workingDirectory: dirDraft || undefined }, { onSuccess: () => setEditingDir(false) });
                } else {
                  setEditingDir(false);
                }
              }}
              placeholder="/path/to/project"
              className="project-page__dir-input"
            />
          </div>
        )}

        {/* Git section */}
        {gitStatus && (
          <div className="project-page__git-section">
            <div className="project-page__section-header">
              <span className="project-page__section-label">
                ⎇ {gitStatus.branch}
                {gitStatus.changes.length > 0 && (
                  <span className="project-page__git-section-dirty"> · {gitStatus.staged} staged, {gitStatus.unstaged} modified, {gitStatus.untracked} untracked</span>
                )}
                {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                  <span className="project-page__git-section-remote">
                    {gitStatus.ahead > 0 && ` · ↑${gitStatus.ahead}`}
                    {gitStatus.behind > 0 && ` · ↓${gitStatus.behind}`}
                  </span>
                )}
              </span>
            </div>
            {gitLog.length > 0 && (
              <div className="project-page__git-log">
                {gitLog.map((c) => (
                  <div key={c.sha} className="project-page__git-commit">
                    <span className="project-page__git-sha">{c.sha}</span>
                    <span className="project-page__git-msg">{c.message}</span>
                    <span className="project-page__git-meta">{c.author} · {c.relativeTime}</span>
                  </div>
                ))}
              </div>
            )}
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

          {/* Namespace tabs */}
          {namespaces.length > 0 && (
            <div className="project-page__ns-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                className={`project-page__ns-tab ${selectedNs === null ? 'project-page__ns-tab--active' : ''}`}
                onClick={() => setSelectedNs(null)}
                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: selectedNs === null ? 'var(--accent)' : 'transparent', color: selectedNs === null ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: '11px' }}
              >All</button>
              {namespaces.map((ns) => (
                <button
                  key={ns.id}
                  className={`project-page__ns-tab ${selectedNs === ns.id ? 'project-page__ns-tab--active' : ''}`}
                  onClick={() => setSelectedNs(ns.id)}
                  style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: selectedNs === ns.id ? 'var(--accent)' : 'transparent', color: selectedNs === ns.id ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: '11px' }}
                >{ns.label}{ns.behavior === 'inject' ? ' ⚡' : ''}</button>
              ))}
            </div>
          )}

          {/* Rules editor — shown when rules namespace is selected */}
          {selectedNs === 'rules' && (
            <div className="project-page__rules-editor" style={{ marginBottom: '12px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ⚡ Rules are injected into every chat message's system prompt for this project.
              </div>
              <textarea
                value={rulesContent}
                onChange={(e) => setRulesContent(e.target.value)}
                placeholder="Add project rules... e.g. 'Always respond in bullet points' or 'This project uses Python 3.12 with FastAPI'"
                style={{ width: '100%', minHeight: '80px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
              />
              <button
                onClick={handleSaveRules}
                disabled={savingRules || !rulesContent.trim()}
                style={{ marginTop: '6px', padding: '4px 12px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
              >{savingRules ? 'Saving…' : 'Save Rules'}</button>
            </div>
          )}

          {/* Namespace storage config — shown for any selected namespace */}
          {selectedNs && (() => {
            const nsCfg = namespaces.find((n: KnowledgeNamespace) => n.id === selectedNs);
            if (!nsCfg) return null;
            return (
              <div style={{ marginBottom: '8px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-secondary)', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                <label style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>📁 Storage:</label>
                <input
                  type="text"
                  placeholder="Default (built-in)"
                  defaultValue={(nsCfg as any).storageDir ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    updateKnowledgeNamespace(slug, selectedNs!, { storageDir: val || undefined })
                      .then(() => qc.invalidateQueries({ queryKey: ['knowledge', 'namespaces', slug] }));
                  }}
                  style={{ flex: 1, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '11px' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    defaultChecked={(nsCfg as any).writeFiles ?? false}
                    onChange={(e) => {
                      updateKnowledgeNamespace(slug, selectedNs!, { writeFiles: e.target.checked })
                        .then(() => qc.invalidateQueries({ queryKey: ['knowledge', 'namespaces', slug] }));
                    }}
                  />
                  Write files
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    defaultChecked={!!(nsCfg as any).enhance?.auto}
                    onChange={(e) => {
                      const enhance = e.target.checked ? { agent: 'sales-sa:sales-sa', auto: true } : undefined;
                      updateKnowledgeNamespace(slug, selectedNs!, { enhance })
                        .then(() => qc.invalidateQueries({ queryKey: ['knowledge', 'namespaces', slug] }));
                    }}
                  />
                  ✨ Auto-enhance
                </label>
              </div>
            );
          })()}
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
                  disabled={scanMutation.isPending}
                >
                  {scanMutation.isPending ? '⟳ Scanning…' : '⟳ Index directory'}
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
