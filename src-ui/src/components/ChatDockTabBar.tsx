import { type RefObject, useEffect, useRef, useState } from 'react';
import { type AgentData, useAgents } from '../contexts/AgentsContext';
import { useModels } from '../contexts/ModelsContext';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import type { ChatSession } from '../types';
import { SessionManagementMenu } from './SessionManagementMenu';
import { SessionTab } from './SessionTab';

interface ChatDockTabBarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  chatDockRef: RefObject<HTMLDivElement | null>;
  focusSession: (id: string) => void;
  removeSession: (id: string) => void;
  openConversation: (conversationId: string, agentSlug: string, projectSlug?: string, projectName?: string) => void;
  openChatForAgent: (
    agent: AgentData,
    projectSlug?: string,
    projectName?: string,
  ) => void;
  updateChat: (id: string, updates: { title?: string }) => void;
  setShowSessionPicker: (show: boolean) => void;
  setShowNewChatModal: (show: boolean) => void;
  projects: Array<{ slug: string; name: string; icon?: string }>;
  projectFilter: string | null;
  setProjectFilter: (filter: string | null) => void;
  selectedProject: string | null;
}

export function ChatDockTabBar({
  sessions,
  activeSessionId,
  chatDockRef,
  focusSession,
  removeSession,
  openConversation,
  openChatForAgent,
  updateChat,
  setShowSessionPicker,
  setShowNewChatModal,
}: ChatDockTabBarProps) {
  const agents = useAgents();
  const availableModels = useModels();
  const closeTabShortcut = useShortcutDisplay('dock.closeTab');
  const newChatShortcut = useShortcutDisplay('dock.newChat');
  const openConversationShortcut = useShortcutDisplay('dock.openConversation');

  const tabListRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState({
    left: false,
    right: false,
  });

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
  }, []);

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
          sessions={sessions.filter((s) => s.conversationId) as any[]}
          activeSessionId={activeSessionId}
          agents={agents}
          chatDockRef={chatDockRef as any}
          onTitleUpdate={(sessionId, title) => updateChat(sessionId, { title })}
          onDelete={removeSession}
          onSelect={focusSession}
          onOpenConversation={openConversation}
        />
        {showScrollButtons.left && (
          <button
            type="button"
            className="chat-dock__scroll-btn chat-dock__scroll-btn--left"
            onClick={() =>
              tabListRef.current?.scrollBy({ left: -200, behavior: 'smooth' })
            }
          >
            ←
          </button>
        )}
        <div
          className="chat-dock__tab-list"
          ref={tabListRef}
          onScroll={handleScroll}
        >
          {sessions.map((session, idx) => (
            <SessionTab
              key={session.id}
              session={session}
              index={idx}
              isActive={session.id === activeSessionId}
              agent={agents.find((a) => a.slug === session.agentSlug)}
              availableModels={availableModels}
              closeTabShortcut={closeTabShortcut}
              onFocus={() => focusSession(session.id)}
              onRemove={() => removeSession(session.id)}
            />
          ))}
        </div>
        {showScrollButtons.right && (
          <button
            type="button"
            className="chat-dock__scroll-btn chat-dock__scroll-btn--right"
            onClick={() =>
              tabListRef.current?.scrollBy({ left: 200, behavior: 'smooth' })
            }
          >
            →
          </button>
        )}
      </div>
      <div className="chat-dock__tab-actions">
        <button
          type="button"
          className="chat-dock__new"
          onClick={() => setShowSessionPicker(true)}
          title={`Open Conversation (${openConversationShortcut})`}
        >
          <svg className="chat-dock__new-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="chat-dock__new-label">Open</span>
          <span className="chat-dock__subtitle">
            {openConversationShortcut}
          </span>
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
          <svg className="chat-dock__new-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span className="chat-dock__new-label">New</span>
          <span className="chat-dock__subtitle">{newChatShortcut}</span>
        </button>
      </div>
    </div>
  );
}
