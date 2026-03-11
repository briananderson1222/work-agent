import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useSyntaxHighlighter, langFromFilePath } from '../contexts/SyntaxHighlighterContext';
import { useDockModePreference } from '../hooks/useDockModePreference';
import './CodingLayout.css';
import { TerminalPanel } from './TerminalPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

// ─── FileTreePanel ────────────────────────────────────────────────────────────

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
          onClick={() => setOpen((o) => !o)}
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
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{open ? '▾' : '▸'}</span>
          <span>{entry.name}</span>
        </button>
        {open && entry.children?.map((child) => (
          <FileTreeNode key={child.path} entry={child} depth={depth + 1} onSelect={onSelect} />
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
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
    </button>
  );
}

function FileTreePanel({
  workingDir,
  onFileSelect,
}: {
  workingDir: string;
  onFileSelect: (path: string) => void;
}) {
  const { apiBase } = useApiBase();
  const { data: tree = [], isLoading: loading, error: queryError } = useQuery<FileEntry[]>({
    queryKey: ['coding-files', workingDir],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/coding/files?path=${encodeURIComponent(workingDir)}`);
      const json = await r.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load files');
      return json.data ?? [];
    },
    enabled: !!workingDir,
  });
  const error = queryError?.message || null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 0' }}>
      <div style={{ padding: '6px 8px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Files
      </div>
      {loading && <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>}
      {error && <div style={{ padding: '8px', fontSize: '12px', color: 'var(--error-text)' }}>{error}</div>}
      {!loading && !error && tree.length === 0 && (
        <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {workingDir ? 'No files found' : 'No working directory configured'}
        </div>
      )}
      {tree.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} onSelect={onFileSelect} />
      ))}
    </div>
  );
}

// ─── DiffPanel ────────────────────────────────────────────────────────────────

function DiffPanel({ workingDir }: { workingDir: string }) {
  const { apiBase } = useApiBase();
  const { data: diff = '', isLoading: loading, error: queryError } = useQuery<string>({
    queryKey: ['coding-diff', workingDir],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/coding/git/diff?path=${encodeURIComponent(workingDir)}`);
      const json = await r.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load diff');
      return json.data?.diff ?? json.data ?? '';
    },
    enabled: !!workingDir,
  });
  const error = queryError?.message || null;

  const renderDiff = (text: string) => {
    if (!text) return <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>No changes</div>;

    // Parse into hunks for structured rendering
    const hunks: Array<{ header: string; lines: Array<{ text: string; type: 'add' | 'remove' | 'context' | 'header' | 'meta'; oldNum?: number; newNum?: number }> }> = [];
    let currentHunk: typeof hunks[0] | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const raw of text.split('\n')) {
      if (raw.startsWith('@@')) {
        const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        oldLine = match ? parseInt(match[1], 10) : 0;
        newLine = match ? parseInt(match[2], 10) : 0;
        currentHunk = { header: raw, lines: [] };
        hunks.push(currentHunk);
      } else if (raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('---') || raw.startsWith('+++')) {
        if (!currentHunk) { currentHunk = { header: '', lines: [] }; hunks.push(currentHunk); }
        currentHunk.lines.push({ text: raw, type: 'meta' });
      } else if (currentHunk) {
        if (raw.startsWith('+')) {
          currentHunk.lines.push({ text: raw.slice(1), type: 'add', newNum: newLine++ });
        } else if (raw.startsWith('-')) {
          currentHunk.lines.push({ text: raw.slice(1), type: 'remove', oldNum: oldLine++ });
        } else {
          currentHunk.lines.push({ text: raw.slice(1) || raw, type: 'context', oldNum: oldLine++, newNum: newLine++ });
        }
      }
    }

    return hunks.map((hunk, hi) => (
      <div key={hi} style={{ marginBottom: '8px' }}>
        {hunk.header && (
          <div style={{ color: '#2196f3', fontFamily: 'monospace', fontSize: '11px', padding: '4px 8px', background: 'rgba(33,150,243,0.08)', borderRadius: '3px', marginBottom: '2px' }}>
            {hunk.header}
          </div>
        )}
        {hunk.lines.map((line, li) => {
          const bg = line.type === 'add' ? 'rgba(76,175,80,0.1)' : line.type === 'remove' ? 'rgba(244,67,54,0.1)' : 'transparent';
          const color = line.type === 'add' ? '#4caf50' : line.type === 'remove' ? '#f44336' : line.type === 'meta' ? 'var(--text-muted)' : 'var(--text-secondary)';
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : line.type === 'meta' ? '' : ' ';
          return (
            <div key={li} style={{ display: 'flex', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6', background: bg }}>
              <span style={{ width: '36px', textAlign: 'right', color: 'var(--text-muted)', opacity: 0.5, paddingRight: '4px', flexShrink: 0, userSelect: 'none' }}>
                {line.oldNum ?? ''}
              </span>
              <span style={{ width: '36px', textAlign: 'right', color: 'var(--text-muted)', opacity: 0.5, paddingRight: '8px', flexShrink: 0, userSelect: 'none' }}>
                {line.newNum ?? ''}
              </span>
              <span style={{ color, whiteSpace: 'pre' }}>{prefix}{line.text || '\u00a0'}</span>
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 12px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
        Git Diff
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>}
        {error && <div style={{ fontSize: '12px', color: 'var(--error-text)' }}>{error}</div>}
        {!loading && !error && renderDiff(diff)}
      </div>
    </div>
  );
}

// ─── FileContentViewer ────────────────────────────────────────────────────────

function FileContentViewer({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const { apiBase } = useApiBase();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const highlighter = useSyntaxHighlighter();

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/api/coding/files/content?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setContent(json.data?.content ?? json.data ?? ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, filePath]);

  const highlighted = useMemo(() => {
    if (!content || !highlighter.ready) return null;
    const lang = langFromFilePath(filePath);
    return highlighter.highlight(content, lang);
  }, [content, highlighter.ready, highlighter, filePath]);

  const detectedLang = langFromFilePath(filePath);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {filePath.split('/').pop()}
          </span>
          {detectedLang && (
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '3px', padding: '1px 5px' }}>
              {detectedLang}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading
          ? <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>
          : highlighted
            ? <div
                style={{ fontSize: '11px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            : <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{content}</pre>
        }
      </div>
    </div>
  );
}

// ─── CodingLayout ─────────────────────────────────────────────────────────────

const MIN_TERMINAL_H = 80;
const MAX_TERMINAL_H = 600;
const DEFAULT_TERMINAL_H = 200;
const TERMINAL_STORAGE_KEY = 'coding-terminal-state';

export function CodingLayout({
  projectSlug: _projectSlug,
  layoutSlug: _layoutSlug,
  config,
}: {
  projectSlug: string;
  layoutSlug: string;
  config: Record<string, unknown>;
}) {
  const workingDir = (config.workingDirectory as string | undefined) ?? '';
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Dock mode preference — coding layout defaults to right-split
  useDockModePreference('coding', 'right');

  // Terminal state — persisted in sessionStorage
  const [terminalHeight, setTerminalHeight] = useState(() => {
    try { return Number(sessionStorage.getItem(`${TERMINAL_STORAGE_KEY}:height`)) || DEFAULT_TERMINAL_H; } catch { return DEFAULT_TERMINAL_H; }
  });
  const [terminalOpen, setTerminalOpen] = useState(() => {
    try { return sessionStorage.getItem(`${TERMINAL_STORAGE_KEY}:open`) !== 'false'; } catch { return false; }
  });
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // Persist terminal state
  useEffect(() => {
    try {
      sessionStorage.setItem(`${TERMINAL_STORAGE_KEY}:open`, String(terminalOpen));
      sessionStorage.setItem(`${TERMINAL_STORAGE_KEY}:height`, String(terminalHeight));
    } catch { /* ignore */ }
  }, [terminalOpen, terminalHeight]);

  // Ctrl+J toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setTerminalOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Drag resize
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setTerminalHeight(Math.min(MAX_TERMINAL_H, Math.max(MIN_TERMINAL_H, startH.current + (startY.current - ev.clientY))));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const layoutClass = `coding-layout ${terminalOpen ? 'coding-layout--terminal-open' : 'coding-layout--terminal-closed'}`;
  const cssVars = terminalOpen ? { '--coding-terminal-height': `${terminalHeight}px` } as React.CSSProperties : undefined;

  return (
    <div className={layoutClass} style={cssVars}>
      {/* File Tree */}
      <div className="coding-layout__tree">
        <FileTreePanel workingDir={workingDir} onFileSelect={setSelectedFile} />
      </div>

      {/* Diff / File Content Panel */}
      <div className="coding-layout__main">
        {selectedFile
          ? <FileContentViewer filePath={selectedFile} onClose={() => setSelectedFile(null)} />
          : <DiffPanel workingDir={workingDir} />
        }
      </div>

      {/* Terminal */}
      <div className="coding-layout__terminal">
        <div
          className="coding-layout__drag-handle"
          onMouseDown={terminalOpen ? onDragStart : undefined}
          onDoubleClick={() => setTerminalOpen(o => !o)}
        >
          <div className="coding-layout__drag-grip" />
        </div>
        <div className="coding-layout__terminal-bar">
          <span className="coding-layout__terminal-label">Terminal</span>
          <button
            type="button"
            className="coding-layout__terminal-toggle"
            onClick={() => setTerminalOpen(o => !o)}
            title={`${terminalOpen ? 'Hide' : 'Show'} terminal (Ctrl+J)`}
          >
            {terminalOpen ? '▾ Hide' : '▴ Show'} <span className="coding-layout__terminal-shortcut">⌃J</span>
          </button>
        </div>
        {terminalOpen && (
          <div className="coding-layout__terminal-body">
            <TerminalPanel projectSlug={_projectSlug} workingDir={workingDir} />
          </div>
        )}
      </div>
    </div>
  );
}
