import React, { RefObject } from 'react';
import { ConversationStats } from './ConversationStats';
import { ChatEmptyState } from './ChatEmptyState';
import { EphemeralMessage } from './EphemeralMessage';
import { SystemEventMessage } from './SystemEventMessage';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';
import { ReasoningSection } from './ReasoningSection';
import { ToolCallDisplay } from './ToolCallDisplay';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { QueuedMessages } from './QueuedMessages';
import { ChatInputArea } from './ChatInputArea';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useToast } from '../contexts/ToastContext';
import { useToolApproval } from '../hooks/useToolApproval';
import { getAgentIconStyle, getInitials } from '../utils/workspace';

interface Message {
  id?: string;
  role: string;
  content?: string;
  contentParts?: Array<{ type: string; content: string }>;
  ephemeral?: boolean;
  action?: { handler: () => void };
}

interface Session {
  id: string;
  agentSlug: string;
  agentName: string;
  conversationId?: string;
  messages: Message[];
  status: string;
  abortController?: AbortController;
  queuedMessages?: unknown[];
}

interface ChatDockBodyProps {
  activeSession: Session;
  chatFontSize: number;
  dockHeight: number;
  showStatsPanel: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  isUserScrolledUp: boolean;
  modelSupportsAttachments: boolean;
  agentDefaultModelId?: string;
  availableModels: Array<{ id: string; name: string }>;
  ephemeralMessages: Message[];
  removingMessages: Set<string>;
  messagesContainerRef: RefObject<HTMLDivElement>;
  chatInput: {
    input: string;
    attachments: unknown[];
    textareaRef: RefObject<HTMLTextAreaElement>;
    currentModel: string;
    modelQuery: string;
    commandQuery: string;
    slashCommands: unknown[];
    handleInputChange: (value: string) => void;
    handleSend: () => void;
    handleCancel: () => void;
    handleClearInput: () => void;
    handleAddAttachments: (files: File[]) => void;
    handleRemoveAttachment: (index: number) => void;
    handleModelSelect: (model: string) => void;
    handleModelClose: () => void;
    handleModelOpen: () => void;
    handleCommandSelect: (command: unknown) => void;
    handleCommandClose: () => void;
    handleHistoryUp: () => void;
    handleHistoryDown: () => void;
    updateFromInput: (value: string) => void;
    closeAll: () => void;
  };
  setShowStatsPanel: (show: boolean) => void;
  setIsUserScrolledUp: (scrolled: boolean) => void;
  setRemovingMessages: (fn: (prev: Set<string>) => Set<string>) => void;
  updateChat: (id: string, updates: unknown) => void;
  clearEphemeralMessages: (id: string) => void;
}

