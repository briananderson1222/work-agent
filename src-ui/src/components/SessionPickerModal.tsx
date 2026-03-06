import { useEffect, useState } from 'react';
import { log } from '@/utils/logger';
import { type AutoSelectItem, AutoSelectModal } from './AutoSelectModal';

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
  activeConversationIds?: string[];
}

export function SessionPickerModal({
  isOpen,
  onClose,
  onSelect,
  apiBase,
  agents,
  activeConversationIds = [],
}: SessionPickerModalProps) {
  const [conversations, setConversations] = useState<ConversationMetadata[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  async function loadConversations() {
    setLoading(true);
    try {
      const allConversations: ConversationMetadata[] = [];

      for (const agent of agents) {
        try {
          const response = await fetch(
            `${apiBase}/agents/${agent.slug}/conversations`,
          );
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
          log.api(`Failed to load conversations for ${agent.slug}:`, error);
        }
      }

      allConversations.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      setConversations(allConversations);
    } catch (error) {
      log.api('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  const items: AutoSelectItem<ConversationMetadata>[] = conversations.map(
    (conv) => {
      const agent = agents.find((a) => a.slug === conv.agentSlug);
      const isActive = activeConversationIds.includes(conv.id);

      return {
        id: conv.id,
        title: conv.title || 'Untitled Conversation',
        subtitle: agent?.name || conv.agentSlug,
        timestamp: formatDate(conv.updatedAt),
        isActive,
        metadata: conv,
      };
    },
  );

  return (
    <AutoSelectModal
      isOpen={isOpen}
      title="Open Conversation"
      placeholder="Search conversations..."
      items={items}
      loading={loading}
      emptyMessage="No conversations found"
      onSelect={(item) => {
        onSelect(item.id, item.metadata!.agentSlug);
        onClose();
      }}
      onClose={onClose}
      renderMetadata={(item) => {
        const stats = item.metadata?.metadata?.stats;
        if (!stats?.turns && !stats?.totalTokens) return null;

        return (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              display: 'flex',
              gap: '12px',
              marginTop: '4px',
            }}
          >
            {stats.turns && <span>{stats.turns} messages</span>}
            {stats.turns && stats.totalTokens && <span>•</span>}
            {stats.totalTokens && (
              <span>{stats.totalTokens.toLocaleString()} tokens</span>
            )}
          </div>
        );
      }}
    />
  );
}
