import { useState, useEffect } from 'react';

interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
}

interface ConversationStatsData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
  contextWindowPercentage?: number;
  modelId?: string;
  modelStats?: Record<string, ModelStats>;
}

interface ConversationStatsProps {
  agentSlug: string;
  conversationId: string;
  apiBase: string;
  isVisible: boolean;
  onToggle: () => void;
  messageCount?: number; // Trigger refetch when message count changes
}

export function ConversationStats({ agentSlug, conversationId, apiBase, isVisible, onToggle, messageCount }: ConversationStatsProps) {
  const [stats, setStats] = useState<ConversationStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setStats(null);
  }, [conversationId]);

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

  useEffect(() => {
    if (!isVisible) return;

    const fetchStats = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations/${conversationId}/stats`);
        const result = await response.json();
        if (result.success) {
          setStats(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch conversation stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [agentSlug, conversationId, apiBase, isVisible, messageCount]);

  if (!isVisible) return null;

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
        }}
        onClick={onToggle}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '12px',
        padding: '24px',
        fontSize: '13px',
        color: 'var(--text-primary)',
        zIndex: 10000,
        minWidth: '320px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Conversation Statistics</h3>
          <button
            onClick={onToggle}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '0',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {isLoading ? (
          <div>Loading...</div>
        ) : stats ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Total Tokens</div>
                <div style={{ marginBottom: '4px' }}>In: {stats.inputTokens.toLocaleString()}</div>
                <div style={{ marginBottom: '4px' }}>Out: {stats.outputTokens.toLocaleString()}</div>
                <div>Total: {stats.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Total Usage</div>
                <div style={{ marginBottom: '4px' }}>Turns: {stats.turns}</div>
                <div style={{ marginBottom: '4px' }}>Tools: {stats.toolCalls}</div>
                <div>Cost: ${stats.estimatedCost.toFixed(4)}</div>
              </div>
            </div>
            {stats.contextWindowPercentage !== undefined && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Context Window</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    flex: 1, 
                    height: '6px', 
                    background: 'var(--border-primary)', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${Math.min(stats.contextWindowPercentage, 100)}%`, 
                      height: '100%', 
                      background: stats.contextWindowPercentage > 80 ? '#ef4444' : stats.contextWindowPercentage > 50 ? '#f59e0b' : '#10b981',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <span style={{ fontWeight: 600 }}>{stats.contextWindowPercentage.toFixed(1)}%</span>
                </div>
              </div>
            )}
            {stats.modelStats && Object.keys(stats.modelStats).length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Per-Model Breakdown</div>
                {Object.entries(stats.modelStats).map(([modelId, modelStat]) => (
                  <div key={modelId} style={{ 
                    marginBottom: '12px', 
                    padding: '8px', 
                    background: 'var(--bg-primary)', 
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', opacity: 0.8 }}>{modelId}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div>In: {modelStat.inputTokens.toLocaleString()}</div>
                        <div>Out: {modelStat.outputTokens.toLocaleString()}</div>
                        <div>Total: {modelStat.totalTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div>Turns: {modelStat.turns}</div>
                        <div>Tools: {modelStat.toolCalls}</div>
                        <div>Cost: ${modelStat.estimatedCost.toFixed(4)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>No stats available</div>
        )}
      </div>
    </>
  );
}

export function ContextPercentage({ agentSlug, conversationId, apiBase, messageCount, onClick }: { agentSlug: string; conversationId: string; apiBase: string; messageCount?: number; onClick?: () => void }) {
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    // Don't fetch if no messages yet
    if (!messageCount || messageCount === 0) {
      setPercentage(null);
      return;
    }
    
    const fetchStats = async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/conversations/${conversationId}/stats`);
        const result = await response.json();
        if (result.success && result.data.contextWindowPercentage !== undefined) {
          setPercentage(result.data.contextWindowPercentage);
        }
      } catch (error) {
        console.error('Failed to fetch context percentage:', error);
      }
    };

    fetchStats();
  }, [agentSlug, conversationId, apiBase, messageCount]);

  if (percentage === null) return null;

  return (
    <div 
      onClick={onClick}
      style={{ 
        position: 'absolute',
        bottom: '-18px',
        left: '0',
        right: '0',
        fontSize: '10px', 
        color: 'var(--text-muted)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <span>Context:</span>
      <div style={{ 
        flex: 1, 
        maxWidth: '80px',
        height: '3px', 
        background: 'var(--border-primary)', 
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: `${Math.min(percentage, 100)}%`, 
          height: '100%', 
          background: percentage > 80 ? '#ef4444' : percentage > 50 ? '#f59e0b' : '#10b981',
          transition: 'width 0.3s'
        }} />
      </div>
      <span>{percentage.toFixed(1)}%</span>
    </div>
  );
}
