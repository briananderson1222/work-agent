import { useState, useCallback } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';

export function useQueuedMessages(sessionId: string | null) {
  const { removeQueuedMessage, editQueuedMessage, updateChat } = useActiveChatActions();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback((index: number, currentValue: string) => {
    if (!sessionId) return;
    setEditingIndex(index);
    setEditValue(currentValue);
    updateChat(sessionId, { isEditingQueue: true });
  }, [sessionId, updateChat]);

  const cancelEdit = useCallback(() => {
    if (!sessionId) return;
    setEditingIndex(null);
    setEditValue('');
    updateChat(sessionId, { isEditingQueue: false });
  }, [sessionId, updateChat]);

  const saveEdit = useCallback(() => {
    if (!sessionId || editingIndex === null) return;
    if (editValue.trim()) {
      editQueuedMessage(sessionId, editingIndex, editValue.trim());
    } else {
      removeQueuedMessage(sessionId, editingIndex);
    }
    setEditingIndex(null);
    setEditValue('');
    updateChat(sessionId, { isEditingQueue: false });
  }, [sessionId, editingIndex, editValue, editQueuedMessage, removeQueuedMessage, updateChat]);

  const remove = useCallback((index: number) => {
    if (!sessionId) return;
    removeQueuedMessage(sessionId, index);
  }, [sessionId, removeQueuedMessage]);

  return {
    editingIndex,
    editValue,
    setEditValue,
    startEdit,
    cancelEdit,
    saveEdit,
    remove,
  };
}
