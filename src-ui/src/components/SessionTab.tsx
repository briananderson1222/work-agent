import type { AgentData } from '../contexts/AgentsContext';
import type { ChatSession } from '../types';
import { AgentBadge } from './AgentBadge';
import { AgentIcon } from './AgentIcon';

interface Model {
  id: string;
  name: string;
}

interface SessionTabProps {
  session: ChatSession;
  index: number;
  isActive: boolean;
  agent: AgentData | undefined;
  availableModels: Model[];
  closeTabShortcut: string;
  onFocus: () => void;
  onRemove: () => void;
}

export function SessionTab({
  session,
  index,
  isActive,
  agent,
  availableModels,
  closeTabShortcut,
  onFocus,
  onRemove,
}: SessionTabProps) {
  const tooltipParts = [
    `Title: ${session.title}`,
    `Agent: ${session.agentName}`,
    `Messages: ${session.messages.length}`,
  ];
  if (session.conversationId) {
    tooltipParts.push(`Conversation: ${session.conversationId.slice(-6)}`);
  }
  const tooltip = tooltipParts.join('\n');

  const agentModelId = agent?.model;
  const isCustomModel = session.model && session.model !== agentModelId;
  const modelInfo = isCustomModel
    ? availableModels.find((m) => m.id === session.model)
    : null;

  return (
    <button
      type="button"
      ref={(el) => {
        if (el && isActive) {
          const isVerticalList =
            el.closest('.chat-dock__tab-list')?.scrollHeight !==
            el.closest('.chat-dock__tab-list')?.clientHeight;
          if (!isVerticalList) {
            el.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'nearest',
            });
          }
        }
      }}
      className={`chat-dock__tab ${isActive ? 'is-active' : ''} ${session.hasUnread ? 'has-unread' : ''} ${session.status === 'sending' ? 'is-processing' : ''}`}
      onClick={onFocus}
      title={tooltip}
    >
      {agent && (
        <AgentIcon agent={agent} size={20} style={{ marginRight: '8px' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="chat-dock__tab-title">
          {session.projectName && (
            <span className="chat-dock__tab-project">
              {session.projectName}
            </span>
          )}
          {session.title}
          {session.status === 'sending' && (
            <span className="chat-dock__tab-badge">●</span>
          )}
        </div>
        <div className="chat-dock__tab-agent">
          <AgentBadge
            agentSlug={session.agentSlug}
            size="sm"
            source={agent?.source}
          />
        </div>
        {modelInfo && (
          <div
            style={{
              fontSize: '9px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              marginTop: '2px',
            }}
          >
            {modelInfo.name || 'Custom'}
          </div>
        )}
      </div>
      {index < 9 && (
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          ⌘{index + 1}
        </span>
      )}
      <span
        className="chat-dock__tab-close"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }
        }}
        title={`Close (${closeTabShortcut})`}
        style={{ flexShrink: 0 }}
      >
        ×
      </span>
    </button>
  );
}
