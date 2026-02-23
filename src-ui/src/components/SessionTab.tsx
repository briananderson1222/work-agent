import React from 'react';
import { AgentBadge } from './AgentBadge';
import { getAgentIcon, getAgentIconStyle } from '../utils/workspace';
import type { AgentSummary } from '../types';

interface Model {
  id: string;
  name: string;
}

interface Session {
  id: string;
  agentSlug: string;
  agentName: string;
  title: string;
  model?: string;
  status: string;
  hasUnread: boolean;
  messages: unknown[];
  conversationId?: string;
}

interface SessionTabProps {
  session: Session;
  index: number;
  isActive: boolean;
  agent: AgentSummary | undefined;
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
  const agentIcon = agent ? getAgentIcon(agent) : null;
  
  const tooltipParts = [
    `Title: ${session.title}`,
    `Agent: ${session.agentName}`,
    `Messages: ${session.messages.length}`,
  ];
  if (session.conversationId) {
    tooltipParts.push(`Conversation: ${session.conversationId.slice(-6)}`);
  }
  const tooltip = tooltipParts.join('\n');

  const agentModelId = agent ? (typeof agent.model === 'string' ? agent.model : agent.model?.modelId) : undefined;
  const isCustomModel = session.model && session.model !== agentModelId;
  const modelInfo = isCustomModel ? availableModels.find(m => m.id === session.model) : null;

  return (
    <button
      type="button"
      ref={(el) => {
        if (el && isActive) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }}
      className={`chat-dock__tab ${isActive ? 'is-active' : ''} ${session.hasUnread ? 'has-unread' : ''} ${session.status === 'sending' ? 'is-processing' : ''}`}
      onClick={onFocus}
      title={tooltip}
    >
      {agentIcon && (
        <div style={{ ...getAgentIconStyle(agent!, 20), marginRight: '8px' }}>
          {agentIcon.display}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="chat-dock__tab-title">
          {session.title}
          {session.status === 'sending' && (
            <span className="chat-dock__tab-badge">●</span>
          )}
        </div>
        <div className="chat-dock__tab-agent">
          <AgentBadge agentSlug={session.agentSlug} size="sm" source={agent?.source} />
        </div>
        {modelInfo && (
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
            {modelInfo.name || 'Custom'}
          </div>
        )}
      </div>
      {index < 9 && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
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
