import {
  useKnowledgeBulkDeleteMutation,
  useKnowledgeDeleteMutation,
  useKnowledgeDocsQuery,
  useKnowledgeSaveMutation,
  useKnowledgeScanMutation,
  useKnowledgeStatusQuery,
  useProjectQuery,
} from '@stallion-ai/sdk';
import { useRef, useState } from 'react';
import { getKnowledgeTimeAgo } from './utils';
import type { DocMeta, KnowledgeStatus } from './types';

export function KnowledgeSection({ slug }: { slug: string }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    indexed: number;
    skipped: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useKnowledgeDocsQuery(slug) as {
    data?: DocMeta[];
  };
  const { data: status } = useKnowledgeStatusQuery(slug) as {
    data?: KnowledgeStatus | null;
  };
  const { data: project } = useProjectQuery(slug) as {
    data?: { workingDirectory?: string | null };
  };
  const deleteMutation = useKnowledgeDeleteMutation(slug);
  const clearMutation = useKnowledgeBulkDeleteMutation(slug);
  const scanMutation = useKnowledgeScanMutation(slug);
  const saveKnowledgeMutation = useKnowledgeSaveMutation(slug);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await scanMutation.mutateAsync({});
      setScanResult(result ?? null);
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
        await saveKnowledgeMutation.mutateAsync({
          filename: file.name,
          content,
        });
      } catch {
        /* ignore */
      }
    }
    setUploading(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) {
      void uploadFiles(event.dataTransfer.files);
    }
  }

  const workingDir = project?.workingDirectory;

  return (
    <section className="knowledge-section">
      <div className="knowledge-section__header">
        <h3 className="knowledge-section__title">📚 Knowledge Base</h3>
        {status && (
          <span className="knowledge-section__stat">
            {status.totalChunks} chunks · {status.documentCount} docs
            {status.lastIndexed && ` · indexed ${getKnowledgeTimeAgo(status.lastIndexed)}`}
          </span>
        )}
      </div>

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

      <div className="knowledge-section__card">
        <div className="knowledge-section__card-header">
          <span className="knowledge-section__card-label">Documents</span>
          <span className="knowledge-section__stat">{docs.length} files</span>
        </div>

        <div
          className={`knowledge-section__dropzone${dragOver ? ' knowledge-section__dropzone--active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
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
            onChange={(event) => {
              if (event.target.files) {
                void uploadFiles(event.target.files);
              }
              event.target.value = '';
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

      <div className="knowledge-section__status">
        {docs.length > 0 && (
          <button
            className="knowledge-section__clear-btn"
            onClick={() => clearMutation.mutate(docs.map((doc) => doc.id))}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>
    </section>
  );
}