export function ChatDockBody({
  activeSession,
  chatFontSize,
  dockHeight,
  showStatsPanel,
  showReasoning,
  showToolDetails,
  isUserScrolledUp,
  modelSupportsAttachments,
  agentDefaultModelId,
  availableModels,
  ephemeralMessages,
  removingMessages,
  messagesContainerRef,
  chatInput,
  setShowStatsPanel,
  setIsUserScrolledUp,
  setRemovingMessages,
  updateChat,
  clearEphemeralMessages,
}: ChatDockBodyProps) {
  // Use hooks directly instead of prop drilling
  const agents = useAgents();
  const { apiBase } = useApiBase();
  const { showToast } = useToast();
  const handleToolApproval = useToolApproval(apiBase);

  const agent = agents.find(a => a.slug === activeSession.agentSlug);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10;
    setIsUserScrolledUp(!isAtBottom);
  };

  const handleScrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setIsUserScrolledUp(false);
    }
  };

  const handleDismissEphemeral = (messageId: string) => {
    setRemovingMessages(prev => new Set(prev).add(messageId));
    setTimeout(() => {
      const updated = ephemeralMessages.filter(m => (m.id || `ephemeral-${ephemeralMessages.indexOf(m)}`) !== messageId);
      if (updated.length === 0) {
        clearEphemeralMessages(activeSession.id);
      } else {
        updateChat(activeSession.id, { ephemeralMessages: updated });
      }
      setRemovingMessages(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }, 300);
  };

  const renderMessage = (msg: Message, idx: number) => {
    const textContent = msg.contentParts?.filter(p => p.type === 'text').map(p => p.content).join('\n') || msg.content || '';

    if (msg.ephemeral) {
      const messageId = msg.id || `ephemeral-${idx}`;
      return (
        <EphemeralMessage
          key={messageId}
          msg={msg}
          idx={idx}
          fontSize={chatFontSize}
          isRemoving={removingMessages.has(messageId)}
          onDismiss={() => handleDismissEphemeral(messageId)}
          onAction={msg.action ? () => { msg.action!.handler(); clearEphemeralMessages(activeSession.id); } : undefined}
        />
      );
    }

    const isSystemEvent = msg.role === 'user' && textContent.startsWith('[SYSTEM_EVENT]');
    if (isSystemEvent) {
      return (
        <SystemEventMessage
          key={`${activeSession.id}-msg-${idx}`}
          messageKey={`${activeSession.id}-msg-${idx}`}
          content={textContent.replace(/^\[SYSTEM_EVENT\]\s*/, '')}
        />
      );
    }

    return (
      <MessageBubble
        key={`${activeSession.id}-msg-${idx}`}
        msg={msg}
        idx={idx}
        activeSession={activeSession}
        agents={agents}
        chatFontSize={chatFontSize}
        showReasoning={showReasoning}
        showToolDetails={showToolDetails}
        onCopy={(text) => { navigator.clipboard.writeText(text); showToast('Copied to clipboard'); }}
        onToolApproval={handleToolApproval}
      />
    );
  };

  return (
    <>
      {showStatsPanel && (
        <ConversationStats
          agentSlug={activeSession.agentSlug}
          conversationId={activeSession.conversationId || ''}
          apiBase={apiBase}
          isVisible={showStatsPanel}
          onToggle={() => setShowStatsPanel(!showStatsPanel)}
          messageCount={activeSession.messages.length}
          key={`${activeSession.conversationId || activeSession.agentSlug}-${activeSession.status}`}
        />
      )}
      <div className="chat-messages" ref={messagesContainerRef} style={{ fontSize: `${chatFontSize}px` }} onScroll={handleScroll}>
        {activeSession.messages.length === 0 ? (
          <ChatEmptyState agentName={activeSession.agentName} />
        ) : (
          <>
            {activeSession.messages.map(renderMessage)}
            {activeSession.status === 'sending' && (
              <StreamingMessage
                sessionId={activeSession.id}
                agentIcon={agent?.icon || getInitials(agent?.name || 'AI')}
                agentIconStyle={agent ? getAgentIconStyle(agent, 20) : {
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: 'var(--accent-primary)', fontSize: '11px', flexShrink: 0, color: 'var(--text-primary)',
                }}
                fontSize={chatFontSize}
                showReasoning={showReasoning}
                renderReasoning={(content, i) => <ReasoningSection key={i} content={content} fontSize={chatFontSize} show={showReasoning} />}
                renderToolCall={(part, i) => (
                  <ToolCallDisplay
                    key={i}
                    toolCall={part}
                    showDetails={showToolDetails}
                    onApprove={part.tool?.needsApproval ? (action) => handleToolApproval(activeSession.id, activeSession.agentSlug, part.tool!.approvalId!, part.tool!.name, action) : undefined}
                  />
                )}
              />
            )}
          </>
        )}
      </div>
      {isUserScrolledUp && <ScrollToBottomButton onClick={handleScrollToBottom} />}
      <QueuedMessages sessionId={activeSession.id} messages={activeSession.queuedMessages} />
      <ChatInputArea
        agentSlug={activeSession.agentSlug}
        conversationId={activeSession.conversationId}
        messageCount={activeSession.messages.length}
        input={chatInput.input}
        attachments={chatInput.attachments}
        textareaRef={chatInput.textareaRef}
        disabled={!agent}
        isSending={activeSession.status === 'sending'}
        hasAbortController={!!activeSession.abortController}
        modelSupportsAttachments={modelSupportsAttachments}
        fontSize={chatFontSize}
        dockHeight={dockHeight}
        apiBase={apiBase}
        currentModel={chatInput.currentModel}
        agentDefaultModel={agentDefaultModelId}
        availableModels={availableModels}
        modelQuery={chatInput.modelQuery}
        commandQuery={chatInput.commandQuery}
        slashCommands={chatInput.slashCommands}
        onInputChange={chatInput.handleInputChange}
        onSend={chatInput.handleSend}
        onCancel={chatInput.handleCancel}
        onClearInput={chatInput.handleClearInput}
        onAddAttachments={chatInput.handleAddAttachments}
        onRemoveAttachment={chatInput.handleRemoveAttachment}
        onModelSelect={chatInput.handleModelSelect}
        onModelClose={chatInput.handleModelClose}
        onModelOpen={chatInput.handleModelOpen}
        onCommandSelect={chatInput.handleCommandSelect}
        onCommandClose={chatInput.handleCommandClose}
        onHistoryUp={chatInput.handleHistoryUp}
        onHistoryDown={chatInput.handleHistoryDown}
        onShowStats={() => setShowStatsPanel(true)}
        updateFromInput={chatInput.updateFromInput}
        closeAll={chatInput.closeAll}
      />
    </>
  );
}
