import { StatCard } from './StatCard';

export function UsageSummaryCards({
  avgCostPerMessage,
  totalConversations,
  totalCost,
  totalMessages,
}: {
  avgCostPerMessage: number;
  totalConversations: number;
  totalCost: number;
  totalMessages: number;
}) {
  return (
    <div className="usage-stats-cards">
      <StatCard
        icon="💬"
        label="Messages"
        value={totalMessages.toLocaleString()}
        color="var(--accent-primary)"
      />
      <StatCard
        icon="📁"
        label="Conversations"
        value={totalConversations.toLocaleString()}
        color="var(--accent-secondary)"
      />
      <StatCard
        icon="💰"
        label="Total Cost"
        value={`$${totalCost.toFixed(2)}`}
        color="var(--accent-warning)"
      />
      <StatCard
        icon="📈"
        label="Avg/Message"
        value={`$${avgCostPerMessage.toFixed(4)}`}
        color="var(--accent-success)"
      />
    </div>
  );
}
