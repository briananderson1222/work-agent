interface ProjectKnowledgeScanModalProps {
  projectWorkingDirectory?: string;
  scanInclude: string;
  scanExclude: string;
  onClose: () => void;
  onScan: () => void;
  onScanIncludeChange: (value: string) => void;
  onScanExcludeChange: (value: string) => void;
}

export function ProjectKnowledgeScanModal({
  projectWorkingDirectory,
  scanInclude,
  scanExclude,
  onClose,
  onScan,
  onScanIncludeChange,
  onScanExcludeChange,
}: ProjectKnowledgeScanModalProps) {
  return (
    <div className="project-page__modal-overlay" onClick={onClose}>
      <div className="project-page__modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="project-page__modal-title">Index Working Directory</h3>
        <div className="project-page__scan-warning">
          ⚠ This will scan and index files from your working directory into the
          project&apos;s vector database. Files are chunked and embedded for semantic
          search.
        </div>
        <div className="project-page__scan-path">📁 {projectWorkingDirectory}</div>
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
              onChange={(event) => onScanIncludeChange(event.target.value)}
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
              onChange={(event) => onScanExcludeChange(event.target.value)}
              placeholder="node_modules, .git, dist already excluded"
            />
          </label>
        </div>
        <div className="project-page__scan-actions">
          <button className="project-page__add-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="project-page__add-btn project-page__add-btn--primary"
            onClick={onScan}
          >
            Index Files
          </button>
        </div>
      </div>
    </div>
  );
}
