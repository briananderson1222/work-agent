import type { ProviderKind } from '@stallion-ai/contracts/provider';
import { usePromptsQuery } from '@stallion-ai/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useRuntimeCommands } from './useRuntimeCommands';

export interface SlashCommand {
  cmd: string;
  description: string;
  aliases?: string[];
  isCustom?: boolean;
  source?: 'builtin' | 'custom' | 'acp' | 'prompt' | 'runtime';
  handler?: (args: string[]) => void | Promise<void>;
  currentModel?: string;
}

export function promptSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

const PLATFORM_COMMANDS: SlashCommand[] = [
  {
    cmd: '/help',
    description: 'List available commands',
    source: 'builtin' as const,
  },
  {
    cmd: '/clear',
    aliases: ['/new'],
    description: 'Clear conversation and start fresh',
    source: 'builtin' as const,
  },
  {
    cmd: '/stats',
    description: 'Show conversation statistics',
    source: 'builtin' as const,
  },
  {
    cmd: '/resume',
    aliases: ['/chat'],
    description: 'Open a new or existing conversation',
    source: 'builtin' as const,
  },
  {
    cmd: '/prompts',
    description: 'List available prompts and custom commands',
    source: 'builtin' as const,
  },
];

const BEDROCK_RUNTIME_COMMANDS: SlashCommand[] = [
  {
    cmd: '/mcp',
    description: 'List MCP servers for this agent',
    source: 'runtime' as const,
  },
  {
    cmd: '/tools',
    description: 'Show available tools and auto-approved list',
    source: 'runtime' as const,
  },
  {
    cmd: '/model',
    description: 'Select model override',
    source: 'runtime' as const,
  },
];

export function useSlashCommands(
  agentSlug: string | null,
  provider?: ProviderKind,
) {
  const { apiBase } = useApiBase();
  const agents = useAgents();
  const [acpCommands, setAcpCommands] = useState<SlashCommand[]>([]);
  const { data: prompts } = usePromptsQuery();
  const runtimeCommands = useRuntimeCommands(provider);

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

    const promptCommands: SlashCommand[] = (prompts || [])
      .filter((p: any) => p.global || (agentSlug && p.agent === agentSlug))
      .map((p: any) => ({
        cmd: `/${promptSlug(p.name)}`,
        description: p.description || p.name,
        source: 'prompt' as const,
      }));

    if (isAcp) return acpCommands;

    const customCommands = currentAgent?.commands
      ? Object.values(currentAgent.commands).map((cmd: any) => ({
          cmd: `/${cmd.name}`,
          description: cmd.description || 'Custom command',
          isCustom: true,
          source: 'custom' as const,
        }))
      : [];

    const isBedrock = !provider || provider === 'bedrock';
    const bedrockCmds = BEDROCK_RUNTIME_COMMANDS.map((cmd) =>
      cmd.cmd === '/model'
        ? {
            ...cmd,
            description: `Select model override (agent default: ${modelDisplayName})`,
            currentModel: modelDisplayName,
          }
        : cmd,
    );
    const runtimeCmds = isBedrock ? bedrockCmds : runtimeCommands;

    const platformNames = new Set(PLATFORM_COMMANDS.map((c) => c.cmd));
    const filteredRuntime = runtimeCmds.filter(
      (c) => !platformNames.has(c.cmd),
    );

    return [
      ...PLATFORM_COMMANDS,
      ...filteredRuntime,
      ...customCommands,
      ...promptCommands,
    ];
  }, [
    agentSlug,
    acpCommands,
    currentAgent,
    isAcp,
    prompts,
    runtimeCommands,
    provider,
  ]);

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
