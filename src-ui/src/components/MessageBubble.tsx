import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiBase } from '../contexts/ApiBaseContext';
import type { AgentSummary } from '../types';
import { AgentIcon } from './AgentIcon';
import { FilePartPreview } from './FilePartPreview';
import { markdownCodeComponents } from './HighlightedCodeBlock';
import { ReasoningSection } from './ReasoningSection';
import { ToolCallDisplay } from './ToolCallDisplay';
import { UserIcon } from './UserIcon';
import './chat.css';

interface Attachment {
  id: string;
  name: string;
  type: string;
  preview?: string;
}

interface ContentPart {
  type: string;
  content?: string;
  url?: string;
  mediaType?: string;
  name?: string;
  tool?: {
    name: string;
    needsApproval?: boolean;
    approvalId?: string;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content?: string;
  traceId?: string;
  model?: string;
  fromPrompt?: boolean;
  attachments?: Attachment[];
  contentParts?: ContentPart[];
}

interface Session {
  id: string;
  agentSlug: string;
  messages: Message[];
  isThinking?: boolean;
  pendingApprovals?: unknown[];
}

interface MessageBubbleProps {
  msg: Message;
  idx: number;
  activeSession: Session;
  agents: AgentSummary[];
  chatFontSize: number;
  showReasoning: boolean;
  showToolDetails: boolean;
  onCopy: (text: string) => void;
  onToolApproval?: (
    sessionId: string,
    agentSlug: string,
    approvalId: string,
    toolName: string,
    action: 'approve' | 'deny',
  ) => void;
}

type RatingValue = 'thumbs_up' | 'thumbs_down' | null;

const ThumbUpIcon = ({ filled }: { filled: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);

const ThumbDownIcon = ({ filled }: { filled: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </svg>
);

/** Cache ratings per session to avoid re-fetching for every message. */
let ratingsCache: { apiBase: string; data: Map<string, { rating: RatingValue; reason?: string }>; ts: number } | null = null;

async function loadRatingsCache(apiBase: string): Promise<Map<string, { rating: RatingValue; reason?: string }>> {
  const now = Date.now();
  if (ratingsCache && ratingsCache.apiBase === apiBase && now - ratingsCache.ts < 30_000) {
    return ratingsCache.data;
  }
  const res = await fetch(`${apiBase}/api/feedback/ratings`);
  if (!res.ok) return new Map();
  const json = await res.json();
  const map = new Map<string, { rating: RatingValue; reason?: string }>();
  for (const r of json.data || []) {
    map.set(`${r.conversationId}:${r.messageIndex}`, { rating: r.rating, reason: r.reason });
  }
  ratingsCache = { apiBase, data: map, ts: now };
  return map;
}

function invalidateRatingsCache() {
  ratingsCache = null;
}

function MessageRating({
  conversationId,
  messageIndex,
  messagePreview,
  agentSlug,
}: {
  conversationId: string;
  messageIndex: number;
  messagePreview: string;
  agentSlug: string;
}) {
  const { apiBase } = useApiBase();
  const [rating, setRating] = useState<RatingValue>(null);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [savedReason, setSavedReason] = useState<string | undefined>(undefined);

  // Load existing rating on mount
  useEffect(() => {
    loadRatingsCache(apiBase).then((map) => {
      const existing = map.get(`${conversationId}:${messageIndex}`);
      if (existing) {
        setRating(existing.rating);
        if (existing.reason) setSavedReason(existing.reason);
      }
    }).catch(() => {});
  }, [apiBase, conversationId, messageIndex]);

  const submitRating = useCallback(
    async (value: RatingValue, reason?: string) => {
      try {
        if (value) {
          const res = await fetch(`${apiBase}/api/feedback/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentSlug,
              conversationId,
              messageIndex,
              messagePreview,
              rating: value,
              ...(reason ? { reason } : {}),
            }),
          });
          if (!res.ok) throw new Error();
        } else {
          const res = await fetch(`${apiBase}/api/feedback/rate`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, messageIndex }),
          });
          if (!res.ok) throw new Error();
        }
        invalidateRatingsCache();
      } catch {
        // handled by caller
        throw new Error('rate failed');
      }
    },
    [apiBase, agentSlug, conversationId, messageIndex, messagePreview],
  );

  const handleRate = useCallback(
    async (value: RatingValue) => {
      const newRating = rating === value ? null : value;
      const prevRating = rating;
      setRating(newRating);
      if (newRating === 'thumbs_down') {
        setShowReasonInput(true);
        try { await submitRating(newRating); } catch { setRating(prevRating); }
      } else {
        setShowReasonInput(false);
        setReasonText('');
        try { await submitRating(newRating); } catch { setRating(prevRating); }
      }
    },
    [rating, submitRating],
  );

  const handleReasonSubmit = useCallback(async () => {
    if (!reasonText.trim()) { setShowReasonInput(false); return; }
    const reason = reasonText.trim();
    try {
      await submitRating(rating, reason);
      setSavedReason(reason);
    } catch { /* keep input open */ }
    setShowReasonInput(false);
    setReasonText('');
  }, [rating, reasonText, submitRating]);

  return (
    <span className="message__rating">
      <button
        className={`message__rating-btn${rating === 'thumbs_up' ? ' message__rating-btn--active' : ''}`}
        onClick={() => handleRate('thumbs_up')}
        title="Good response"
      >
        <ThumbUpIcon filled={rating === 'thumbs_up'} />
      </button>
      <button
        className={`message__rating-btn${rating === 'thumbs_down' ? ' message__rating-btn--active' : ''}`}
        onClick={() => handleRate('thumbs_down')}
        title="Bad response"
      >
        <ThumbDownIcon filled={rating === 'thumbs_down'} />
      </button>
      <span className={`message__rating-expand${showReasonInput ? ' message__rating-expand--open' : ''}`}>
        {showReasonInput ? (
          <input
            className="message__rating-reason"
            placeholder="Why? (optional)"
            maxLength={100}
            value={reasonText}
            autoFocus
            onChange={(e) => setReasonText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleReasonSubmit(); if (e.key === 'Escape') { setShowReasonInput(false); setReasonText(''); } }}
            onBlur={handleReasonSubmit}
          />
        ) : savedReason ? (
          <span className="message__rating-reason-label" title={savedReason}>{savedReason}</span>
        ) : null}
      </span>
    </span>
  );
}

function getModelDisplayName(model: string): string {
  if (model.includes('claude-3-7-sonnet')) return '🤖 Claude 3.7 Sonnet';
  if (model.includes('claude-3-5-sonnet-20241022'))
    return '🤖 Claude 3.5 Sonnet v2';
  if (model.includes('claude-3-5-sonnet')) return '🤖 Claude 3.5 Sonnet';
  if (model.includes('claude-3-opus')) return '🤖 Claude 3 Opus';
  if (model.includes('claude-3-haiku')) return '🤖 Claude 3 Haiku';
  return '🤖 Custom';
}

export function MessageBubble({
  msg,
  idx,
  activeSession,
  agents,
  chatFontSize,
  showReasoning,
  showToolDetails,
  onCopy,
  onToolApproval,
}: MessageBubbleProps) {
  const textContent = typeof msg.content === 'string' ? msg.content : '';
  const isLastMessage = idx === activeSession.messages.length - 1;
  const isStreamingMessage = isLastMessage && msg.role === 'assistant';

  const agent = agents.find((a) => a.slug === activeSession.agentSlug);

  const isAssistant = msg.role === 'assistant';
  const avatarContent = isAssistant ? (
    <AgentIcon agent={agent || { name: 'AI' }} size={20} />
  ) : (
    <UserIcon size={20} />
  );

  return (
    <div
      className={`message-row ${msg.role === 'user' ? 'message-row--user' : ''}`}
    >
      <div className="message-row__avatar">{avatarContent}</div>
      <div
        style={{
          position: 'relative',
          maxWidth: '70%',
        }}
        className={`message ${msg.role}${msg.role === 'user' && msg.fromPrompt ? ' message--from-prompt' : ''}`}
      >
        {msg.traceId && (
          <a
            href={`/monitoring?filters=${encodeURIComponent(JSON.stringify({ trace: [msg.traceId] }))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="message__trace"
            title={`Trace: ${msg.traceId}`}
          >
            {msg.traceId.slice(-8)}
          </a>
        )}

        {msg.role === 'assistant' && textContent && (
          <button
            onClick={() => onCopy(textContent)}
            className="message__copy-btn"
            title="Copy message"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        )}

        {msg.role === 'assistant' && textContent && (
          <MessageRating
            conversationId={activeSession.id}
            messageIndex={idx}
            messagePreview={textContent.slice(0, 200)}
            agentSlug={activeSession.agentSlug}
          />
        )}

        {msg.role === 'assistant' && msg.model && (
          <div className="message__model-badge">
            {getModelDisplayName(msg.model)}
          </div>
        )}

        {msg.contentParts && msg.contentParts.length > 0
          ? msg.contentParts.map((part, i) => {
              if (part.type === 'reasoning' && part.content) {
                return (
                  <ReasoningSection
                    key={i}
                    content={part.content}
                    fontSize={chatFontSize}
                    show={showReasoning}
                  />
                );
              } else if (part.type === 'text' && part.content) {
                return (
                  <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                    {part.content}
                  </ReactMarkdown>
                );
              } else if (part.type === 'file') {
                return (
                  <FilePartPreview
                    key={i}
                    part={part}
                    allParts={msg.contentParts}
                  />
                );
              } else if (
                part.type === 'tool' ||
                part.type?.startsWith('tool-')
              ) {
                return (
                  <ToolCallDisplay
                    key={i}
                    toolCall={part as any}
                    showDetails={showToolDetails}
                    onApprove={
                      isStreamingMessage &&
                      part.tool?.needsApproval &&
                      onToolApproval
                        ? (action) => {
                            (onToolApproval as any)(
                              activeSession.id,
                              activeSession.agentSlug,
                              part.tool!.approvalId!,
                              part.tool!.name,
                              action,
                            );
                          }
                        : undefined
                    }
                  />
                );
              }
              return null;
            })
          : textContent && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownCodeComponents}
              >
                {textContent}
              </ReactMarkdown>
            )}

        {msg.role === 'assistant' && isLastMessage && (
          <>
            {activeSession.isThinking && textContent && (
              <div className="message__thinking">
                <span className="loading-dots">
                  <span style={{ animationDelay: '0s' }}>●</span>
                  <span style={{ animationDelay: '0.2s' }}>●</span>
                  <span style={{ animationDelay: '0.4s' }}>●</span>
                </span>
              </div>
            )}
            {activeSession.pendingApprovals &&
              activeSession.pendingApprovals.length > 0 && (
                <div className="message__pending-approval">
                  <span>⏸</span>
                  <span>
                    Awaiting tool approval (
                    {activeSession.pendingApprovals.length})
                  </span>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
