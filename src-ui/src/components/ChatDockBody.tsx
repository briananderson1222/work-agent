import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveChatActions } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useFeatureSettings } from '../hooks/useFeatureSettings';
import { useMessageContext } from '../hooks/useMessageContext';
import { useShareReceiver } from '../hooks/useShareReceiver';
import type { SlashCommand } from '../hooks/useSlashCommands';
import { useSTT } from '../hooks/useSTT';
import { useTTS } from '../hooks/useTTS';
import type { ChatMessage, ChatSession, FileAttachment } from '../types';
import { ChatInputArea } from './ChatInputArea';
import { ConversationStats } from './ConversationStats';
import { ChatMessageList } from './chat/ChatMessageList';
import { EphemeralMessage } from './EphemeralMessage';
import { QueuedMessages } from './QueuedMessages';
import { SystemEventMessage } from './SystemEventMessage';

interface ChatDockBodyProps {
  activeSession: ChatSession;
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
    attachments: FileAttachment[];
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    currentModel: string | undefined;
    modelQuery: string | null;
    commandQuery: string | null;
    slashCommands: SlashCommand[];
    handleInputChange: (value: string) => void;
    handleSend: () => void;
    handleCancel: () => void;
    handleClearInput: () => void;
    handleAddAttachments: (files: FileAttachment[]) => void;
    handleRemoveAttachment: (id: string) => void;
    handleModelSelect: (model: {
      id: string;
      name: string;
      originalId?: string;
    }) => void;
    handleModelClose: () => void;
    handleModelOpen: () => void;
    handleCommandSelect: (command: SlashCommand) => Promise<void>;
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
  const { updateChat, clearEphemeralMessages } = useActiveChatActions();

  const { settings } = useFeatureSettings();
  const stt = useSTT();
  const tts = useTTS();
  const { getComposedContext } = useMessageContext();

  // Wire STT transcript into chat input
  const inputRef = useRef(chatInput.input);
  inputRef.current = chatInput.input;

  useEffect(() => {
    if (stt.state === 'idle' && stt.transcript) {
      const cur = inputRef.current;
      chatInput.handleInputChange(
        cur ? `${cur} ${stt.transcript}` : stt.transcript,
      );
    }
  }, [stt.state, stt.transcript, chatInput.handleInputChange]);

  useShareReceiver({
    enabled: true,
    onShare: useCallback(
      (text: string) => chatInput.handleInputChange(text),
      [chatInput],
    ),
  });

  const handleSendWithContext = useCallback(async () => {
    const ctx = getComposedContext();
    if (ctx && chatInput.input && !chatInput.input.startsWith('[')) {
      chatInput.handleInputChange(`${ctx}\n${chatInput.input}`);
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
    const lastMsg = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    if (!lastMsg) return;
    const text =
      lastMsg.contentParts
        ?.filter((p) => p.type === 'text')
        .map((p) => p.content)
        .join(' ') ??
      lastMsg.content ??
      '';
    if (text.trim()) tts.speak(text.slice(0, 800));
  }, [
    activeSession.status,
    activeSession.messages,
    settings.ttsReadbackEnabled,
    tts.speak,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const [removingMessages, setRemovingMessages] = useState<Set<string>>(
    new Set(),
  );
  const ephemeralMessages = activeSession.messages.filter((m) => m.isEphemeral);

  const handleDismissEphemeral = useCallback((messageId: string) => {
    setRemovingMessages((prev) => new Set(prev).add(messageId));
    setTimeout(() => {
      const updated = ephemeralMessages.filter(
        (m, i) => ((m as any).id || `ephemeral-${i}`) !== messageId,
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
  }, [ephemeralMessages, activeSession.id, clearEphemeralMessages, updateChat]);

  const agent = agents.find((a) => a.slug === activeSession.agentSlug);

  // Dock-specific message overrides: ephemeral messages and system events
  const renderOverride = useCallback(
    (msg: ChatMessage, idx: number): React.ReactNode | null => {
      if (msg.isEphemeral) {
        const messageId = (msg as any).id || `ephemeral-${idx}`;
        return (
          <EphemeralMessage
            key={messageId}
            msg={msg}
            idx={idx}
            fontSize={chatFontSize}
            isRemoving={removingMessages.has(messageId)}
            onDismiss={() => handleDismissEphemeral(messageId)}
            onAction={
              (msg as any).action
                ? () => {
                    (msg as any).action.handler();
                    clearEphemeralMessages(activeSession.id);
                  }
                : undefined
            }
          />
        );
      }

      const textContent =
        msg.contentParts
          ?.filter((p: any) => p.type === 'text')
          .map((p: any) => p.content)
          .join('\n') ||
        msg.content ||
        '';
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

      return null; // Use default MessageBubble rendering
    },
    [chatFontSize, removingMessages, activeSession.id, clearEphemeralMessages, handleDismissEphemeral],
  );

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
      <ChatMessageList
        activeSession={activeSession}
        fontSize={chatFontSize}
        showReasoning={showReasoning}
        showToolDetails={showToolDetails}
        renderOverride={renderOverride}
      />
      <QueuedMessages
        sessionId={activeSession.id}
        messages={activeSession.queuedMessages}
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
        voiceState={stt.state}
        voiceSupported={stt.supported}
        onVoiceStart={() => stt.startListening()}
        onVoiceStop={() => stt.stopListening()}
      />
    </>
  );
}
