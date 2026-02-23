import React, { useState, useMemo } from 'react';
import type { AgentSummary } from '../types';
import { activeChatsStore } from '../contexts/ActiveChatsContext';

interface NewChatModalProps {
  agents: AgentSummary[];
  onSelect: (agent: AgentSummary) => void;
  onClose: () => void;
}

export function NewChatModal({ agents, onSelect, onClose }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredAgents = (agents || []).filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.slug.toLowerCase().includes(search.toLowerCase())
  );

  // Group agents: local first, then ACP
  const { localAgents, acpAgents, flatList } = useMemo(() => {
    const local = filteredAgents.filter(a => a.source !== 'acp');
    const acp = filteredAgents.filter(a => a.source === 'acp');

    // Sort ACP agents: recently used (have active sessions) first, then alphabetical
    const chats = activeChatsStore.getSnapshot();
    const usedSlugs = new Set<string>();
    for (const chat of Object.values(chats)) {
      if (chat.agentSlug && chat.messages?.length && chat.messages.length > 0) {
        usedSlugs.add(chat.agentSlug);
      }
    }

    acp.sort((a, b) => {
      const aUsed = usedSlugs.has(a.slug) ? 1 : 0;
      const bUsed = usedSlugs.has(b.slug) ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return a.name.localeCompare(b.name);
    });

    return { localAgents: local, acpAgents: acp, flatList: [...local, ...acp] };
  }, [filteredAgents]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>New Chat</h3>
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter' && flatList[selectedIndex]) {
                onSelect(flatList[selectedIndex]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
          {localAgents.map((agent) => {
            const idx = flatList.indexOf(agent);
            return (
              <AgentRow key={agent.slug} agent={agent} isSelected={idx === selectedIndex}
                onSelect={() => onSelect(agent)} onHover={() => setSelectedIndex(idx)} />
            );
          })}
          {acpAgents.length > 0 && (
            <>
              <div style={{
                padding: '8px 20px 4px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--accent-acp)',
                borderTop: localAgents.length > 0 ? '1px solid var(--border-primary)' : undefined,
              }}>
                🔌 kiro-cli (ACP)
              </div>
              {acpAgents.map((agent) => {
                const idx = flatList.indexOf(agent);
                return (
                  <AgentRow key={agent.slug} agent={agent} isSelected={idx === selectedIndex}
                    onSelect={() => onSelect(agent)} onHover={() => setSelectedIndex(idx)} />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent, isSelected, onSelect, onHover }: {
  agent: AgentSummary; isSelected: boolean; onSelect: () => void; onHover: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        width: '100%',
        padding: '12px 20px',
        border: 'none',
        borderBottom: '1px solid var(--border-primary)',
        background: isSelected ? 'var(--accent-primary)' : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        color: isSelected ? 'white' : 'var(--text-primary)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {agent.icon && <span style={{ marginRight: '6px' }}>{agent.icon}</span>}
        {agent.source === 'acp' ? agent.slug.replace(/^kiro-/, '') : agent.name}
      </div>
      {agent.description && (
        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>{agent.description}</div>
      )}
    </button>
  );
}
