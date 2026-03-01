import React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useToast } from '../contexts/ToastContext';
import { useLocationContext } from '../hooks/useLocationContext';
import { useMeetingTranscription } from '../hooks/useMeetingTranscription';
import { useMobileSettings } from '../hooks/useMobileSettings';
import { useShareReceiver } from '../hooks/useShareReceiver';
import { useToolApproval } from '../hooks/useToolApproval';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { AgentIcon } from './AgentIcon';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInputArea } from './ChatInputArea';
import { MeetingTranscriptionModal } from './MeetingTranscriptionModal';
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
  // Hooks for global state
  const agents = useAgents();
  const { apiBase } = useApiBase();
  const { showToast } = useToast();
  const handleToolApproval = useToolApproval(apiBase);
  const { updateChat, clearEphemeralMessages } = useActiveChatActions();

  // Mobile/voice features
  const { settings } = useMobileSettings();
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const voice = useVoiceMode({
    enabled: settings.voiceModeEnabled,
    onTranscript: useCallback(
      (text: string) => {
        chatInput.handleInputChange(chatInput.input ? chatInput.input + ' ' + text : text);
      },
      [chatInput],
    ),
  });
  const transcription = useMeetingTranscription({
    enabled: settings.meetingTranscriptionEnabled,
  });
  const location = useLocationContext({ enabled: settings.locationContextEnabled });

  // Share sheet / PWA share target: pre-fill input with incoming shared content
  useShareReceiver({
    enabled: true, // always watch; no privacy concerns
    onShare: useCallback(
      (text: string) => chatInput.handleInputChange(text),
      [chatInput],
    ),
  });

  // Wrap handleSend to optionally prepend location context
  const handleSendWithContext = useCallback(async () => {
    if (settings.locationContextEnabled) {
      const locStr = location.getContextString();
      if (locStr && chatInput.input && !chatInput.input.startsWith('[My location:')) {
        chatInput.handleInputChange(locStr + '\n' + chatInput.input);
        // Give React a tick to update the input before sending
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return chatInput.handleSend();
  }, [settings.locationContextEnabled, location, chatInput]);

  // TTS readback: speak the last assistant message when streaming completes
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
    if (text.trim()) voice.speak(text.slice(0, 800)); // cap length for TTS
  }, [activeSession.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local state - only used within this component
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [removingMessages, setRemovingMessages] = useState<Set<string>>(
    new Set(),
  );

  const agent = agents.find((a) => a.slug === activeSession.agentSlug);
  const ephemeralMessages = activeSession.messages.filter((m) => m.ephemeral);

  // Auto-scroll to bottom when messages change
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

  const handleDismissEphemeral = (messageId: string) => {
    setRemovingMessages((prev) => new Set(prev).add(messageId));
    setTimeout(() => {
      const updated = ephemeralMessages.filter(
        (m) =>
          (m.id || `ephemeral-${ephemeralMessages.indexOf(m)}`) !== messageId,
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
      msg.contentParts
        ?.filter((p) => p.type === 'text')
        .map((p) => p.content)
        .join('\n') ||
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
              ? () => {
                  msg.action!.handler();
                  clearEphemeralMessages(activeSession.id);
                }
              : undefined
          }
        />
      );
    }

    const isSystemEvent =
      msg.role === 'user' && textContent.startsWith('[SYSTEM_EVENT]');
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
        onCopy={(text) => {
          navigator.clipboard.writeText(text);
          showToast('Copied to clipboard');
        }}
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
                agentIcon={
                  <AgentIcon agent={agent || { name: 'AI' }} size={20} />
                }
                agentIconStyle={{}}
                fontSize={chatFontSize}
                showReasoning={showReasoning}
                renderReasoning={(content, i) => (
                  <ReasoningSection
                    key={i}
                    content={content}
                    fontSize={chatFontSize}
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
      <QueuedMessages
        sessionId={activeSession.id}
        messages={activeSession.queuedMessages}
      />
      {/* Meeting transcription trigger */}
      {transcription.supported && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px 2px' }}>
          <button
            type="button"
            onClick={() => setShowMeetingModal(true)}
            title="Transcribe a meeting and extract action items"
            style={{
              background: transcription.running ? 'var(--color-error, #ef4444)' : 'transparent',
              color: transcription.running ? 'white' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {transcription.running ? '● Recording' : '⏺ Meeting'}
          </button>
        </div>
      )}
      {/* Meeting transcription modal */}
      <MeetingTranscriptionModal
        isOpen={showMeetingModal}
        transcription={transcription}
        onSend={(prompt) => {
          chatInput.handleInputChange(prompt);
          setShowMeetingModal(false);
        }}
        onClose={() => setShowMeetingModal(false)}
      />
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
        voiceState={voice.state}
        voiceSupported={voice.supported}
        onVoiceStart={voice.startListening}
        onVoiceStop={voice.stopListening}
      />
    </>
  );
}
