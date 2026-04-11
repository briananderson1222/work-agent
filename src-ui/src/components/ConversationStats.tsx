import { useEffect } from 'react';
import { useStats } from '../contexts/StatsContext';
import { ConversationStatsModal } from './conversation-stats/ConversationStatsModal';

interface ConversationStatsProps {
  agentSlug: string;
  conversationId: string;
  apiBase: string;
  isVisible: boolean;
  onToggle: () => void;
  messageCount?: number;
}

export function ConversationStats({
  agentSlug,
  conversationId,
  apiBase,
  isVisible,
  onToggle,
  messageCount,
}: ConversationStatsProps) {
  const { stats, refetch } = useStats(
    agentSlug,
    conversationId,
    apiBase,
    isVisible,
  );
  const isLoading = false;

  useEffect(() => {
    if (messageCount !== undefined && messageCount > 0) {
      refetch();
    }
  }, [messageCount, refetch]);

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      refetch();
    }, 2000);

    return () => clearInterval(interval);
  }, [isVisible, refetch]);

  useEffect(() => {
    if (!isVisible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggle();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isVisible, onToggle]);

  return (
    <ConversationStatsModal
      isVisible={isVisible}
      isLoading={isLoading}
      stats={stats}
      onToggle={onToggle}
    />
  );
}

export { ContextPercentage } from './conversation-stats/ContextPercentage';
