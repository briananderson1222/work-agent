import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';

export interface SlashCommand {
  cmd: string;
  description: string;
  aliases?: string[];
  isCustom?: boolean;
  source?: 'builtin' | 'custom' | 'acp';
  handler?: (args: string[]) => void | Promise<void>;
  currentModel?: string;
}

function getModelDisplayName(modelId: string): string {
  if (modelId.includes('claude-3-7-sonnet')) return 'Claude 3.7 Sonnet';
  if (modelId.includes('claude-3-5-sonnet-20241022'))
    return 'Claude 3.5 Sonnet v2';
  if (modelId.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
  if (modelId.includes('claude-3-opus')) return 'Claude 3 Opus';
  if (modelId.includes('claude-3-haiku')) return 'Claude 3 Haiku';
  return modelId;
}

export function useSlashCommands(agentSlug: string | null) {
  const { apiBase } = useApiBase();
  const agents = useAgents();
  const [acpCommands, setAcpCommands] = useState<SlashCommand[]>([]);

  const currentAgent = agentSlug
    ? agents.find((a) => a.slug === agentSlug)
    : null;
  const isAcp = currentAgent?.source === 'acp';

  useEffect(() => {
    if (!isAcp || !agentSlug) {
      setAcpCommands([]);
      return;
    }
    fetch(`${apiBase}/acp/commands/${agentSlug}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setAcpCommands(
          (data || []).map((c: any) => ({
            cmd: c.name.startsWith('/') ? c.name : `/${c.name}`,
            description: c.description || c.hint || 'ACP command',
            isCustom: true,
            source: 'acp' as const,
          })),
        );
      })
      .catch(() => setAcpCommands([]));
  }, [isAcp, agentSlug, apiBase]);

  const commands = useMemo(() => {
    const currentModelId = currentAgent?.model || 'default';
    const modelDisplayName = getModelDisplayName(currentModelId);

    const BUILTIN_COMMANDS: SlashCommand[] = [
      { cmd: '/mcp', description: 'List MCP servers for this agent' },
      {
        cmd: '/tools',
        description: 'Show available tools and auto-approved list',
      },
      {
        cmd: '/model',
        description: `Select model override (agent default: ${modelDisplayName})`,
        currentModel: modelDisplayName,
      },
      {
        cmd: '/prompts',
        description: 'List custom slash commands for this agent',
      },
      {
        cmd: '/clear',
        aliases: ['/new'],
        description: 'Clear conversation and start fresh',
      },
      { cmd: '/stats', description: 'Show conversation statistics' },
    ];

    if (!agentSlug || !currentAgent) return BUILTIN_COMMANDS;
    if (isAcp) return acpCommands;

    const customCommands = currentAgent.commands
      ? Object.values(currentAgent.commands).map((cmd: any) => ({
          cmd: `/${cmd.name}`,
          description: cmd.description || 'Custom command',
          isCustom: true,
          source: 'custom' as const,
        }))
      : [];

    return [...BUILTIN_COMMANDS, ...customCommands];
  }, [agentSlug, acpCommands, currentAgent, isAcp]);

  // Fetch live autocomplete options from kiro-cli for ACP agents
  const fetchCommandOptions = useCallback(
    async (partial: string): Promise<SlashCommand[]> => {
      if (!isAcp || !agentSlug || !partial) return [];
      try {
        const r = await fetch(
          `${apiBase}/acp/commands/${agentSlug}/options?q=${encodeURIComponent(partial)}`,
        );
        const { data } = await r.json();
        return (data || []).map((o: any) => ({
          cmd: o.name?.startsWith('/') ? o.name : `/${o.name || o.label || o}`,
          description: o.description || o.hint || '',
          source: 'acp' as const,
        }));
      } catch {
        return [];
      }
    },
    [isAcp, agentSlug, apiBase],
  );

  return { commands, fetchCommandOptions };
}
