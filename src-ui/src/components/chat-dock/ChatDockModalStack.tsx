import type { AgentData } from '../../contexts/AgentsContext';
import type { ProjectMetadata } from '../../contexts/ProjectsContext';
import type { ChatSession, DockMode } from '../../types';
import { ChatSettingsPanel } from '../ChatSettingsPanel';
import { NewChatModal } from '../NewChatModal';
import { SessionPickerModal } from '../SessionPickerModal';

interface ChatDockModalStackProps {
  agents: AgentData[];
  projects: ProjectMetadata[];
  activeProjectSlug?: string | null;
  activeProjectName?: string | null;
  sessions: ChatSession[];
  showNewChatModal: boolean;
  showChatSettings: boolean;
  showSessionPicker: boolean;
  chatFontSize: number;
  defaultFontSize: number;
  showReasoning: boolean;
  showToolDetails: boolean;
  dockMode: DockMode;
  pathname: string;
  activeProviderLabel?: string;
  activeModel?: string;
  activeSessionStatus?: string;
  onSelectNewChat: (
    agent: AgentData,
    projectSlug?: string,
    projectName?: string,
  ) => void;
  onCloseNewChat: () => void;
  onCloseSettings: () => void;
  onCloseSessionPicker: () => void;
  onSessionPickerSelect: (conversationId: string, agentSlug: string) => void;
  onChatFontSizeChange: (fn: (prev: number) => number) => void;
  onShowReasoningChange: (show: boolean) => void;
  onShowToolDetailsChange: (show: boolean) => void;
  onDockModeChange: (mode: DockMode, pathname: string) => void;
}

export function ChatDockModalStack({
  agents,
  projects,
  activeProjectSlug,
  activeProjectName,
  sessions,
  showNewChatModal,
  showChatSettings,
  showSessionPicker,
  chatFontSize,
  defaultFontSize,
  showReasoning,
  showToolDetails,
  dockMode,
  pathname,
  activeProviderLabel,
  activeModel,
  activeSessionStatus,
  onSelectNewChat,
  onCloseNewChat,
  onCloseSettings,
  onCloseSessionPicker,
  onSessionPickerSelect,
  onChatFontSizeChange,
  onShowReasoningChange,
  onShowToolDetailsChange,
  onDockModeChange,
}: ChatDockModalStackProps) {
  return (
    <>
      {showNewChatModal && (
        <NewChatModal
          agents={agents}
          projects={projects}
          activeProjectSlug={activeProjectSlug}
          onSelect={onSelectNewChat}
          onClose={onCloseNewChat}
        />
      )}

      <ChatSettingsPanel
        isOpen={showChatSettings}
        onClose={onCloseSettings}
        chatFontSize={chatFontSize}
        setChatFontSize={onChatFontSizeChange}
        defaultFontSize={defaultFontSize}
        showReasoning={showReasoning}
        setShowReasoning={onShowReasoningChange}
        showToolDetails={showToolDetails}
        setShowToolDetails={onShowToolDetailsChange}
        dockMode={dockMode}
        onDockModeChange={(mode) => onDockModeChange(mode, pathname)}
        activeProviderLabel={activeProviderLabel}
        activeModel={activeModel}
        activeSessionStatus={activeSessionStatus}
      />

      {showSessionPicker && (
        <SessionPickerModal
          isOpen={showSessionPicker}
          agents={agents}
          activeConversationIds={
            sessions.map((s) => s.conversationId).filter(Boolean) as string[]
          }
          onSelect={(conversationId, agentSlug) => {
            onSessionPickerSelect(
              conversationId,
              agentSlug,
              activeProjectSlug ?? undefined,
              activeProjectName ?? undefined,
            );
          }}
          onClose={onCloseSessionPicker}
        />
      )}
    </>
  );
}
