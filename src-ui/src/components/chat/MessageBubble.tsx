import type { AgentSummary, ChatMessage } from '../../types';
import { AgentIcon } from '../AgentIcon';
import { UserIcon } from '../UserIcon';
import { MessageContent } from './message-bubble/MessageContent';
import { MessageRating } from './message-bubble/MessageRating';
import { getModelDisplayName } from './message-bubble/utils';
import '../chat.css';

interface Session {
  id: string;
  agentSlug: string;
  messages: ChatMessage[];
  isThinking?: boolean;
  pendingApprovals?: unknown[];
}

interface MessageBubbleProps {
  msg: ChatMessage;
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
    action: 'once' | 'trust' | 'deny',
  ) => void;
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

        <MessageContent
          contentParts={msg.contentParts}
          textContent={textContent}
          chatFontSize={chatFontSize}
          showReasoning={showReasoning}
          showToolDetails={showToolDetails}
          isStreamingMessage={isStreamingMessage}
          onToolApproval={
            onToolApproval
              ? (part, action) => {
                  if (!part.tool?.approvalId || !part.tool.name) {
                    return;
                  }
                  onToolApproval(
                    activeSession.id,
                    activeSession.agentSlug,
                    part.tool.approvalId,
                    part.tool.name,
                    action,
                  );
                }
              : undefined
          }
        />

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
