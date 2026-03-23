import React, { useEffect, useRef, useState } from 'react';
import { useAgents } from '../../contexts/AgentsContext';
import { useApiBase } from '../../contexts/ApiBaseContext';
import { useToast } from '../../contexts/ToastContext';
import { useToolApproval } from '../../hooks/useToolApproval';
import type { ChatMessage, ChatSession } from '../../types';
import { AgentIcon } from '../AgentIcon';
import { ChatEmptyState } from '../ChatEmptyState';
import { ReasoningSection } from '../ReasoningSection';
import { ScrollToBottomButton } from '../ScrollToBottomButton';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';
import { ToolCallDisplay } from './ToolCallDisplay';

interface ChatMessageListProps {
  activeSession: ChatSession;
  fontSize: number;
  showReasoning: boolean;
  showToolDetails: boolean;
  /** Override rendering for specific messages. Return a ReactNode to replace default, or null to use MessageBubble. */
  renderOverride?: (msg: ChatMessage, idx: number) => React.ReactNode | null;
  emptyState?: React.ReactNode;
}

export function ChatMessageList({
  activeSession,
  fontSize,
  showReasoning,
  showToolDetails,
  renderOverride,
  emptyState,
}: ChatMessageListProps) {
  const agents = useAgents();
  const { apiBase } = useApiBase();
  const { showToast } = useToast();
  const handleToolApproval = useToolApproval(apiBase);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const messages = activeSession.messages || [];
  const agent = agents.find((a) => a.slug === activeSession.agentSlug);

  useEffect(() => {
    if (!isUserScrolledUp && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [isUserScrolledUp]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 10;
    setIsUserScrolledUp(!isAtBottom);
  };

  const handleScrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
      setIsUserScrolledUp(false);
    }
  };

  const renderDefaultMessage = (msg: ChatMessage, idx: number) => (
    <MessageBubble
      key={`${activeSession.id}-msg-${idx}`}
      msg={msg as any}
      idx={idx}
      activeSession={activeSession as any}
      agents={agents as any}
      chatFontSize={fontSize}
      showReasoning={showReasoning}
      showToolDetails={showToolDetails}
      onCopy={(text) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
      }}
      onToolApproval={handleToolApproval as any}
    />
  );

  const renderMessage = (msg: ChatMessage, idx: number) => {
    if (renderOverride) {
      const override = renderOverride(msg, idx);
      if (override !== null) return override;
    }
    return renderDefaultMessage(msg, idx);
  };

  return (
    <>
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        style={{ fontSize: `${fontSize}px` }}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          (emptyState ?? <ChatEmptyState agentName={activeSession.agentName} />)
        ) : (
          <>
            {messages.map(renderMessage)}
            {activeSession.status === 'sending' && (
              <StreamingMessage
                sessionId={activeSession.id}
                agentIcon={
                  <AgentIcon agent={agent || { name: 'AI' }} size={20} />
                }
                agentIconStyle={{}}
                fontSize={fontSize}
                showReasoning={showReasoning}
                renderReasoning={(content, i) => (
                  <ReasoningSection
                    key={i}
                    content={content}
                    fontSize={fontSize}
                    show={showReasoning}
                  />
                )}
                renderToolCall={(part, i) => (
                  <ToolCallDisplay
                    key={i}
                    toolCall={part}
                    showDetails={showToolDetails}
                    onApprove={
                      part.tool?.needsApproval
                        ? (action) =>
                            handleToolApproval(
                              activeSession.id,
                              activeSession.agentSlug,
                              part.tool!.approvalId!,
                              part.tool!.name,
                              action,
                            )
                        : undefined
                    }
                  />
                )}
              />
            )}
          </>
        )}
      </div>
      {isUserScrolledUp && (
        <ScrollToBottomButton onClick={handleScrollToBottom} />
      )}
    </>
  );
}
