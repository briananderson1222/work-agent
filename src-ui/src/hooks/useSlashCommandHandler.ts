import { useTrackPlaybookRunMutation } from '@stallion-ai/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  activeChatsStore,
  useActiveChatActions,
} from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { getAllCommands, getCommand } from '../slashCommands/registry';
import '../slashCommands/builtins';
import '../slashCommands/tools';
import { findMatchingPlaybookCommand } from '../utils/playbook-commands';
import type { BindingStatus } from '../utils/execution';

export function useSlashCommandHandler() {
  const { apiBase } = useApiBase();
  const { updateChat, addEphemeralMessage } = useActiveChatActions();
  const agents = useAgents();
  const queryClient = useQueryClient();
  const trackPlaybookRunMutation = useTrackPlaybookRunMutation();

  return useCallback(
    async (
      sessionId: string,
      command: string,
      context: {
        onInputCleared?: () => void;
        availableModels?: Array<{
          id: string;
          name: string;
          originalId?: string;
        }>;
        bindingStatus?: BindingStatus;
        autocomplete: {
          openModel: () => void;
          openNewChat: () => void;
          closeCommand: () => void;
          closeAll: () => void;
        };
      },
    ) => {
      const chatState = activeChatsStore.getSnapshot()[sessionId];
      if (!chatState) return false;

      const parts = command.slice(1).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      const agent = agents.find((a) => a.slug === chatState.agentSlug);

      // Default cleanup: clear input and close autocomplete
      const cleanup = () => {
        updateChat(sessionId, { input: '' });
        context.autocomplete.closeAll();
      };

      // ACP agents: pass all slash commands through as prompt text to kiro-cli
      if (agent?.source === 'acp') {
        cleanup();
        return command; // Return the command text to be sent as a message
      }

      // 1. Check custom commands (send as message)
      if (agent?.commands?.[cmd]) {
        let expandedPrompt = agent.commands[cmd].prompt;
        const params = agent.commands[cmd].params || [];

        params.forEach((param: any, idx: number) => {
          const value = args[idx] || param.default || '';
          const escaped = param.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          expandedPrompt = expandedPrompt.replace(
            new RegExp(`{{${escaped}}}`, 'g'),
            value,
          );
        });

        cleanup();
        return expandedPrompt;
      }

      // 2. Check global prompts
      {
        const cached =
          queryClient.getQueryData<any[]>(['playbooks']) ??
          queryClient.getQueryData<any[]>(['prompts']);
        const match = findMatchingPlaybookCommand(
          cached,
          cmd,
          chatState.agentSlug,
        );
        if (match) {
          void trackPlaybookRunMutation
            .mutateAsync(match.id)
            .catch(() => undefined);
          cleanup();
          return match.content;
        }
      }

      // 3. Check registered commands
      const handler = getCommand(cmd);
      if (handler) {
        cleanup();

        await handler({
          sessionId,
          chatState,
          agent,
          args,
          apiBase,
          availableModels: context.availableModels,
          bindingStatus: context.bindingStatus,
          updateChat,
          addEphemeralMessage,
          queryClient,
          sendMessage: async () => {},
          autocomplete: context.autocomplete,
        });

        return true;
      }

      // 4. CLI runtime passthrough — forward unrecognized commands to the SDK
      if (chatState.provider === 'claude' || chatState.provider === 'codex') {
        cleanup();
        return command; // Raw text forwarded to sendOrchestrationTurn
      }

      // 5. Unknown command
      const availableCommands = getAllCommands();
      addEphemeralMessage(sessionId, {
        role: 'system',
        content: `Unknown command: ${command}\n\nAvailable:\n${availableCommands.map((c) => `• /${c}`).join('\n')}`,
      });
      cleanup();
      return true;
    },
    [
      apiBase,
      agents,
      updateChat,
      addEphemeralMessage,
      queryClient,
      trackPlaybookRunMutation,
    ],
  );
}
