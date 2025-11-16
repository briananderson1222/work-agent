import { useMemo } from 'react';
import { AutocompleteSelector, AutocompleteItem } from './AutocompleteSelector';
import type { SlashCommand } from '../hooks/useSlashCommands';

interface SlashCommandSelectorProps {
  query: string;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandSelector({ query, commands, onSelect, onClose }: SlashCommandSelectorProps) {
  // Filter and map commands to AutocompleteItem format
  const items = useMemo(() => {
    const filtered = commands.filter(c => {
      const searchTerm = query.toLowerCase();
      const matchesCmd = c.cmd.slice(1).toLowerCase().includes(searchTerm);
      const matchesAlias = c.aliases?.some(a => a.slice(1).toLowerCase().includes(searchTerm));
      return matchesCmd || matchesAlias;
    });

    return filtered.map(cmd => ({
      id: cmd.cmd,
      title: `${cmd.cmd}${cmd.aliases && cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : ''}`,
      description: cmd.description,
      metadata: cmd
    }));
  }, [query, commands]);

  return (
    <AutocompleteSelector
      items={items}
      onSelect={(item) => onSelect(item.metadata)}
      onClose={onClose}
      emptyMessage="No commands found"
    />
  );
}
