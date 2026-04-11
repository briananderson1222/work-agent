import {
  type CodingFileEntry as FileEntry,
  useCodingFilesQuery,
} from '@stallion-ai/sdk';
import { useState } from 'react';
import { useApiBase } from '../../contexts/ApiBaseContext';

function FileTreeNode({
  entry,
  depth,
  onSelect,
}: {
  entry: FileEntry;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);

  if (entry.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            width: '100%',
            padding: `3px 8px 3px ${8 + depth * 12}px`,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '12px',
            textAlign: 'left',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {open ? '▾' : '▸'}
          </span>
          <span>{entry.name}</span>
        </button>
        {open &&
          entry.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        width: '100%',
        padding: `3px 8px 3px ${20 + depth * 12}px`,
        background: 'transparent',
        border: 'none',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        textAlign: 'left',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.name}
      </span>
    </button>
  );
}

export function FileTreePanel({
  workingDir,
  onFileSelect,
}: {
  workingDir: string;
  onFileSelect: (path: string) => void;
}) {
  const { apiBase } = useApiBase();
  const {
    data: tree = [],
    isLoading: loading,
    error: queryError,
  } = useCodingFilesQuery(workingDir, apiBase);
  const error = queryError?.message || null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 0' }}>
      <div
        style={{
          padding: '6px 8px 4px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Files
      </div>
      {loading && (
        <div
          style={{
            padding: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          Loading…
        </div>
      )}
      {error && (
        <div
          style={{
            padding: '8px',
            fontSize: '12px',
            color: 'var(--error-text)',
          }}
        >
          {error}
        </div>
      )}
      {!loading && !error && tree.length === 0 && (
        <div
          style={{
            padding: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          {workingDir ? 'No files found' : 'No working directory configured'}
        </div>
      )}
      {tree.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onSelect={onFileSelect}
        />
      ))}
    </div>
  );
}
