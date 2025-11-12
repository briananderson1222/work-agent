import { useConversationStatus } from '../contexts/ConversationsContext';
import { getAgentIcon } from '../utils/workspace';
import type { ChatSession, AgentSummary } from '../types';

interface SessionTabProps {
  session: ChatSession;
  agent: AgentSummary | undefined;
  isActive: boolean;
  index: number;
  onClick: () => void;
}

export function SessionTab({ session, agent, isActive, index, onClick }: SessionTabProps) {
  const { status } = useConversationStatus(session.agentSlug, session.conversationId);
  const isSending = status === 'streaming' || status === 'processing';
  const agentIcon = agent ? getAgentIcon(agent) : null;

  return (
    <button
      type="button"
      className={`chat-dock__tab ${isActive ? 'is-active' : ''} ${session.hasUnread ? 'has-unread' : ''} ${isSending ? 'is-processing' : ''}`}
      onClick={onClick}
      title={`Switch to tab (⌘${index + 1})`}
    >
      {agentIcon && (
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary)',
          color: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: agentIcon.isCustomIcon ? '12px' : '9px',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {agentIcon.icon}
        </div>
      )}
      <div className="chat-dock__tab-content">
        <div className="chat-dock__tab-title">
          {session.title}
          {isSending && (
            <span className="chat-dock__tab-badge">●</span>
          )}
        </div>
        <div className="chat-dock__tab-agent">{session.agentName}</div>
      </div>
    </button>
  );
}
