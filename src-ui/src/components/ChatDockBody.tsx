import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useToast } from '../contexts/ToastContext';
import { useMessageContext } from '../hooks/useMessageContext';
import { useMobileSettings } from '../hooks/useMobileSettings';
import { useShareReceiver } from '../hooks/useShareReceiver';
import { useSTT } from '../hooks/useSTT';
import { useTTS } from '../hooks/useTTS';
import { useToolApproval } from '../hooks/useToolApproval';
import { AgentIcon } from './AgentIcon';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInputArea } from './ChatInputArea';
import { ConversationStats } from './ConversationStats';
import { EphemeralMessage } from './EphemeralMessage';
import { MessageBubble } from './MessageBubble';
import { QueuedMessages } from './QueuedMessages';
import { ReasoningSection } from './ReasoningSection';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { StreamingMessage } from './StreamingMessage';
import { SystemEventMessage } from './SystemEventMessage';
import { ToolCallDisplay } from './ToolCallDisplay';

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
  modelSupportsAttachments: boolean;
  agentDefaultModelId?: string;
  availableModels: Array<{ id: string; name: string }>;
  chatInput: {
    input: string;
    attachments: unknown[];
    textareaRef: React.RefObject<HTMLTextAreaElement>;
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
}

export function ChatDockBody({
  activeSession,
  chatFontSize,
  dockHeight,
  showStatsPanel,
  showReasoning,
  showToolDetails,
  modelSupportsAttachments,
  agentDefaultModelId,
  availableModels,
  chatInput,
  setShowStatsPanel,
}: ChatDockBodyProps) {
  const agents = useAgents();
  const { apiBase } = useApiBase();
  const { showToast } = useToast();
  const handleToolApproval = useToolApproval(apiBase);
  const { updateChat, clearEphemeralMessages } = useActiveChatActions();

  // Mobile settings (only non-voice flags remain here)
  const { settings } = useMobileSettings();

  // Voice via provider pattern
  const stt = useSTT();
  const tts = useTTS();
  const { getComposedContext } = useMessageContext();

  // Wire STT transcript into chat input
  useEffect(() => {
    if (stt.state === 'idle' && stt.transcript) {
      chatInput.handleInputChange(
        chatInput.input ? chatInput.input + ' ' + stt.transcript : stt.transcript,
      );
    }
  }, [stt.state, stt.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // Share sheet / PWA share target
  useShareReceiver({
    enabled: true,
    onShare: useCallback(
      (text: string) => chatInput.handleInputChange(text),
      [chatInput],
    ),
  });

  // Wrap handleSend to prepend composed context
  const handleSendWithContext = useCallback(async () => {
    const ctx = getComposedContext();
    if (ctx && chatInput.input && !chatInput.input.startsWith('[')) {
      chatInput.handleInputChange(ctx + '\n' + chatInput.input);
      await new Promise((r) => setTimeout(r, 0));
    }
    return chatInput.handleSend();
  }, [getComposedContext, chatInput]);

  // TTS readback when streaming ends
  const prevStatusRef = useRef(activeSession.status);
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'sending';
    prevStatusRef.current = activeSession.status;
    if (!wasStreaming || activeSession.status === 'sending') return;
    if (!settings.ttsReadbackEnabled) return;
    const lastMsg = [...activeSession.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg) return;
    const text =
      lastMsg.contentParts
        ?.filter((p) => p.type === 'text')
        .map((p) => p.content)
        .join(' ') ?? lastMsg.content ?? '';
    if (text.trim()) tts.speak(text.slice(0, 800));
  }, [activeSession.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [removingMessages, setRemovingMessages] = useState<Set<string>>(new Set());

  const agent = agents.find((a) => a.slug === activeSession.agentSlug);
  const ephemeralMessages = activeSession.messages.filter((m) => m.ephemeral);

  useEffect(() => {
    if (!isUserScrolledUp && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [isUserScrolledUp]);

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
    setRemovingMessages((prev) => new Set(prev).add(messageId));
    setTimeout(() => {
      const updated = ephemeralMessages.filter(
        (m) => (m.id || `ephemeral-${ephemeralMessages.indexOf(m)}`) !== messageId,
      );
      if (updated.length === 0) {
        clearEphemeralMessages(activeSession.id);
      } else {
        updateChat(activeSession.id, { ephemeralMessages: updated });
      }
      setRemovingMessages((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }, 300);
  };

  const renderMessage = (msg: Message, idx: number) => {
    const textContent =
      msg.contentParts?.filter((p) => p.type === 'text').map((p) => p.content).join('\n') ||
      msg.content ||
      '';

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
          onAction={
            msg.action
              ? () => { msg.action!.handler(); clearEphemeralMessages(activeSession.id); }
              : undefined
          }
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
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        style={{ fontSize: `${chatFontSize}px` }}
        onScroll={handleScroll}
      >
        {activeSession.messages.length === 0 ? (
          <ChatEmptyState agentName={activeSession.agentName} />
        ) : (
          <>
            {activeSession.messages.map(renderMessage)}
            {activeSession.status === 'sending' && (
              <StreamingMessage
                sessionId={activeSession.id}
                agentIcon={<AgentIcon agent={agent || { name: 'AI' }} size={20} />}
                agentIconStyle={{}}
                fontSize={chatFontSize}
                showReasoning={showReasoning}
                renderReasoning={(content, i) => (
                  <ReasoningSection key={i} content={content} fontSize={chatFontSize} show={showReasoning} />
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
        onSend={handleSendWithContext}
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
        voiceState={stt.state}
        voiceSupported={stt.supported}
        onVoiceStart={() => stt.startListening()}
        onVoiceStop={() => stt.stopListening()}
      />
    </>
  );
}
