import {
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from '@stallion-ai/sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { log } from '../utils/logger';

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
}

interface Agent {
  slug: string;
  name: string;
}

interface UseSessionManagementMenuOptions {
  sessions: Session[];
  agents: Agent[];
  onTitleUpdate: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
}

export function useSessionManagementMenu({
  sessions,
  onTitleUpdate,
  onDelete,
}: UseSessionManagementMenuOptions) {
  const { showToast } = useToast();
  const renameConversationMutation = useRenameConversationMutation();
  const deleteConversationMutation = useDeleteConversationMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    conv: Conversation;
  } | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const handleRename = useCallback(
    async (conv: Conversation) => {
      if (!newTitle.trim() || newTitle === conv.title) {
        setRenamingId(null);
        return;
      }

      try {
        await renameConversationMutation.mutateAsync({
          agentSlug: conv.agentSlug,
          conversationId: conv.id,
          title: newTitle.trim(),
        });
        const activeSession = sessions.find((s) => s.conversationId === conv.id);
        if (activeSession) {
          onTitleUpdate(activeSession.id, newTitle.trim());
        }
        setRenamingId(null);
      } catch (error) {
        log.api('Failed to rename conversation:', error);
      }
    },
    [renameConversationMutation, sessions, onTitleUpdate, newTitle],
  );

  const handleDelete = useCallback((conv: Conversation) => {
    setDeleteConfirm({ conv });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const conv = deleteConfirm.conv;
    setDeleteConfirm(null);

    try {
      await deleteConversationMutation.mutateAsync({
        agentSlug: conv.agentSlug,
        conversationId: conv.id,
      });
      const activeSession = sessions.find((s) => s.conversationId === conv.id);
      if (activeSession) {
        onDelete(activeSession.id);
      }
    } catch (error) {
      log.api('Failed to delete conversation:', error);
      showToast('Failed to delete conversation. Check console for details.');
    }
  }, [deleteConfirm, deleteConversationMutation, sessions, onDelete, showToast]);

  const clearAll = useCallback(
    async (conversations: Conversation[]) => {
      setShowClearAllConfirm(false);

      try {
        for (const conv of conversations) {
          await deleteConversationMutation.mutateAsync({
            agentSlug: conv.agentSlug,
            conversationId: conv.id,
          });

          const activeSession = sessions.find(
            (s) => s.conversationId === conv.id,
          );
          if (activeSession) {
            onDelete(activeSession.id);
          }
        }
      } catch (error) {
        log.api('Failed to clear all conversations:', error);
        showToast(
          'Failed to clear all conversations. Check console for details.',
        );
      }
    },
    [deleteConversationMutation, sessions, onDelete, showToast],
  );

  const startRename = useCallback((conv: Conversation) => {
    setRenamingId(conv.id);
    setNewTitle(conv.title || '');
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  return {
    isOpen,
    setIsOpen,
    renamingId,
    newTitle,
    setNewTitle,
    deleteConfirm,
    showClearAllConfirm,
    setShowClearAllConfirm,
    inputRef,
    handleRename,
    handleDelete,
    confirmDelete,
    cancelDelete,
    clearAll,
    startRename,
    cancelRename,
  };
}
