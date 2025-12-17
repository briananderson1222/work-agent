import React, { useRef, useEffect, RefObject } from 'react';
import { SessionManagementMenu } from './SessionManagementMenu';
import { SessionTab } from './SessionTab';
import type { AgentSummary } from '../types';

interface Session {
  id: string;
  agentSlug: string;
  conversationId?: string;
}

interface Model {
  id: string;
  name: string;
}

interface ChatDockTabBarProps {
  sessions: Session[];
  activeSessionId: string | null;
  agents: AgentSummary[];
  availableModels: Model[];
  apiBase: string;
  chatDockRef: RefObject<HTMLDivElement>;
  closeTabShortcut: string;
  newChatShortcut: string;
  openConversationShortcut: string;
  focusSession: (id: string) => void;
  removeSession: (id: string) => void;
  openConversation: (conversationId: string, agentSlug: string) => void;
  openChatForAgent: (agent: AgentSummary) => void;
  updateChat: (id: string, updates: { title?: string }) => void;
  setShowSessionPicker: (show: boolean) => void;
  setShowNewChatModal: (show: boolean) => void;
}

export function ChatDockTabBar({
  sessions, activeSessionId, agents, availableModels, apiBase, chatDockRef,
  closeTabShortcut, newChatShortcut, openConversationShortcut,
  focusSession, removeSession, openConversation, openChatForAgent, updateChat,
  setShowSessionPicker, setShowNewChatModal,
}: ChatDockTabBarProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = React.useState({ left: false, right: false });

  useEffect(() => {
    const checkScroll = () => {
      if (tabListRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
        setShowScrollButtons({
          left: scrollLeft > 0,
          right: scrollLeft < scrollWidth - clientWidth - 1,
        });
      }
    };
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [sessions.length]);

  const handleScroll = () => {
    if (tabListRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
      setShowScrollButtons({
        left: scrollLeft > 0,
        right: scrollLeft < scrollWidth - clientWidth - 1,
      });
    }
  };

  return (
    <div className="chat-dock__tabs">
      <div className="chat-dock__tab-container">
        <SessionManagementMenu
          sessions={sessions.filter(s => s.conversationId)}
          activeSessionId={activeSessionId}
          apiBase={apiBase}
          agents={agents}
          chatDockRef={chatDockRef}
          onTitleUpdate={(sessionId, title) => updateChat(sessionId, { title })}
          onDelete={removeSession}
          onSelect={focusSession}
          onOpenConversation={openConversation}
        />
        {showScrollButtons.left && (
          <button type="button" className="chat-dock__scroll-btn chat-dock__scroll-btn--left" onClick={() => tabListRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}>←</button>
        )}
        <div className="chat-dock__tab-list" ref={tabListRef} onScroll={handleScroll}>
          {sessions.map((session, idx) => (
            <SessionTab
              key={session.id}
              session={session}
              index={idx}
              isActive={session.id === activeSessionId}
              agent={agents.find(a => a.slug === session.agentSlug)}
              availableModels={availableModels}
              closeTabShortcut={closeTabShortcut}
              onFocus={() => focusSession(session.id)}
              onRemove={() => removeSession(session.id)}
            />
          ))}
        </div>
        {showScrollButtons.right && (
          <button type="button" className="chat-dock__scroll-btn chat-dock__scroll-btn--right" onClick={() => tabListRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}>→</button>
        )}
      </div>
      <div className="chat-dock__tab-actions">
        <button type="button" className="chat-dock__new" onClick={() => setShowSessionPicker(true)} title={`Open Conversation (${openConversationShortcut})`}>
          Open <span className="chat-dock__subtitle">{openConversationShortcut}</span>
        </button>
        <button
          type="button"
          className="chat-dock__new"
          onClick={() => {
            if (agents.length === 1) {
              openChatForAgent(agents[0]);
            } else {
              setShowNewChatModal(true);
            }
          }}
          title={`New Chat (${newChatShortcut})`}
        >
          + New <span className="chat-dock__subtitle">{newChatShortcut}</span>
        </button>
      </div>
    </div>
  );
}
