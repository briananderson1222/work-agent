import { useResetUsageStatsMutation } from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { log } from '@/utils/logger';
import { useAgents } from '../contexts/AgentsContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { useModels } from '../contexts/ModelsContext';
import { ConfirmModal } from './ConfirmModal';
import { UsageBreakdownSection } from './usage-stats/UsageBreakdownSection';
import { UsageDrillDownModal } from './usage-stats/UsageDrillDownModal';
import { UsageSummaryCards } from './usage-stats/UsageSummaryCards';
import {
  getAverageCostPerMessage,
  getTotalUsageConversations,
} from './usage-stats/utils';
import './UsageStatsPanel.css';

type DrillDownType = 'model' | 'agent' | null;

export function UsageStatsPanel() {
  const { usageStats, loading, error, refresh, rescan } = useAnalytics();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const models = useModels();
  const agents = useAgents();
  const [drillDown, setDrillDown] = useState<{
    type: DrillDownType;
    id: string;
  } | null>(null);
  const [hasAutoRescanned, setHasAutoRescanned] = useState(false);

  const resetMutation = useResetUsageStatsMutation({
    onSuccess: () => {
      refresh();
    },
  });

  // Auto-rescan if we have messages but no conversations
  useEffect(() => {
    if (
      !hasAutoRescanned &&
      usageStats &&
      usageStats.lifetime.totalMessages > 0
    ) {
      const hasConversations = Object.values(usageStats.byAgent).some(
        (stats: any) => (stats.conversations || 0) > 0,
      );

      if (!hasConversations) {
        setHasAutoRescanned(true);
        log.api('Auto-rescanning to populate conversation counts...');
        rescan();
      }
    }
  }, [usageStats, hasAutoRescanned, rescan]);

  if (loading && !usageStats) {
    return (
      <div className="usage-stats-loading">
        <div className="usage-stats-loading-icon">📊</div>
        <div>Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-stats-error">
        <div className="usage-stats-error-icon">⚠️</div>
        <div className="usage-stats-error-message">
          Error: {(error as Error)?.message ?? String(error)}
        </div>
        <button onClick={refresh} className="usage-stats-error-button">
          Retry
        </button>
      </div>
    );
  }

  if (!usageStats) return null;

  const { lifetime, byModel, byAgent } = usageStats;
  const avgCostPerMessage = getAverageCostPerMessage(lifetime);
  const totalConversations = getTotalUsageConversations(lifetime);

  return (
    <div className="usage-stats-panel">
      <div className="usage-stats-header">
        <h3 className="usage-stats-title">
          <span>📊</span>
          <span>Usage Statistics</span>
        </h3>
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={resetMutation.isPending}
          className="usage-stats-reset-btn"
        >
          {resetMutation.isPending ? 'Resetting...' : 'Reset'}
        </button>
      </div>

      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Usage Statistics"
        message="This will permanently clear all usage data including message counts, costs, and agent statistics. This cannot be undone."
        confirmLabel="Reset All"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          setShowResetConfirm(false);
          await resetMutation.mutateAsync();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      <UsageSummaryCards
        avgCostPerMessage={avgCostPerMessage}
        totalConversations={totalConversations}
        totalCost={lifetime.totalCost}
        totalMessages={lifetime.totalMessages}
      />

      <UsageBreakdownSection
        agents={agents}
        byAgent={byAgent}
        byModel={byModel}
        models={models}
        onAgentClick={(agentId) => setDrillDown({ type: 'agent', id: agentId })}
        onModelClick={(modelId) => setDrillDown({ type: 'model', id: modelId })}
        totalMessages={lifetime.totalMessages}
      />

      {drillDown && (
        <UsageDrillDownModal
          type={drillDown.type}
          id={drillDown.id}
          usageStats={usageStats}
          models={models}
          agents={agents}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
