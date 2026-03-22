import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import {
  langFromFilePath,
  useSyntaxHighlighter,
} from '../contexts/SyntaxHighlighterContext';
import { useDockModePreference } from '../hooks/useDockModePreference';
import {
  getRecentAgentSlugs,
  trackRecentAgent,
} from '../hooks/useRecentAgents';
import './CodingLayout.css';
import { ACPChatPanel } from './ACPChatPanel';
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
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
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

function FileTreePanel({
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
  } = useQuery<FileEntry[]>({
    queryKey: ['coding-files', workingDir],
    queryFn: async () => {
      const r = await fetch(
        `${apiBase}/api/coding/files?path=${encodeURIComponent(workingDir)}`,
      );
      const json = await r.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load files');
      return json.data ?? [];
    },
    enabled: !!workingDir,
  });
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

// ─── DiffPanel ────────────────────────────────────────────────────────────────

function DiffPanel({ workingDir }: { workingDir: string }) {
  const { apiBase } = useApiBase();
  const {
    data: diff = '',
    isLoading: loading,
    error: queryError,
  } = useQuery<string>({
    queryKey: ['coding-diff', workingDir],
    queryFn: async () => {
      const r = await fetch(
        `${apiBase}/api/coding/git/diff?path=${encodeURIComponent(workingDir)}`,
      );
      const json = await r.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load diff');
      return json.data?.diff ?? json.data ?? '';
    },
    enabled: !!workingDir,
  });
  const error = queryError?.message || null;

  const renderDiff = (text: string) => {
    if (!text)
      return (
        <div
          style={{
            padding: '12px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          No changes
        </div>
      );

    // Parse into hunks for structured rendering
    const hunks: Array<{
      header: string;
      lines: Array<{
        text: string;
        type: 'add' | 'remove' | 'context' | 'header' | 'meta';
        oldNum?: number;
        newNum?: number;
      }>;
    }> = [];
    let currentHunk: (typeof hunks)[0] | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const raw of text.split('\n')) {
      if (raw.startsWith('@@')) {
        const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        oldLine = match ? parseInt(match[1], 10) : 0;
        newLine = match ? parseInt(match[2], 10) : 0;
        currentHunk = { header: raw, lines: [] };
        hunks.push(currentHunk);
      } else if (
        raw.startsWith('diff ') ||
        raw.startsWith('index ') ||
        raw.startsWith('---') ||
        raw.startsWith('+++')
      ) {
        if (!currentHunk) {
          currentHunk = { header: '', lines: [] };
          hunks.push(currentHunk);
        }
        currentHunk.lines.push({ text: raw, type: 'meta' });
      } else if (currentHunk) {
        if (raw.startsWith('+')) {
          currentHunk.lines.push({
            text: raw.slice(1),
            type: 'add',
            newNum: newLine++,
          });
        } else if (raw.startsWith('-')) {
          currentHunk.lines.push({
            text: raw.slice(1),
            type: 'remove',
            oldNum: oldLine++,
          });
        } else {
          currentHunk.lines.push({
            text: raw.slice(1) || raw,
            type: 'context',
            oldNum: oldLine++,
            newNum: newLine++,
          });
        }
      }
    }

    return hunks.map((hunk, hi) => (
      <div key={hi} style={{ marginBottom: '8px' }}>
        {hunk.header && (
          <div
            style={{
              color: '#2196f3',
              fontFamily: 'monospace',
              fontSize: '11px',
              padding: '4px 8px',
              background: 'rgba(33,150,243,0.08)',
              borderRadius: '3px',
              marginBottom: '2px',
            }}
          >
            {hunk.header}
          </div>
        )}
        {hunk.lines.map((line, li) => {
          const bg =
            line.type === 'add'
              ? 'rgba(76,175,80,0.1)'
              : line.type === 'remove'
                ? 'rgba(244,67,54,0.1)'
                : 'transparent';
          const color =
            line.type === 'add'
              ? '#4caf50'
              : line.type === 'remove'
                ? '#f44336'
                : line.type === 'meta'
                  ? 'var(--text-muted)'
                  : 'var(--text-secondary)';
          const prefix =
            line.type === 'add'
              ? '+'
              : line.type === 'remove'
                ? '-'
                : line.type === 'meta'
                  ? ''
                  : ' ';
          return (
            <div
              key={li}
              style={{
                display: 'flex',
                fontFamily: 'monospace',
                fontSize: '11px',
                lineHeight: '1.6',
                background: bg,
              }}
            >
              <span
                style={{
                  width: '36px',
                  textAlign: 'right',
                  color: 'var(--text-muted)',
                  opacity: 0.5,
                  paddingRight: '4px',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {line.oldNum ?? ''}
              </span>
              <span
                style={{
                  width: '36px',
                  textAlign: 'right',
                  color: 'var(--text-muted)',
                  opacity: 0.5,
                  paddingRight: '8px',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {line.newNum ?? ''}
              </span>
              <span style={{ color, whiteSpace: 'pre' }}>
                {prefix}
                {line.text || '\u00a0'}
              </span>
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '6px 12px 4px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        Git Diff
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ fontSize: '12px', color: 'var(--error-text)' }}>
            {error}
          </div>
        )}
        {!loading && !error && renderDiff(diff)}
      </div>
    </div>
  );
}

// ─── FileContentViewer ────────────────────────────────────────────────────────

function FileContentViewer({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose: () => void;
}) {
  const { apiBase } = useApiBase();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const highlighter = useSyntaxHighlighter();

  useEffect(() => {
    setLoading(true);
    fetch(
      `${apiBase}/api/coding/files/content?path=${encodeURIComponent(filePath)}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setContent(json.data?.content ?? json.data ?? '');
      })
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px 4px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {filePath.split('/').pop()}
          </span>
          {detectedLang && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: '3px',
                padding: '1px 5px',
              }}
            >
              {detectedLang}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : highlighted ? (
          <div
            style={{ fontSize: '11px', lineHeight: '1.6' }}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(highlighted),
            }}
          />
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── CodingLayout ─────────────────────────────────────────────────────────────

interface TerminalTab {
  id: string;
  type: 'shell' | 'agent';
  label: string;
  mode?: 'chat' | 'terminal'; // agent tabs: 'chat' (default) or 'terminal' (PTY)
  agentSlug?: string; // for agent tabs: full slug (e.g., 'kiro-dev') for API calls
  agentMode?: string; // for agent tabs: mode name (e.g., 'dev') for PTY launch
  connectionId?: string; // for agent tabs: which ACP connection
  shell?: string;
  shellArgs?: string[];
}

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
  const { apiBase: API_BASE } = useApiBase();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Dock mode preference — coding layout defaults to right-split
  useDockModePreference('coding', 'right');

  // Terminal state — persisted in sessionStorage
  const [terminalHeight, setTerminalHeight] = useState(() => {
    try {
      return (
        Number(sessionStorage.getItem(`${TERMINAL_STORAGE_KEY}:height`)) ||
        DEFAULT_TERMINAL_H
      );
    } catch {
      return DEFAULT_TERMINAL_H;
    }
  });
  const [terminalOpen, setTerminalOpen] = useState(() => {
    try {
      return sessionStorage.getItem(`${TERMINAL_STORAGE_KEY}:open`) !== 'false';
    } catch {
      return false;
    }
  });
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // Persist terminal state
  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${TERMINAL_STORAGE_KEY}:open`,
        String(terminalOpen),
      );
      sessionStorage.setItem(
        `${TERMINAL_STORAGE_KEY}:height`,
        String(terminalHeight),
      );
    } catch {
      /* ignore */
    }
  }, [terminalOpen, terminalHeight]);

  // Terminal tabs
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    try {
      const saved = sessionStorage.getItem('coding-terminal-tabs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      return sessionStorage.getItem('coding-terminal-active-tab') || '';
    } catch {
      return '';
    }
  });
  const shellCounter = useRef(
    Math.max(
      0,
      ...tabs
        .filter((t) => t.type === 'shell')
        .map((t) => {
          const m = t.label.match(/^Shell\s*(\d*)$/);
          return m ? parseInt(m[1] || '1', 10) : 0;
        }),
    ),
  );
  const _hasInitialized = useRef(tabs.length > 0);

  // Persist tabs
  useEffect(() => {
    try {
      sessionStorage.setItem('coding-terminal-tabs', JSON.stringify(tabs));
      sessionStorage.setItem('coding-terminal-active-tab', activeTabId);
    } catch {
      /* ignore */
    }
  }, [tabs, activeTabId]);

  const addTab = (
    type: 'shell' | 'agent',
    agentSlug?: string,
    connectionId?: string,
  ) => {
    const id = `term-${Date.now()}`;
    let label: string;
    const tab: TerminalTab = { id, type, label: '' };
    if (type === 'agent' && agentSlug) {
      // agentSlug is the full slug (e.g., 'kiro-dev'), mode is the suffix after connectionId
      const modeName =
        connectionId && agentSlug.startsWith(`${connectionId}-`)
          ? agentSlug.slice(connectionId.length + 1)
          : agentSlug;
      label = `Agent: ${modeName}`;
      tab.agentSlug = agentSlug;
      tab.agentMode = modeName;
      tab.connectionId = connectionId;
      tab.mode = 'chat';
    } else {
      shellCounter.current++;
      label = `Shell ${shellCounter.current}`;
    }
    tab.label = label;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId && next.length > 0) {
        const idx = prev.findIndex((t) => t.id === id);
        setActiveTabId(next[Math.max(0, idx - 1)]?.id || next[0].id);
      }
      if (next.length === 0) setActiveTabId('');
      return next;
    });
  };

  const renameTab = (id: string, newLabel: string) => {
    if (!newLabel.trim()) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, label: newLabel.trim() } : t)),
    );
  };

  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  /** Toggle agent tab between chat UI and PTY terminal mode */
  const toggleTabMode = (tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId || t.type !== 'agent') return t;
        const newMode = t.mode === 'terminal' ? 'chat' : 'terminal';
        const updated = { ...t, mode: newMode as 'chat' | 'terminal' };
        if (newMode === 'terminal' && t.agentSlug) {
          // Resolve PTY args from connection's interactive config
          const conn = (acpConnections || []).find(
            (c: any) => c.id === t.connectionId,
          );
          if (conn?.interactive?.args) {
            updated.shell = conn.command;
            updated.shellArgs = conn.interactive.args.map((a: string) =>
              a === '{agent}' ? t.agentMode || t.agentSlug! : a,
            );
          }
        }
        return updated;
      }),
    );
  };

  /** Check if a tab's connection supports PTY mode */
  const canTogglePTY = (tab: TerminalTab): boolean => {
    if (tab.type !== 'agent') return false;
    const conn = (acpConnections || []).find(
      (c: any) => c.id === tab.connectionId,
    );
    return !!conn?.interactive;
  };

  // ACP agents for terminal new-tab modal
  const { data: acpConnections } = useQuery({
    queryKey: ['acp', 'connections'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/acp/connections`);
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: 30_000,
  });
  const [showNewTerminal, setShowNewTerminal] = useState(false);

  // Ctrl+J toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setTerminalOpen((o) => !o);
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
      setTerminalHeight(
        Math.min(
          MAX_TERMINAL_H,
          Math.max(
            MIN_TERMINAL_H,
            startH.current + (startY.current - ev.clientY),
          ),
        ),
      );
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
  const cssVars = terminalOpen
    ? ({
        '--coding-terminal-height': `${terminalHeight}px`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={layoutClass} style={cssVars}>
      {/* File Tree */}
      <div className="coding-layout__tree">
        <FileTreePanel workingDir={workingDir} onFileSelect={setSelectedFile} />
      </div>

      {/* Diff / File Content Panel */}
      <div className="coding-layout__main">
        {selectedFile ? (
          <FileContentViewer
            filePath={selectedFile}
            onClose={() => setSelectedFile(null)}
          />
        ) : (
          <DiffPanel workingDir={workingDir} />
        )}
      </div>

      {/* Terminal */}
      <div className="coding-layout__terminal">
        <div
          className="coding-layout__drag-handle"
          onMouseDown={terminalOpen ? onDragStart : undefined}
          onDoubleClick={() => setTerminalOpen((o) => !o)}
        >
          <div className="coding-layout__drag-grip" />
        </div>
        <div className="coding-layout__terminal-bar">
          <div className="coding-layout__terminal-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`coding-layout__terminal-tab ${tab.id === activeTabId ? 'coding-layout__terminal-tab--active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className="coding-layout__terminal-tab-icon">
                  {tab.type === 'agent' ? '🤖' : '>'}
                </span>
                {tab.type === 'agent' && canTogglePTY(tab) && (
                  <span
                    className="coding-layout__terminal-tab-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTabMode(tab.id);
                    }}
                    title={
                      tab.mode === 'terminal'
                        ? 'Switch to Chat UI'
                        : 'Switch to Terminal'
                    }
                  >
                    {tab.mode === 'terminal' ? '💬' : '>_'}
                  </span>
                )}
                {editingTabId === tab.id ? (
                  <input
                    className="coding-layout__terminal-tab-rename"
                    defaultValue={tab.label}
                    autoFocus
                    onBlur={(e) => {
                      renameTab(tab.id, e.target.value);
                      setEditingTabId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameTab(tab.id, (e.target as HTMLInputElement).value);
                        setEditingTabId(null);
                      }
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="coding-layout__terminal-tab-label"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTabId(tab.id);
                    }}
                  >
                    {tab.label}
                  </span>
                )}
                <span
                  className="coding-layout__terminal-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              className="coding-layout__terminal-tab-add"
              onClick={() => {
                setShowNewTerminal(true);
              }}
              title="New terminal"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="coding-layout__terminal-toggle"
            onClick={() => setTerminalOpen((o) => !o)}
            title={`${terminalOpen ? 'Hide' : 'Show'} terminal (Ctrl+J)`}
          >
            {terminalOpen ? '▾ Hide' : '▴ Show'}{' '}
            <span className="coding-layout__terminal-shortcut">⌃J</span>
          </button>
        </div>
        <div
          className="coding-layout__terminal-body"
          style={terminalOpen ? undefined : { display: 'none' }}
        >
          {tabs.length === 0 ? (
            <div className="coding-layout__terminal-empty">
              <div className="coding-layout__terminal-empty-content">
                <span className="coding-layout__terminal-empty-icon">
                  {'>'}_
                </span>
                <p>No active terminals</p>
                <button type="button" onClick={() => setShowNewTerminal(true)}>
                  + New Terminal
                </button>
              </div>
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                style={{
                  display: tab.id === activeTabId ? 'contents' : 'none',
                }}
              >
                {tab.type === 'agent' &&
                tab.mode === 'chat' &&
                tab.agentSlug ? (
                  <ACPChatPanel
                    projectSlug={_projectSlug}
                    agentSlug={tab.agentSlug}
                    tabId={tab.id}
                  />
                ) : (
                  <TerminalPanel
                    projectSlug={_projectSlug}
                    workingDir={workingDir}
                    terminalId={tab.id}
                    shell={tab.shell}
                    shellArgs={tab.shellArgs}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {showNewTerminal && (
        <NewTerminalModal
          connections={acpConnections || []}
          onSelect={(type, slug, connectionId) => {
            addTab(type, slug, connectionId);
            setShowNewTerminal(false);
          }}
          onClose={() => setShowNewTerminal(false)}
        />
      )}
    </div>
  );
}

// ─── New Terminal Modal ───────────────────────────────────────────────────────

function NewTerminalModal({
  connections,
  onSelect,
  onClose,
}: {
  connections: any[];
  onSelect: (
    type: 'shell' | 'agent',
    slug?: string,
    connectionId?: string,
  ) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const connectedAgents = connections
    .filter((c: any) => c.status === 'available')
    .flatMap((c: any) =>
      (c.modes || []).map((mode: string) => ({
        id: `${c.id}-${mode}`,
        label: mode,
        connection: c.name || c.id,
        connectionId: c.id,
        slug: `${c.id}-${mode}`,
      })),
    );

  const lc = filter.toLowerCase();
  const items: Array<{
    key: string;
    type: 'shell' | 'agent';
    label: string;
    hint: string;
    slug?: string;
    connectionId?: string;
    section?: string;
  }> = [];
  if (!filter || 'shell'.includes(lc)) {
    items.push({
      key: 'shell',
      type: 'shell',
      label: 'Shell',
      hint: 'Default terminal',
    });
  }
  const recentSlugs = new Set(getRecentAgentSlugs());
  if (!filter) {
    for (const a of connectedAgents) {
      if (recentSlugs.has(a.slug)) {
        items.push({
          key: `recent-${a.id}`,
          type: 'agent',
          label: a.label,
          hint: `${a.connection} · Recent`,
          slug: a.slug,
          connectionId: a.connectionId,
          section: 'recent',
        });
      }
    }
  }
  for (const a of connectedAgents) {
    if (
      a.label.toLowerCase().includes(lc) ||
      a.connection.toLowerCase().includes(lc)
    ) {
      if (filter || !recentSlugs.has(a.slug)) {
        items.push({
          key: a.id,
          type: 'agent',
          label: a.label,
          hint: a.connection,
          slug: a.slug,
          connectionId: a.connectionId,
        });
      }
    }
  }

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIdx(0);
  }, []);

  const selectItem = (item: (typeof items)[0]) => {
    if (item.type === 'agent' && item.slug) trackRecentAgent(item.slug);
    onSelect(item.type, item.slug, item.connectionId);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && items[selectedIdx]) {
      selectItem(items[selectedIdx]);
      return;
    }
  };

  return (
    <div className="coding-layout__new-terminal-overlay" onClick={onClose}>
      <div
        className="coding-layout__new-terminal-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="coding-layout__new-terminal-filter"
          placeholder="Select terminal type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="coding-layout__new-terminal-list">
          {items.map((item, i) => {
            const prevItem = items[i - 1];
            const showRecentHeader =
              item.section === 'recent' && prevItem?.section !== 'recent';
            const showAllHeader =
              !item.section &&
              item.type === 'agent' &&
              prevItem?.section === 'recent';
            return (
              <React.Fragment key={item.key}>
                {showRecentHeader && (
                  <div className="coding-layout__new-terminal-section">
                    Recently Used
                  </div>
                )}
                {showAllHeader && (
                  <div className="coding-layout__new-terminal-section">
                    All Agents
                  </div>
                )}
                <button
                  type="button"
                  className={`coding-layout__new-terminal-option ${i === selectedIdx ? 'coding-layout__new-terminal-option--selected' : ''}`}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="coding-layout__new-terminal-icon">
                    {item.type === 'agent' ? '🤖' : '>_'}
                  </span>
                  <span>{item.label}</span>
                  <span className="coding-layout__new-terminal-hint">
                    {item.hint}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
          {items.length === 0 && (
            <div className="coding-layout__new-terminal-empty">No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}
