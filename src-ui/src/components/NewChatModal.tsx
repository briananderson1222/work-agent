import { useLayoutQuery } from '@stallion-ai/sdk';
import React, { useMemo, useState } from 'react';
import { activeChatsStore } from '../contexts/ActiveChatsContext';
import type { AgentData } from '../contexts/AgentsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { AgentIcon } from './AgentIcon';

interface NewChatModalProps {
  agents: AgentData[];
  onSelect: (agent: AgentData) => void;
  onClose: () => void;
}

interface AgentGroup {
  label: string;
  icon?: string;
  agents: AgentData[];
}

export function NewChatModal({ agents, onSelect, onClose }: NewChatModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { selectedLayout } = useNavigation();
  const { data: workspace } = useLayoutQuery(selectedLayout || '', {
    enabled: !!selectedLayout,
  });

  const wsAgentSlugs = useMemo(
    () => new Set(workspace?.availableAgents || []),
    [workspace],
  );

  const { groups, flatList } = useMemo(() => {
    const filtered = (agents || []).filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.slug.toLowerCase().includes(search.toLowerCase()),
    );

    // Workspace agents: listed in workspace config OR slug prefix matches workspace plugin
    const isLayoutAgent = (a: AgentData) => {
      if (a.source === 'acp') return false;
      if (wsAgentSlugs.has(a.slug)) return true;
      // Fallback: if slug contains ':' it's a plugin agent, treat as workspace
      if (a.slug.includes(':')) return true;
      return false;
    };

    const wsAgents = filtered.filter((a) => isLayoutAgent(a));
    const globalAgents = filtered.filter(
      (a) => a.source !== 'acp' && !isLayoutAgent(a),
    );
    const acpAgents = filtered.filter((a) => a.source === 'acp');

    // Group ACP agents by connectionName
    const acpGroups = new Map<string, AgentData[]>();
    for (const a of acpAgents) {
      const conn = (a as any).connectionName || 'ACP';
      if (!acpGroups.has(conn)) acpGroups.set(conn, []);
      acpGroups.get(conn)!.push(a);
    }

    // Build groups
    const groups: AgentGroup[] = [];

    // Recently used (top 3, across all sources)
    const chats = activeChatsStore.getSnapshot();
    const recentSlugs: string[] = [];
    const chatEntries = Object.values(chats)
      .filter((c: any) => c.agentSlug && c.messages?.length > 0)
      .sort((a: any, b: any) => (b.lastActivity || 0) - (a.lastActivity || 0));
    for (const chat of chatEntries) {
      if (!recentSlugs.includes((chat as any).agentSlug))
        recentSlugs.push((chat as any).agentSlug);
      if (recentSlugs.length >= 3) break;
    }
    const recentAgents = recentSlugs
      .map((s) => filtered.find((a) => a.slug === s))
      .filter(Boolean) as AgentData[];
    const recentSet = new Set(recentSlugs);

    if (recentAgents.length > 0 && !search)
      groups.push({ label: 'Recent', icon: '🕐', agents: recentAgents });

    const wsName = workspace?.name;
    if (wsAgents.length > 0)
      groups.push({
        label: wsName || 'Workspace',
        icon: workspace?.icon,
        agents: wsAgents.filter((a) => !recentSet.has(a.slug) || !!search),
      });
    if (globalAgents.length > 0)
      groups.push({
        label: 'Global',
        icon: '🌐',
        agents: globalAgents.filter((a) => !recentSet.has(a.slug) || !!search),
      });
    for (const [conn, agents] of acpGroups) {
      const filtered = agents.filter((a) => !recentSet.has(a.slug) || !!search);
      if (filtered.length > 0)
        groups.push({ label: `${conn} (ACP)`, agents: filtered });
    }

    const flatList = groups
      .filter((g) => g.agents.length > 0)
      .flatMap((g) => g.agents);
    return { groups: groups.filter((g) => g.agents.length > 0), flatList };
  }, [agents, search, wsAgentSlugs, workspace?.icon, workspace?.name]);

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
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
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
                setSelectedIndex((p) => Math.min(p + 1, flatList.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((p) => Math.max(p - 1, 0));
              } else if (e.key === 'Enter' && flatList[selectedIndex])
                onSelect(flatList[selectedIndex]);
              else if (e.key === 'Escape') onClose();
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
          {groups.map((group, gi) => (
            <React.Fragment key={group.label}>
              <div
                style={{
                  padding: '8px 20px 4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: group.label.includes('ACP')
                    ? 'var(--accent-acp)'
                    : 'var(--text-muted)',
                  borderTop:
                    gi > 0 ? '1px solid var(--border-primary)' : undefined,
                }}
              >
                {group.icon && <>{group.icon} </>}
                {group.label}
              </div>
              {group.agents.map((agent) => {
                const idx = flatList.indexOf(agent);
                return (
                  <AgentRow
                    key={agent.slug}
                    agent={agent}
                    isSelected={idx === selectedIndex}
                    onSelect={() => onSelect(agent)}
                    onHover={() => setSelectedIndex(idx)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  isSelected,
  onSelect,
  onHover,
}: {
  agent: AgentData;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
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
      <div
        style={{
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <AgentIcon agent={agent} size="small" />
        {agent.name}
      </div>
      {agent.description && (
        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
          {agent.description}
        </div>
      )}
    </button>
  );
}
