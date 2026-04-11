import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownCodeComponents } from '../../components/HighlightedCodeBlock';
import type { DocMeta } from './types';

interface ProjectKnowledgeViewerModalProps {
  doc: DocMeta;
  content: string | undefined;
  loading: boolean;
  onClose: () => void;
}

export function ProjectKnowledgeViewerModal({
  doc,
  content,
  loading,
  onClose,
}: ProjectKnowledgeViewerModalProps) {
  return (
    <div className="project-page__modal-overlay" onClick={onClose}>
      <div className="project-page__doc-viewer" onClick={(event) => event.stopPropagation()}>
        <div className="project-page__doc-viewer-header">
          <div className="project-page__doc-viewer-title">
            <span className="project-page__doc-viewer-icon">📄</span>
            <span className="project-page__doc-viewer-name">{doc.filename}</span>
            <span className="project-page__doc-badge">{doc.chunkCount} chunks</span>
          </div>
          <button className="project-page__doc-viewer-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="project-page__doc-viewer-body">
          {loading ? (
            <div className="project-page__doc-viewer-loading">Loading content…</div>
          ) : content ? (
            doc.filename.endsWith('.md') ? (
              <div className="project-page__doc-viewer-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownCodeComponents}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="project-page__doc-viewer-content">{content}</pre>
            )
          ) : (
            <div className="project-page__doc-viewer-empty">
              Unable to load document content
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
