import { useState, useEffect } from 'react';

interface ConversationMetadata {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    stats?: {
      turns?: number;
      totalTokens?: number;
    };
  };
}

interface SessionPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (conversationId: string, agentSlug: string) => void;
  apiBase: string;
  agents: Array<{ slug: string; name: string }>;
}

export function SessionPickerModal({ isOpen, onClose, onSelect, apiBase, agents }: SessionPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [conversations, setConversations] = useState<ConversationMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const allConversations: ConversationMetadata[] = [];
      
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

  const filteredConversations = conversations.filter(conv => {
    const searchLower = search.toLowerCase();
    const agent = agents.find(a => a.slug === conv.agentSlug);
    return (
      conv.title?.toLowerCase().includes(searchLower) ||
      agent?.name.toLowerCase().includes(searchLower) ||
      conv.id.toLowerCase().includes(searchLower)
    );
  });

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

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Open Conversation</h3>
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filteredConversations.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter' && filteredConversations[selectedIndex]) {
                const conv = filteredConversations[selectedIndex];
                onSelect(conv.id, conv.agentSlug);
                onClose();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conv, idx) => {
              const agent = agents.find(a => a.slug === conv.agentSlug);
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv.id, conv.agentSlug);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-primary)',
                    background: idx === selectedIndex ? 'var(--accent-primary)' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: idx === selectedIndex ? 'white' : 'var(--text-primary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, flex: 1 }}>
                      {conv.title || 'Untitled Conversation'}
                    </div>
                    <div style={{ 
                      fontSize: '11px', 
                      color: idx === selectedIndex ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                      marginLeft: '12px'
                    }}>
                      {formatDate(conv.updatedAt)}
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: idx === selectedIndex ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
                    display: 'flex',
                    gap: '12px'
                  }}>
                    <span>{agent?.name || conv.agentSlug}</span>
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
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
