import { useSessionManagementMenu } from '../hooks/useSessionManagementMenu';
import { useSessionManagementViewModel } from '../hooks/useSessionManagementViewModel';
import { ConfirmModal } from './ConfirmModal';
import { SessionConversationItem } from './SessionConversationItem';

interface Session {
  id: string;
  conversationId: string;
  agentSlug: string;
  agentName: string;
  title: string;
}

interface ConversationHistoryProps {
  sessions: Session[];
  activeSessionId: string | null;
  agents: Array<{ slug: string; name: string }>;
  onTitleUpdate: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
  onSelect: (sessionId: string) => void;
  onOpenConversation: (conversationId: string, agentSlug: string) => void;
  onClose: () => void;
}

export function ConversationHistory({
  sessions,
  activeSessionId,
  agents,
  onTitleUpdate,
  onDelete,
  onSelect,
  onOpenConversation,
  onClose,
}: ConversationHistoryProps) {
  const menu = useSessionManagementMenu({
    sessions,
    agents,
    onTitleUpdate,
    onDelete,
  });

  const { conversations, loading } = useSessionManagementViewModel(
    agents,
    true,
  );

  const handleSelectConversation = (conv: { id: string; agentSlug: string }) => {
    const existing = sessions.find((s) => s.conversationId === conv.id);
    if (existing) {
      onSelect(existing.id);
    } else {
      onOpenConversation(conv.id, conv.agentSlug);
    }
    onClose();
  };

  return (
    <div className="conversation-history">
      <div className="conversation-history__header">
        <span className="conversation-history__title">
          History ({conversations.length})
        </span>
        <div className="conversation-history__actions">
          {conversations.length > 0 && (
            <button
              className="conversation-history__clear-btn"
              onClick={() => menu.setShowClearAllConfirm(true)}
            >
              Clear All
            </button>
          )}
          <button className="conversation-history__close-btn" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="conversation-history__list">
        {loading ? (
          <div className="conversation-history__empty">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="conversation-history__empty">
            No conversations yet
          </div>
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
      </div>

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
    </div>
  );
}
