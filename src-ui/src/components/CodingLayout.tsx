import React, { useEffect, useRef, useState } from 'react';
import {
  type ACPConnectionInfo,
  useACPConnections,
} from '../hooks/useACPConnections';
import { useDockModePreference } from '../hooks/useDockModePreference';
import './CodingLayout.css';
import { CodingTerminalPanel } from './coding-layout/CodingTerminalPanel';
import { DiffPanel } from './coding-layout/DiffPanel';
import { FileContentViewer } from './coding-layout/FileContentViewer';
import { FileTreePanel } from './coding-layout/FileTreePanel';
import { NewTerminalModal } from './coding-layout/NewTerminalModal';
import type { TerminalTab } from './coding-layout/types';

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
            (connection: ACPConnectionInfo) => connection.id === t.connectionId,
          );
          if (conn?.interactive?.args) {
            updated.shell = conn.command;
            updated.shellArgs = conn.interactive.args.map((arg) =>
              arg === '{agent}' ? t.agentMode || t.agentSlug! : arg,
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
      (connection: ACPConnectionInfo) => connection.id === tab.connectionId,
    );
    return !!conn?.interactive;
  };

  // ACP agents for terminal new-tab modal
  const { data: acpConnections } = useACPConnections();
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
      <CodingTerminalPanel
        terminalOpen={terminalOpen}
        tabs={tabs}
        activeTabId={activeTabId}
        editingTabId={editingTabId}
        onDragStart={onDragStart}
        onToggleOpen={() => setTerminalOpen((open) => !open)}
        onSelectTab={setActiveTabId}
        onStartRename={setEditingTabId}
        onFinishRename={(id, label) => {
          renameTab(id, label);
          setEditingTabId(null);
        }}
        onCancelRename={() => setEditingTabId(null)}
        onCloseTab={closeTab}
        onToggleTabMode={toggleTabMode}
        canTogglePTY={canTogglePTY}
        onOpenNewTerminal={() => setShowNewTerminal(true)}
        projectSlug={_projectSlug}
        workingDir={workingDir}
      />
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
