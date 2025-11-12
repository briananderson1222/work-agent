import { useState, useRef, useEffect } from 'react';
import { ConfirmModal } from './ConfirmModal';

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
  apiBase: string;
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
  apiBase,
  agents,
  chatDockRef,
  onTitleUpdate,
  onDelete,
  onSelect,
  onOpenConversation,
}: SessionManagementMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelBounds, setPanelBounds] = useState({ top: 0, bottom: 0, left: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<{ conv: Conversation } | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && chatDockRef.current) {
      const rect = chatDockRef.current.getBoundingClientRect();
      setPanelBounds({
        top: rect.top + 43, // Header height
        bottom: rect.bottom,
        left: rect.left,
      });
      loadConversations();
    }
  }, [isOpen]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const allConversations: Conversation[] = [];
      
      for (const agent of agents) {
        try {
          const response = await fetch(`${apiBase}/agents/${agent.slug}/conversations`);
          if (response.ok) {
            const data = await response.json();
            const agentConvos = (data.data || []).map((conv: any) => ({
              ...conv,
              agentSlug: agent.slug,
              agentName: agent.name,
            }));
            allConversations.push(...agentConvos);
          }
        } catch (error) {
          console.error(`Failed to load conversations for ${agent.slug}:`, error);
        }
      }
      
      // Sort by updatedAt descending
      allConversations.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      setConversations(allConversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
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
  };

  const getShortId = (conversationId: string) => {
    // Get last 6 characters of the conversation ID
    return conversationId.slice(-6);
  };

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const handleRename = async (conv: Conversation) => {
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
        // Update local conversation list
        setConversations(prev => prev.map(c => 
          c.id === conv.id ? { ...c, title: newTitle.trim() } : c
        ));
        
        // Update active session if it matches
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onTitleUpdate(activeSession.id, newTitle.trim());
        }
        
        setRenamingId(null);
      }
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleDelete = async (conv: Conversation) => {
    setDeleteConfirm({ conv });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const conv = deleteConfirm.conv;
    setDeleteConfirm(null);

    try {
      console.log('Deleting conversation:', conv.id, 'for agent:', conv.agentSlug);
      const response = await fetch(`${apiBase}/agents/${conv.agentSlug}/conversations/${conv.id}`, {
        method: 'DELETE',
      });

      console.log('Delete response:', response.status, response.ok);
      
      if (response.ok) {
        // Remove from local list
        setConversations(prev => prev.filter(c => c.id !== conv.id));
        
        // Close active session if it matches
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onDelete(activeSession.id);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Delete failed:', errorData);
        alert(`Failed to delete conversation: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation. Check console for details.');
    }
  };

  const clearAll = async () => {
    setShowClearAllConfirm(false);
    
    try {
      // Delete all conversations
      for (const conv of conversations) {
        await fetch(`${apiBase}/agents/${conv.agentSlug}/conversations/${conv.id}`, {
          method: 'DELETE',
        });
        
        // Close active session if it matches
        const activeSession = sessions.find(s => s.conversationId === conv.id);
        if (activeSession) {
          onDelete(activeSession.id);
        }
      }
      
      // Clear local list
      setConversations([]);
    } catch (error) {
      console.error('Failed to clear all conversations:', error);
      alert('Failed to clear all conversations. Check console for details.');
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    // Check if already open as a tab
    const existingSession = sessions.find(s => s.conversationId === conv.id);
    if (existingSession) {
      onSelect(existingSession.id);
    } else {
      onOpenConversation(conv.id, conv.agentSlug);
    }
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '18px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
        title="Manage conversations"
      >
        ☰
      </button>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Conversation"
        message={`Delete "${deleteConfirm?.conv.title || 'this conversation'}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <ConfirmModal
        isOpen={showClearAllConfirm}
        title="Clear All Conversations"
        message={`Delete all ${conversations.length} conversations? This cannot be undone.`}
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={clearAll}
        onCancel={() => setShowClearAllConfirm(false)}
      />

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => {
              if (!deleteConfirm && !renamingId) {
                setIsOpen(false);
              }
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.3)',
              zIndex: 999,
            }}
          />
          
          {/* Slide-in panel */}
          <div
            style={{
              position: 'fixed',
              left: panelBounds.left,
              top: panelBounds.top,
              bottom: `${window.innerHeight - panelBounds.bottom}px`,
              width: '350px',
              background: 'var(--bg-primary)',
              borderRight: '1px solid var(--border-primary)',
              boxShadow: '4px 0 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInFromLeft 0.2s ease-out',
            }}
          >
            <style>
              {`
                @keyframes slideInFromLeft {
                  from {
                    transform: translateX(-100%);
                  }
                  to {
                    transform: translateX(0);
                  }
                }
              `}
            </style>
            
            <div style={{ 
              padding: '16px', 
              borderBottom: '1px solid var(--border-primary)', 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>
                Conversation History ({conversations.length})
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {conversations.length > 0 && (
                  <button
                    onClick={() => setShowClearAllConfirm(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      textDecoration: 'underline',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-muted)',
                    fontSize: '20px',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading...
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No conversations yet
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = sessions.some(s => s.conversationId === conv.id && s.id === activeSessionId);
                  return (
                    <div
                      key={conv.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-primary)',
                        background: isActive ? 'var(--bg-secondary)' : 'transparent',
                      }}
                    >
                      {renamingId === conv.id ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(conv);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={() => handleRename(conv)}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                          }}
                        />
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <div
                            onClick={() => handleSelectConversation(conv)}
                            style={{
                              cursor: 'pointer',
                              paddingRight: '60px',
                            }}
                          >
                            <div style={{ 
                              fontWeight: isActive ? 600 : 400,
                              fontSize: '13px',
                              marginBottom: '4px',
                            }}>
                              {conv.title || 'Untitled'}
                              {' '}
                              <span style={{ 
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                fontWeight: 400,
                                fontFamily: 'monospace',
                              }}>
                                {getShortId(conv.id)}
                              </span>
                            </div>
                            <div style={{ 
                              fontSize: '12px', 
                              color: 'var(--text-muted)',
                              display: 'flex',
                              gap: '12px',
                              marginBottom: '4px',
                            }}>
                              <span>{conv.agentName || conv.agentSlug}</span>
                              {conv.metadata?.stats?.turns && (
                                <>
                                  <span>•</span>
                                  <span>{conv.metadata.stats.turns} messages</span>
                                </>
                              )}
                              {conv.metadata?.stats?.totalTokens && (
                                <>
                                  <span>•</span>
                                  <span>{conv.metadata.stats.totalTokens.toLocaleString()} tokens</span>
                                </>
                              )}
                            </div>
                            <div style={{ 
                              fontSize: '11px', 
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                            }}>
                              {formatDate(conv.updatedAt)}
                            </div>
                          </div>
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            display: 'flex',
                            gap: '4px',
                          }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(conv.id);
                                setNewTitle(conv.title || '');
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: 'var(--text-muted)',
                                fontSize: '12px',
                                opacity: 0.6,
                                flexShrink: 0,
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                              title="Rename"
                            >
                              ✎
                            </button>
                            <button
                              onClick={(e) => {
                                console.log('Delete button clicked!', conv.id);
                                e.stopPropagation();
                                handleDelete(conv);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: 'var(--text-muted)',
                                fontSize: '16px',
                                lineHeight: 1,
                              }}
                              title="Delete"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
