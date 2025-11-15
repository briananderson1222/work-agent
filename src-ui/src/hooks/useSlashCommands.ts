import { useMemo } from 'react';
import { useApiBase } from '../contexts/ConfigContext';
import { useAgents } from '../contexts/AgentsContext';

export interface SlashCommand {
  cmd: string;
  description: string;
  aliases?: string[];
  isCustom?: boolean;
  handler?: (args: string[]) => void | Promise<void>;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { cmd: '/mcp', description: 'List MCP servers for this agent' },
  { cmd: '/tools', description: 'Show available tools and auto-approved list' },
  { cmd: '/model', description: 'List and select model for this conversation' },
  { cmd: '/prompts', description: 'List custom slash commands for this agent' },
  { cmd: '/clear', aliases: ['/new'], description: 'Clear conversation and start fresh' },
  { cmd: '/stats', description: 'Show conversation statistics' },
];

export function useSlashCommands(agentSlug: string | null) {
  const { apiBase } = useApiBase();
  const agents = useAgents(apiBase);
  
  return useMemo(() => {
    if (!agentSlug) return BUILTIN_COMMANDS;
    
    const currentAgent = agents.find(a => a.slug === agentSlug);
    
    if (!currentAgent?.commands) {
      return BUILTIN_COMMANDS;
    }
    
    const customCommands = Object.values(currentAgent.commands).map((cmd: any) => ({
      cmd: `/${cmd.name}`,
      description: cmd.description || 'Custom command',
      isCustom: true,
    }));
    
    return [...BUILTIN_COMMANDS, ...customCommands];
  }, [agents, agentSlug, apiBase]);
}
