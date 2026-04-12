import {
  fetchAcpCommandOptions,
  useAcpCommandsQuery,
  usePromptsQuery,
} from '@stallion-ai/sdk';
import { useCallback, useMemo } from 'react';
import { useAgents } from '../contexts/AgentsContext';
import type { ChatUIState } from '../contexts/active-chats-state';
import { promptSlug } from '../slashCommands/utils';
import type { BindingStatus } from '../utils/execution';

export interface SlashCommand {
  cmd: string;
  description: string;
  aliases?: string[];
  isCustom?: boolean;
  source?: 'builtin' | 'custom' | 'acp' | 'prompt';
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

export function useSlashCommands(
  agentSlug: string | null,
  _chatState?: ChatUIState | null,
  bindingStatus?: BindingStatus,
) {
  const agents = useAgents();
  const { data: prompts } = usePromptsQuery();

  const currentAgent = agentSlug
    ? agents.find((a) => a.slug === agentSlug)
    : null;
  const isAcp = currentAgent?.source === 'acp';
  const { data: acpCommandData = [] } = useAcpCommandsQuery(agentSlug, {
    enabled: isAcp,
  });

  const acpCommands = useMemo(
    () =>
      acpCommandData.map((command) => ({
        cmd: command.name.startsWith('/') ? command.name : `/${command.name}`,
        description: command.description || command.hint || 'ACP command',
        isCustom: true,
        source: 'acp' as const,
      })),
    [acpCommandData],
  );

  const commands = useMemo(() => {
    const currentModelId = currentAgent?.model || 'default';
    const modelDisplayName = getModelDisplayName(currentModelId);
    const support = bindingStatus?.capabilityState ?? {
      system_prompt: true,
      mcp: false,
      tool_execution: false,
      model_catalog: false,
      model_selection: false,
    };

    const BUILTIN_COMMANDS: SlashCommand[] = [
      {
        cmd: '/prompts',
        description: 'List available prompts and custom commands',
      },
      {
        cmd: '/clear',
        aliases: ['/new'],
        description: 'Clear conversation and start fresh',
      },
      { cmd: '/stats', description: 'Show conversation statistics' },
      {
        cmd: '/resume',
        aliases: ['/chat'],
        description: 'Open a new or existing conversation',
      },
    ];

    if (support.mcp) {
      BUILTIN_COMMANDS.unshift({
        cmd: '/mcp',
        description: 'List MCP servers for this agent',
      });
    }

    if (support.tool_execution) {
      BUILTIN_COMMANDS.splice(support.mcp ? 1 : 0, 0, {
        cmd: '/tools',
        description: 'Show available tools and auto-approved list',
      });
    }

    if (support.model_selection) {
      BUILTIN_COMMANDS.splice(
        support.mcp && support.tool_execution
          ? 2
          : support.mcp || support.tool_execution
            ? 1
            : 0,
        0,
        {
          cmd: '/model',
          description: `Select model override (agent default: ${modelDisplayName})`,
          currentModel: modelDisplayName,
        },
      );
    }

    const promptCommands: SlashCommand[] = (prompts || [])
      .filter((p: any) => p.global || (agentSlug && p.agent === agentSlug))
      .map((p: any) => ({
        cmd: `/${promptSlug(p.name)}`,
        description: p.description || p.name,
        source: 'prompt' as const,
      }));

    if (!agentSlug || !currentAgent)
      return [...BUILTIN_COMMANDS, ...promptCommands];
    if (isAcp) return acpCommands;

    const customCommands = currentAgent.commands
      ? Object.values(currentAgent.commands).map((cmd: any) => ({
          cmd: `/${cmd.name}`,
          description: cmd.description || 'Custom command',
          isCustom: true,
          source: 'custom' as const,
        }))
      : [];

    return [...BUILTIN_COMMANDS, ...customCommands, ...promptCommands];
  }, [agentSlug, acpCommands, currentAgent, isAcp, prompts, bindingStatus]);

  // Fetch live autocomplete options from kiro-cli for ACP agents
  const fetchCommandOptions = useCallback(
    async (partial: string): Promise<SlashCommand[]> => {
      if (!isAcp || !agentSlug || !partial) return [];
      try {
        const options = await fetchAcpCommandOptions(agentSlug, partial);
        return options.map((option: any) => ({
          cmd: option.name?.startsWith('/')
            ? option.name
            : `/${option.name || option.label || option}`,
          description: option.description || option.hint || '',
          source: 'acp' as const,
        }));
      } catch {
        return [];
      }
    },
    [isAcp, agentSlug],
  );

  return { commands, fetchCommandOptions };
}
