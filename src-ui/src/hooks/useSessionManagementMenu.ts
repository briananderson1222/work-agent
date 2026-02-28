import { useState, useCallback, useRef, useEffect } from 'react';
import { useInvalidateQuery } from '@work-agent/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
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
  agents,
  onTitleUpdate,
  onDelete,
}: UseSessionManagementMenuOptions) {
  const { apiBase } = useApiBase();
  const invalidate = useInvalidateQuery();
  
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ conv: Conversation } | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const handleRename = useCallback(async (conv: Conversation) => {
    if (!newTitle.trim() || newTitle === conv.title) {
      setRenamingId(null);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/agents/${conv.agentSlug}/conversations/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (response.ok) {
        invalidate(['conversations', conv.agentSlug]);
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onTitleUpdate(activeSession.id, newTitle.trim());
        }
        setRenamingId(null);
      }
    } catch (error) {
      log.api('Failed to rename conversation:', error);
    }
  }, [apiBase, invalidate, sessions, onTitleUpdate, newTitle]);

  const handleDelete = useCallback((conv: Conversation) => {
    setDeleteConfirm({ conv });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const conv = deleteConfirm.conv;
    setDeleteConfirm(null);

    try {
      const response = await fetch(`${apiBase}/agents/${conv.agentSlug}/conversations/${conv.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        invalidate(['conversations', conv.agentSlug]);
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onDelete(activeSession.id);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        log.api('Delete failed:', errorData);
        alert(`Failed to delete conversation: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      log.api('Failed to delete conversation:', error);
      alert('Failed to delete conversation. Check console for details.');
    }
  }, [apiBase, deleteConfirm, invalidate, sessions, onDelete]);

  const clearAll = useCallback(async (conversations: Conversation[]) => {
    setShowClearAllConfirm(false);
    
    try {
      for (const conv of conversations) {
        await fetch(`${apiBase}/agents/${conv.agentSlug}/conversations/${conv.id}`, {
          method: 'DELETE',
        });
        
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onDelete(activeSession.id);
        }
      }
      
      agents.forEach(agent => {
        invalidate(['conversations', agent.slug]);
      });
    } catch (error) {
      log.api('Failed to clear all conversations:', error);
      alert('Failed to clear all conversations. Check console for details.');
    }
  }, [apiBase, agents, invalidate, sessions, onDelete]);

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
