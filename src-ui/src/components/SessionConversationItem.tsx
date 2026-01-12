import type { RefObject } from 'react';

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

interface SessionConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  hasActiveChat: boolean;
  isRenaming: boolean;
  newTitle: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onTitleChange: (value: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getShortId(conversationId: string): string {
  return conversationId.slice(-6);
}

export function SessionConversationItem({
  conversation: conv,
  isActive,
  hasActiveChat,
  isRenaming,
  newTitle,
  inputRef,
  onSelect,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
  onTitleChange,
}: SessionConversationItemProps) {
  const contextPct = conv.metadata?.stats?.contextWindowPercentage;

  if (isRenaming) {
    return (
      <div className={`session-item ${isActive ? 'is-active' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          className="session-item__rename-input"
          value={newTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={onRename}
        />
      </div>
    );
  }

  return (
    <div className={`session-item ${isActive ? 'is-active' : ''}`}>
      <div className="session-item__content" onClick={onSelect}>
        <div className="session-item__title-row">
          {hasActiveChat && <span className="session-item__active-dot">●</span>}
          <span>
            {conv.title || 'Untitled'}
            {' '}
            <span className="session-item__id">{getShortId(conv.id)}</span>
          </span>
        </div>
        <div className="session-item__meta">
          <span>{conv.agentName || conv.agentSlug}</span>
          {conv.metadata?.stats?.turns && (
            <>
              <span>•</span>
              <span>{conv.metadata.stats.turns} messages</span>
            </>
          )}
        </div>
        {contextPct !== undefined && (
          <div className="session-item__context">
            <span>Context:</span>
            <div className="session-item__context-bar">
              <div
                className="session-item__context-fill"
                style={{
                  width: `${Math.min(contextPct, 100)}%`,
                  background: contextPct > 80 ? '#ef4444' : contextPct > 50 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
            <span>{contextPct.toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="session-item__date">{formatDate(conv.updatedAt)}</div>
      <div className="session-item__actions">
        <button
          className="session-item__action-btn"
          onClick={(e) => { e.stopPropagation(); onStartRename(); }}
          title="Rename"
        >
          ✎
        </button>
        <button
          className="session-item__action-btn session-item__action-btn--delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
