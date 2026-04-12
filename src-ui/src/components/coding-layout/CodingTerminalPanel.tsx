import { ACPChatPanel } from '../ACPChatPanel';
import { TerminalPanel } from '../TerminalPanel';
import type { TerminalTab } from './types';

export function CodingTerminalPanel({
  terminalOpen,
  tabs,
  activeTabId,
  editingTabId,
  onDragStart,
  onToggleOpen,
  onSelectTab,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onCloseTab,
  onToggleTabMode,
  canTogglePTY,
  onOpenNewTerminal,
  projectSlug,
  workingDir,
}: {
  terminalOpen: boolean;
  tabs: TerminalTab[];
  activeTabId: string;
  editingTabId: string | null;
  onDragStart: (event: React.MouseEvent) => void;
  onToggleOpen: () => void;
  onSelectTab: (id: string) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, label: string) => void;
  onCancelRename: () => void;
  onCloseTab: (id: string) => void;
  onToggleTabMode: (id: string) => void;
  canTogglePTY: (tab: TerminalTab) => boolean;
  onOpenNewTerminal: () => void;
  projectSlug: string;
  workingDir: string;
}) {
  return (
    <div className="coding-layout__terminal">
      <div
        className="coding-layout__drag-handle"
        onMouseDown={terminalOpen ? onDragStart : undefined}
        onDoubleClick={onToggleOpen}
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
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="coding-layout__terminal-tab-icon">
                {tab.type === 'agent' ? '🤖' : '>'}
              </span>
              {tab.type === 'agent' && canTogglePTY(tab) && (
                <span
                  className="coding-layout__terminal-tab-toggle"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTabMode(tab.id);
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
                  onBlur={(event) => onFinishRename(tab.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onFinishRename(
                        tab.id,
                        (event.target as HTMLInputElement).value,
                      );
                    }
                    if (event.key === 'Escape') {
                      onCancelRename();
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <span
                  className="coding-layout__terminal-tab-label"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onStartRename(tab.id);
                  }}
                >
                  {tab.label}
                </span>
              )}
              <span
                className="coding-layout__terminal-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            className="coding-layout__terminal-tab-add"
            onClick={onOpenNewTerminal}
            title="New terminal"
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="coding-layout__terminal-toggle"
          onClick={onToggleOpen}
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
              <span className="coding-layout__terminal-empty-icon">{'>_'}</span>
              <p>No active terminals</p>
              <button type="button" onClick={onOpenNewTerminal}>
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
              {tab.type === 'agent' && tab.mode === 'chat' && tab.agentSlug ? (
                <ACPChatPanel
                  projectSlug={projectSlug}
                  agentSlug={tab.agentSlug}
                  tabId={tab.id}
                />
              ) : (
                <TerminalPanel
                  projectSlug={projectSlug}
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
  );
}
