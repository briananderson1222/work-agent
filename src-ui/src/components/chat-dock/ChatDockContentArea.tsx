import type { ComponentProps } from 'react';
import type { AgentData } from '../../contexts/AgentsContext';
import type { ChatSession } from '../../types';
import { ChatDockBody } from '../ChatDockBody';
import { ConversationHistory } from '../ConversationHistory';

interface SessionListItem {
  id: string;
  conversationId?: string | null;
  title?: string;
}

interface ChatDockContentAreaProps {
  activeSession: ChatSession | null;
  activeSessionId: string | null;
  sessions: ChatSession[];
  agents: AgentData[];
  chatFontSize: number;
  dockHeight: number;
  showStatsPanel: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  modelSupportsAttachments: boolean;
  agentDefaultModelId: string | null;
  availableModels: ComponentProps<typeof ChatDockBody>['availableModels'];
  chatInput: ComponentProps<typeof ChatDockBody>['chatInput'];
  isHistoryOpen: boolean;
  onCloseHistory: () => void;
  onToggleStatsPanel: (show: boolean) => void;
  onTitleUpdate: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onFocusSession: (sessionId: string) => void;
  onOpenConversation: (conversationId: string, agentSlug: string) => void;
}

export function ChatDockContentArea({
  activeSession,
  activeSessionId,
  sessions,
  agents,
  chatFontSize,
  dockHeight,
  showStatsPanel,
  showReasoning,
  showToolDetails,
  modelSupportsAttachments,
  agentDefaultModelId,
  availableModels,
  chatInput,
  isHistoryOpen,
  onCloseHistory,
  onToggleStatsPanel,
  onTitleUpdate,
  onDeleteSession,
  onFocusSession,
  onOpenConversation,
}: ChatDockContentAreaProps) {
  return (
    <div className="chat-dock__content-area">
      {isHistoryOpen && (
        <>
          <div
            className="conversation-history__backdrop"
            onClick={onCloseHistory}
          />
          <ConversationHistory
            sessions={sessions.filter((s) => s.conversationId) as SessionListItem[]}
            activeSessionId={activeSessionId}
            agents={agents}
            onTitleUpdate={onTitleUpdate}
            onDelete={onDeleteSession}
            onSelect={onFocusSession}
            onOpenConversation={onOpenConversation}
            onClose={onCloseHistory}
          />
        </>
      )}
      <div className="chat-dock__body">
        {activeSession ? (
          <ChatDockBody
            activeSession={activeSession}
            chatFontSize={chatFontSize}
            dockHeight={dockHeight}
            showStatsPanel={showStatsPanel}
            showReasoning={showReasoning}
            showToolDetails={showToolDetails}
            modelSupportsAttachments={modelSupportsAttachments}
            agentDefaultModelId={agentDefaultModelId}
            availableModels={availableModels}
            chatInput={chatInput}
            setShowStatsPanel={onToggleStatsPanel}
          />
        ) : (
          <div className="empty-state">
            <h3>No active session</h3>
            <p>Click "+ New" to start a chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
