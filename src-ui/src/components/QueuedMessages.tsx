import { useRef, useEffect } from 'react';
import { useQueuedMessages } from '../hooks/useQueuedMessages';

interface QueuedMessagesProps {
  sessionId: string;
  messages: string[];
}

export function QueuedMessages({ sessionId, messages }: QueuedMessagesProps) {
  const {
    editingIndex,
    editValue,
    setEditValue,
    startEdit,
    cancelEdit,
    saveEdit,
    remove,
  } = useQueuedMessages(sessionId);
  
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  if (messages.length === 0) return null;

  return (
    <div className="queued-messages">
      <div className="queued-messages__label">
        {messages.length} message{messages.length !== 1 ? 's' : ''} queued
      </div>
      <div className="queued-messages__list">
        {[...messages].reverse().map((msg, displayIdx) => {
          const idx = messages.length - 1 - displayIdx; // actual index in array
          const orderNum = idx + 1; // 1-based order (1 = next to send)
          return (
          <div key={idx} className="queued-message">
            <span className="queued-message__order">{orderNum}</span>
            {editingIndex === idx ? (
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={saveEdit}
                style={{
                  flex: 1,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            ) : (
              <>
                <span 
                  className="queued-message__text" 
                  title={msg}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {msg}
                </span>
                <button
                  onClick={() => startEdit(idx, msg)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      startEdit(idx, msg);
                    }
                  }}
                  className="queued-message__btn"
                  title="Edit (Enter)"
                  aria-label="Edit message"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      remove(idx);
                    }
                  }}
                  className="queued-message__btn queued-message__btn--danger"
                  title="Remove (Delete)"
                  aria-label="Remove message"
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
