import { useEffect, useState } from 'react';
import { useConversationStatus } from '../contexts/ConversationsContext';
import { useStats } from '../contexts/StatsContext';

interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
}

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
  const [isLoading, _setIsLoading] = useState(false);

  // Refetch stats when messageCount changes (after each turn)
  useEffect(() => {
    if (messageCount !== undefined && messageCount > 0) {
      refetch();
    }
  }, [messageCount, refetch]);

  // Poll for updates while modal is open (every 2 seconds)
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
      <div
        style={{
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
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            Conversation Statistics
          </h3>
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
            {stats.contextWindowPercentage !== undefined && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Context Window Usage
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  {stats.contextTokens?.toLocaleString() || 'N/A'} tokens (all
                  messages + system prompt + tools)
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: '6px',
                      background: 'var(--border-primary)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(stats.contextWindowPercentage, 100)}%`,
                        height: '100%',
                        background:
                          stats.contextWindowPercentage > 80
                            ? '#ef4444'
                            : stats.contextWindowPercentage > 50
                              ? '#f59e0b'
                              : '#10b981',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 600 }}>
                    {stats.contextWindowPercentage.toFixed(1)}%
                  </span>
                </div>
                {(stats.systemPromptTokens !== undefined ||
                  stats.mcpServerTokens !== undefined ||
                  stats.userMessageTokens !== undefined ||
                  stats.assistantMessageTokens !== undefined) && (
                  <div
                    style={{
                      fontSize: '11px',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-primary)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: '6px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Context Breakdown
                    </div>
                    {stats.systemPromptTokens !== undefined && (
                      <div
                        style={{
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>System Prompt:</span>
                        <span style={{ fontWeight: 600 }}>
                          {stats.systemPromptTokens.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {stats.mcpServerTokens !== undefined && (
                      <div
                        style={{
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>MCP Tools:</span>
                        <span style={{ fontWeight: 600 }}>
                          {stats.mcpServerTokens.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {stats.userMessageTokens !== undefined && (
                      <div
                        style={{
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>User Messages:</span>
                        <span style={{ fontWeight: 600 }}>
                          {stats.userMessageTokens.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {stats.assistantMessageTokens !== undefined && (
                      <div
                        style={{
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Assistant Messages:</span>
                        <span style={{ fontWeight: 600 }}>
                          {stats.assistantMessageTokens.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {stats.contextFilesTokens !== undefined &&
                      stats.contextFilesTokens > 0 && (
                        <div
                          style={{
                            marginBottom: '3px',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>Context Files:</span>
                          <span style={{ fontWeight: 600 }}>
                            {stats.contextFilesTokens.toLocaleString()}
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Total LLM Consumption
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Tokens sent/received across all API calls
                </div>
                <div style={{ marginBottom: '4px' }}>
                  In: {stats.inputTokens.toLocaleString()}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  Out: {stats.outputTokens.toLocaleString()}
                </div>
                <div>Total: {stats.totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Per Turn Averages
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Average tokens per conversation turn
                </div>
                {stats.turns > 0 && (
                  <>
                    <div style={{ marginBottom: '4px' }}>
                      User:{' '}
                      {Math.round(
                        (stats.userMessageTokens || 0) / stats.turns,
                      ).toLocaleString()}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      Assistant:{' '}
                      {Math.round(
                        (stats.assistantMessageTokens || 0) / stats.turns,
                      ).toLocaleString()}
                    </div>
                    <div>
                      Total In:{' '}
                      {Math.round(
                        stats.inputTokens / stats.turns,
                      ).toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Activity
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Conversation activity metrics
                </div>
                <div style={{ marginBottom: '4px' }}>Turns: {stats.turns}</div>
                <div>Tool Calls: {stats.toolCalls}</div>
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Cost
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Total and per-turn cost
                </div>
                <div style={{ marginBottom: '4px' }}>
                  Total: ${stats.estimatedCost.toFixed(4)}
                </div>
                {stats.turns > 0 && (
                  <div>
                    Per Turn: ${(stats.estimatedCost / stats.turns).toFixed(4)}
                  </div>
                )}
              </div>
            </div>
            {stats.modelStats && Object.keys(stats.modelStats).length > 0 && (
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Per-Model Breakdown
                </div>
                {Object.entries(stats.modelStats as Record<string, ModelStats>).map(
                  ([modelId, modelStat]) => (
                    <div
                      key={modelId}
                      style={{
                        marginBottom: '12px',
                        padding: '8px',
                        background: 'var(--bg-primary)',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: '6px',
                          fontSize: '11px',
                          opacity: 0.8,
                        }}
                      >
                        {modelId}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              marginBottom: '2px',
                            }}
                          >
                            Consumed
                          </div>
                          <div>
                            In: {modelStat.inputTokens.toLocaleString()}
                          </div>
                          <div>
                            Out: {modelStat.outputTokens.toLocaleString()}
                          </div>
                          <div>
                            Total: {modelStat.totalTokens.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              marginBottom: '2px',
                            }}
                          >
                            Stats
                          </div>
                          <div>Turns: {modelStat.turns}</div>
                          <div>Tool Calls: {modelStat.toolCalls}</div>
                          <div style={{ marginTop: '4px' }}>
                            Cost: ${modelStat.estimatedCost.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
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

export function ContextPercentage({
  agentSlug,
  conversationId,
  apiBase,
  messageCount,
  onClick,
}: {
  agentSlug: string;
  conversationId: string;
  apiBase: string;
  messageCount?: number;
  onClick?: () => void;
}) {
  const { stats, refetch } = useStats(agentSlug, conversationId, apiBase, true);
  const { status } = useConversationStatus(agentSlug, conversationId);
  const percentage = stats?.contextWindowPercentage ?? null;
  const isActive = status !== 'idle';

  // Refetch when messageCount changes (after each turn)
  useEffect(() => {
    if (messageCount !== undefined && messageCount > 0) {
      refetch();
    }
  }, [messageCount, refetch]);

  if (percentage === null) return null;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="context-indicator"
      style={{
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        background: 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)',
        transition: 'background 0.2s',
        border: 'none',
        width: '100%',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background =
            'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)';
      }}
    >
      <div className="context-indicator-content">
        <span>Context:</span>
        <div
          style={{
            flex: 1,
            maxWidth: '80px',
            height: '3px',
            background: 'var(--border-primary)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(percentage, 100)}%`,
              height: '100%',
              background:
                percentage > 80
                  ? '#ef4444'
                  : percentage > 50
                    ? '#f59e0b'
                    : '#10b981',
              transition: 'width 0.3s',
            }}
          />
        </div>
        <span>{percentage.toFixed(1)}%</span>
        {isActive && (
          <span
            style={{
              fontSize: '8px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            ●
          </span>
        )}
      </div>
    </button>
  );
}
