import { useEffect, useState } from 'react';
import {
  useActiveChatActions,
  useActiveChatState,
  useCreateChatSession,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useChatInput } from '../hooks/useChatInput';
import { ChatInputArea } from './ChatInputArea';
import { ChatMessageList } from './chat/ChatMessageList';

interface ACPChatPanelProps {
  projectSlug: string;
  projectName?: string;
  agentSlug: string;
  /** Stable tab ID — used to persist the session across re-renders */
  tabId: string;
}

/**
 * Compact chat UI for terminal tabs. Uses the same ActiveChatsStore and
 * /chat endpoint as ChatDock — conversations are resumable from either place.
 */
export function ACPChatPanel({
  projectSlug,
  projectName,
  agentSlug,
  tabId,
}: ACPChatPanelProps) {
  const { apiBase } = useApiBase();
  const agents = useAgents();
  const createSession = useCreateChatSession();
  const { updateChat } = useActiveChatActions();

  // Resolve session ID: restore from sessionStorage or create new
  const [sessionId] = useState<string>(() => {
    const stored = sessionStorage.getItem(`acp-tab-session:${tabId}`);
    if (stored) return stored;
    const agent = agents.find((a) => a.slug === agentSlug);
    const sid = createSession(
      agentSlug,
      agent?.name || agentSlug,
      undefined,
      projectSlug,
      projectName,
    );
    sessionStorage.setItem(`acp-tab-session:${tabId}`, sid);
    return sid;
  });

  const activeSession = useActiveChatState(sessionId);

  // Ensure project context is set
  useEffect(() => {
    if (activeSession && !activeSession.projectSlug && projectSlug) {
      updateChat(sessionId, { projectSlug, projectName });
    }
  }, [activeSession, projectSlug, projectName, sessionId, updateChat]);

  const chatInput = useChatInput({
    apiBase,
    sessionId,
    agentSlug,
    conversationId: activeSession?.conversationId,
    availableModels: [],
  });

  if (!activeSession) {
    return (
      <div className="acp-chat-panel acp-chat-panel--loading">
        Initializing...
      </div>
    );
  }

  return (
    <div className="acp-chat-panel">
      <ChatMessageList
        activeSession={activeSession as any}
        fontSize={13}
        showReasoning={true}
        showToolDetails={true}
      />
      <ChatInputArea
        agentSlug={agentSlug}
        conversationId={activeSession.conversationId}
        messageCount={activeSession.messages?.length || 0}
        input={chatInput.input}
        attachments={chatInput.attachments}
        textareaRef={chatInput.textareaRef}
        disabled={false}
        isSending={activeSession.status === 'sending'}
        hasAbortController={!!activeSession.abortController}
        modelSupportsAttachments={false}
        fontSize={13}
        dockHeight={400}
        apiBase={apiBase}
        currentModel={chatInput.currentModel}
        availableModels={[]}
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
        onShowStats={() => {}}
        updateFromInput={chatInput.updateFromInput}
        closeAll={chatInput.closeAll}
      />
    </div>
  );
}
