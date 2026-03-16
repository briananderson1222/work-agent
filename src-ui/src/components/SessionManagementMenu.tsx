import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useSessionManagementMenu } from '../hooks/useSessionManagementMenu';
import { useSessionManagementViewModel } from '../hooks/useSessionManagementViewModel';
import { ConfirmModal } from './ConfirmModal';
import { SessionConversationItem } from './SessionConversationItem';
import { SessionManagementPanel } from './SessionManagementPanel';

interface Conversation {
  id: string;
  agentSlug: string;
  agentName?: string;
  title?: string;
  updatedAt: string;
  metadata?: {
    stats?: {
      turns?: number;
      totalTokens?: number;
      contextWindowPercentage?: number;
    };
  };
}

interface Session {
  id: string;
  conversationId: string;
  agentSlug: string;
  agentName: string;
  title: string;
}

interface SessionManagementMenuProps {
  sessions: Session[];
  activeSessionId: string | null;
  agents: Array<{ slug: string; name: string }>;
  chatDockRef: React.RefObject<HTMLDivElement>;
  onTitleUpdate: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
  onSelect: (sessionId: string) => void;
  onOpenConversation: (conversationId: string, agentSlug: string) => void;
}

export function SessionManagementMenu({
  sessions,
  activeSessionId,
  agents,
  chatDockRef,
  onTitleUpdate,
  onDelete,
  onSelect,
  onOpenConversation,
}: SessionManagementMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { dockMode } = useNavigation();
  const [panelBounds, setPanelBounds] = useState({
    top: 0,
    bottom: 0,
    left: 0,
  });

  const menu = useSessionManagementMenu({
    sessions,
    agents,
    onTitleUpdate,
    onDelete,
  });

  // Dismiss conversation history when dock mode changes
  useEffect(() => {
    if (menu.isOpen) menu.setIsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockMode]);

  const { conversations, loading } = useSessionManagementViewModel(
    agents,
    menu.isOpen,
  );

  useEffect(() => {
    if (menu.isOpen && chatDockRef.current) {
      const rect = chatDockRef.current.getBoundingClientRect();
      setPanelBounds({
        top: rect.top + 43,
        bottom: rect.bottom,
        left: rect.left,
      });
    }
  }, [menu.isOpen, chatDockRef]);

  const handleSelectConversation = (conv: Conversation) => {
    const existingSession = sessions.find((s) => s.conversationId === conv.id);
    if (existingSession) {
      onSelect(existingSession.id);
    } else {
      onOpenConversation(conv.id, conv.agentSlug);
    }
    menu.setIsOpen(false);
  };

  return (
    <div
      ref={menuRef}
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
    >
      <button
        className="session-menu__trigger"
        onClick={() => menu.setIsOpen(!menu.isOpen)}
        title="Manage conversations"
      >
        ☰
      </button>

      <ConfirmModal
        isOpen={!!menu.deleteConfirm}
        title="Delete Conversation"
        message={`Delete "${menu.deleteConfirm?.conv.title || 'this conversation'}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={menu.confirmDelete}
        onCancel={menu.cancelDelete}
      />

      <ConfirmModal
        isOpen={menu.showClearAllConfirm}
        title="Clear All Conversations"
        message={`Delete all ${conversations.length} conversations? This cannot be undone.`}
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => menu.clearAll(conversations)}
        onCancel={() => menu.setShowClearAllConfirm(false)}
      />

      {menu.isOpen && (
        <>
          <div
            className="session-menu__backdrop"
            onClick={() => {
              if (!menu.deleteConfirm && !menu.renamingId) {
                menu.setIsOpen(false);
              }
            }}
          />

          <SessionManagementPanel
            bounds={panelBounds}
            conversationCount={conversations.length}
            onClose={() => menu.setIsOpen(false)}
            onClearAll={() => menu.setShowClearAllConfirm(true)}
          >
            {loading ? (
              <div className="session-panel__empty">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="session-panel__empty">No conversations yet</div>
            ) : (
              conversations.map((conv) => (
                <SessionConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={sessions.some(
                    (s) =>
                      s.conversationId === conv.id && s.id === activeSessionId,
                  )}
                  hasActiveChat={sessions.some(
                    (s) => s.conversationId === conv.id,
                  )}
                  isRenaming={menu.renamingId === conv.id}
                  newTitle={menu.newTitle}
                  inputRef={menu.inputRef}
                  onSelect={() => handleSelectConversation(conv)}
                  onStartRename={() => menu.startRename(conv)}
                  onRename={() => menu.handleRename(conv)}
                  onCancelRename={menu.cancelRename}
                  onDelete={() => menu.handleDelete(conv)}
                  onTitleChange={menu.setNewTitle}
                />
              ))
            )}
          </SessionManagementPanel>
        </>
      )}
    </div>
  );
}
