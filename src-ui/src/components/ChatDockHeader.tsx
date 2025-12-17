import React from 'react';

interface Session {
  id: string;
  title: string;
  status: string;
}

interface ChatDockHeaderProps {
  isDockOpen: boolean;
  isDockMaximized: boolean;
  sessions: Session[];
  unreadCount: number;
  toggleDockShortcut: string;
  maximizeShortcut: string;
  dockHeight: number;
  previousDockHeight: number;
  previousDockOpen: boolean;
  setDockHeight: (h: number) => void;
  setPreviousDockHeight: (h: number) => void;
  setPreviousDockOpen: (o: boolean) => void;
  setDockState: (open: boolean, maximized: boolean) => void;
  setShowChatSettings: (fn: (prev: boolean) => boolean) => void;
  focusSession: (id: string) => void;
}

export function ChatDockHeader({
  isDockOpen, isDockMaximized, sessions, unreadCount,
  toggleDockShortcut, maximizeShortcut,
  dockHeight, previousDockHeight, previousDockOpen,
  setDockHeight, setPreviousDockHeight, setPreviousDockOpen,
  setDockState, setShowChatSettings, focusSession,
}: ChatDockHeaderProps) {
  const activeSessions = sessions.filter(s => s.status === 'sending');

  const handleHeaderClick = () => {
    if (isDockMaximized) {
      setDockHeight(previousDockHeight);
      setDockState(!isDockOpen, false);
    } else {
      setDockState(!isDockOpen, false);
    }
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDockMaximized) {
      setDockHeight(previousDockHeight);
      setDockState(previousDockOpen, false);
    } else {
      const toolbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--app-toolbar-height'));
      setPreviousDockHeight(dockHeight);
      setPreviousDockOpen(isDockOpen);
      setDockHeight(window.innerHeight - toolbarHeight);
      setDockState(true, true);
    }
  };

  return (
    <div className={`chat-dock__header ${isDockMaximized ? 'is-maximized' : ''}`} onClick={handleHeaderClick}>
      <div className="chat-dock__title">
        <span>Chat Dock</span>
        <span className="chat-dock__subtitle">{toggleDockShortcut}</span>
        <button className="chat-dock__icon-btn" onClick={(e) => { e.stopPropagation(); setShowChatSettings(prev => !prev); }} title="Chat settings">
          <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      <div className="chat-dock__header-actions" onClick={(e) => e.stopPropagation()}>
        {activeSessions.length > 0 && (
          <div className="chat-dock__activity">
            <button className="chat-dock__activity-btn">
              <span className="loading-dots"><span>●</span><span>●</span><span>●</span></span>
              {activeSessions.length}
            </button>
            <div className="chat-dock__activity-dropdown">
              {activeSessions.map(session => {
                const idx = sessions.findIndex(s => s.id === session.id);
                return (
                  <button key={session.id} className="chat-dock__activity-item" onClick={() => focusSession(session.id)}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</span>
                    {idx < 9 && <span className="chat-dock__subtitle">⌘{idx + 1}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <span className="chat-dock__counter">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
        {unreadCount > 0 && <span className="chat-dock__badge">{unreadCount}</span>}
        <button className="chat-dock__maximize-btn" onClick={handleMaximize} title={isDockMaximized ? `Restore (${maximizeShortcut})` : `Maximize (${maximizeShortcut})`}>
          {isDockMaximized ? '⬇' : '⬆'}
          <span className="chat-dock__subtitle">{maximizeShortcut}</span>
        </button>
        <button className="chat-dock__icon-btn" onClick={(e) => { e.stopPropagation(); setDockState(!isDockOpen, isDockMaximized); }} title={!isDockOpen ? 'Expand' : 'Collapse'}>
          <svg style={{ width: '16px', height: '16px', transform: isDockOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
