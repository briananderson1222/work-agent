import type { ConversationStatsSnapshot } from './types';
import {
  formatAverageTokens,
  getContextBreakdownEntries,
  getContextWindowColor,
  getModelStatsEntries,
} from './utils';

interface ConversationStatsModalProps {
  stats: ConversationStatsSnapshot | null;
  isVisible: boolean;
  isLoading: boolean;
  onToggle: () => void;
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontWeight: 600,
          marginBottom: '4px',
          color: 'var(--text-secondary)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          marginBottom: '8px',
        }}
      >
        {subtitle}
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      {label}: {value}
    </div>
  );
}

export function ConversationStatsModal({
  stats,
  isVisible,
  isLoading,
  onToggle,
}: ConversationStatsModalProps) {
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
          minWidth: 'min(320px, 90vw)',
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
                        background: getContextWindowColor(
                          stats.contextWindowPercentage,
                        ),
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 600 }}>
                    {(stats.contextWindowPercentage ?? 0).toFixed(1)}%
                  </span>
                </div>
                {getContextBreakdownEntries(stats).length > 0 && (
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
                    {getContextBreakdownEntries(stats).map((entry) => (
                      <div
                        key={entry.label}
                        style={{
                          marginBottom: '3px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{entry.label}:</span>
                        <span style={{ fontWeight: 600 }}>
                          {entry.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
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
              <SectionCard
                title="Total LLM Consumption"
                subtitle="Tokens sent/received across all API calls"
              >
                <StatRow
                  label="In"
                  value={stats.inputTokens.toLocaleString()}
                />
                <StatRow
                  label="Out"
                  value={stats.outputTokens.toLocaleString()}
                />
                <div>Total: {stats.totalTokens.toLocaleString()}</div>
              </SectionCard>
              <SectionCard
                title="Per Turn Averages"
                subtitle="Average tokens per conversation turn"
              >
                {stats.turns > 0 && (
                  <>
                    <StatRow
                      label="User"
                      value={
                        formatAverageTokens(
                          stats.userMessageTokens || 0,
                          stats.turns,
                        )!
                      }
                    />
                    <StatRow
                      label="Assistant"
                      value={
                        formatAverageTokens(
                          stats.assistantMessageTokens || 0,
                          stats.turns,
                        )!
                      }
                    />
                    <div>
                      Total In:{' '}
                      {formatAverageTokens(stats.inputTokens, stats.turns)}
                    </div>
                  </>
                )}
              </SectionCard>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <SectionCard
                title="Activity"
                subtitle="Conversation activity metrics"
              >
                <div style={{ marginBottom: '4px' }}>Turns: {stats.turns}</div>
                <div>Tool Calls: {stats.toolCalls}</div>
              </SectionCard>
              <SectionCard title="Cost" subtitle="Total and per-turn cost">
                <div style={{ marginBottom: '4px' }}>
                  Total: ${(stats.estimatedCost ?? 0).toFixed(4)}
                </div>
                {stats.turns > 0 && (
                  <div>
                    Per Turn: $
                    {(stats.estimatedCost / (stats.turns || 1)).toFixed(4)}
                  </div>
                )}
              </SectionCard>
            </div>
            {stats.modelStats &&
              getModelStatsEntries(stats.modelStats).length > 0 && (
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
                  {getModelStatsEntries(stats.modelStats).map(
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
                              Cost: ${(modelStat.estimatedCost ?? 0).toFixed(4)}
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
