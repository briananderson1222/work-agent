import type { ReactNode } from 'react';
import type { DocMeta } from './types';

interface ProjectKnowledgeDocGroupProps {
  title: string;
  icon: string;
  docs: DocMeta[];
  open: boolean;
  allSelected: boolean;
  onToggleOpen: () => void;
  onToggleAll: () => void;
  headerMeta?: ReactNode;
  children?: ReactNode;
  onToggleDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  onViewDoc: (doc: DocMeta) => void;
  selectedDocs: Set<string>;
}

export function ProjectKnowledgeDocGroup({
  title,
  icon,
  docs,
  open,
  allSelected,
  onToggleOpen,
  onToggleAll,
  headerMeta,
  children,
  onToggleDoc,
  onDeleteDoc,
  onViewDoc,
  selectedDocs,
}: ProjectKnowledgeDocGroupProps) {
  return (
    <div className="project-page__doc-group">
      <button className="project-page__doc-group-header" onClick={onToggleOpen}>
        <span className="project-page__doc-group-chevron">
          {open ? '▾' : '▸'}
        </span>
        <span className="project-page__doc-group-icon">{icon}</span>
        <span className="project-page__doc-group-label">{title}</span>
        {docs.length > 0 && (
          <>
            <span className="project-page__doc-group-count">
              {docs.length} files
            </span>
            <input
              type="checkbox"
              className="project-page__doc-group-check"
              checked={allSelected}
              onChange={(event) => {
                event.stopPropagation();
                onToggleAll();
              }}
              onClick={(event) => event.stopPropagation()}
              title="Select all"
            />
          </>
        )}
      </button>
      {open && (
        <div className="project-page__doc-group-body">
          {headerMeta}
          {children}
          {docs.map((doc) => (
            <ProjectDocRow
              key={doc.id}
              doc={doc}
              selected={selectedDocs.has(doc.id)}
              onToggleSelected={() => onToggleDoc(doc.id)}
              onDelete={() => onDeleteDoc(doc.id)}
              onView={() => onViewDoc(doc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDocRow({
  doc,
  selected,
  onToggleSelected,
  onDelete,
  onView,
}: {
  doc: DocMeta;
  selected: boolean;
  onToggleSelected: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  return (
    <div className="project-page__doc" onClick={onView}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        onClick={(event) => event.stopPropagation()}
        className="project-page__doc-check"
      />
      <span className="project-page__doc-name">{doc.filename}</span>
      <span className="project-page__doc-badge">{doc.chunkCount} chunks</span>
      <button
        className="project-page__doc-remove"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}
