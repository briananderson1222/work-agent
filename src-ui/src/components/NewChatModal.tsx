import React, { useState } from 'react';
import type { AgentSummary } from '../types';

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
                setSelectedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter' && filteredAgents[selectedIndex]) {
                onSelect(filteredAgents[selectedIndex]);
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
          {filteredAgents.map((agent, idx) => (
            <button
              key={agent.slug}
              onClick={() => onSelect(agent)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                width: '100%',
                padding: '12px 20px',
                border: 'none',
                borderBottom: '1px solid var(--border-primary)',
                background: idx === selectedIndex ? 'var(--accent-primary)' : 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                color: idx === selectedIndex ? 'white' : 'var(--text-primary)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: 600 }}>{agent.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
