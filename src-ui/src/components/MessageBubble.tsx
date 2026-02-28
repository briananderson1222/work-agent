import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentSummary } from '../types';
import { AgentIcon } from './AgentIcon';
import { FilePartPreview } from './FilePartPreview';
import { ReasoningSection } from './ReasoningSection';
import { ToolCallDisplay } from './ToolCallDisplay';
import { UserIcon } from './UserIcon';

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
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
        marginBottom: '12px',
      }}
    >
      <div style={{ marginTop: '4px', flexShrink: 0 }}>{avatarContent}</div>
      <div
        className={`message ${msg.role}`}
        style={{
          position: 'relative',
          maxWidth: '70%',
          ...(msg.role === 'user' && msg.fromPrompt
            ? {
                background: 'var(--bg-tertiary)',
                borderLeft: '3px solid var(--accent-primary, #0066cc)',
              }
            : {}),
        }}
      >
        {msg.traceId && (
          <a
            href={`/monitoring?filters=${encodeURIComponent(JSON.stringify({ trace: [msg.traceId] }))}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              fontSize: '0.65em',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              opacity: 0.4,
              fontFamily: 'monospace',
              letterSpacing: '0.5px',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.7')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.4')}
            title={`Trace: ${msg.traceId}`}
          >
            {msg.traceId.slice(-8)}
          </a>
        )}

        {msg.role === 'assistant' && textContent && (
          <button
            onClick={() => onCopy(textContent)}
            style={{
              position: 'absolute',
              bottom: '5px',
              right: '5px',
              padding: '0.25rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
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

        {msg.role === 'assistant' && msg.model && (
          <div
            style={{
              fontSize: '0.64em',
              color: 'var(--text-muted)',
              marginBottom: '4px',
              fontStyle: 'italic',
              opacity: 0.6,
            }}
          >
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
                    toolCall={part}
                    showDetails={showToolDetails}
                    onApprove={
                      isStreamingMessage &&
                      part.tool?.needsApproval &&
                      onToolApproval
                        ? (action) => {
                            onToolApproval(
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {textContent}
              </ReactMarkdown>
            )}

        {msg.role === 'assistant' && isLastMessage && (
          <>
            {activeSession.isThinking && textContent && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--text-muted)',
                  marginTop: '8px',
                }}
              >
                <span className="loading-dots">
                  <span style={{ animationDelay: '0s' }}>●</span>
                  <span style={{ animationDelay: '0.2s' }}>●</span>
                  <span style={{ animationDelay: '0.4s' }}>●</span>
                </span>
              </div>
            )}
            {activeSession.pendingApprovals &&
              activeSession.pendingApprovals.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--warning-primary, orange)',
                    marginTop: '8px',
                    padding: '8px',
                    background: 'var(--warning-bg, rgba(255, 165, 0, 0.1))',
                    borderRadius: '4px',
                    fontSize: '0.9em',
                  }}
                >
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
