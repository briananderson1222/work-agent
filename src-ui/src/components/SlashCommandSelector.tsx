import { useState, useEffect } from 'react';
import type { SlashCommand } from '../hooks/useSlashCommands';

interface SlashCommandSelectorProps {
  query: string;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandSelector({ query, commands, onSelect, onClose }: SlashCommandSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Filter commands based on query
  const filteredCommands = commands.filter(c => {
    const searchTerm = query.toLowerCase();
    const matchesCmd = c.cmd.slice(1).toLowerCase().includes(searchTerm);
    const matchesAlias = c.aliases?.some(a => a.slice(1).toLowerCase().includes(searchTerm));
    return matchesCmd || matchesAlias;
  });
  
  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex]);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);
  
  if (filteredCommands.length === 0) {
    return null;
  }
  
  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      marginBottom: '4px',
      maxHeight: '200px',
      overflowY: 'auto',
      zIndex: 1000,
      boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.1)',
    }}>
      {filteredCommands.map((command, idx) => (
        <div
          key={command.cmd}
          onClick={() => onSelect(command)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            background: idx === selectedIndex ? 'var(--bg-hover)' : 'transparent',
            borderBottom: idx < filteredCommands.length - 1 ? '1px solid var(--border-primary)' : 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>
            {command.cmd}
            {command.aliases && command.aliases.length > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {command.aliases.join(', ')}
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {command.description}
          </div>
        </div>
      ))}
    </div>
  );
}
