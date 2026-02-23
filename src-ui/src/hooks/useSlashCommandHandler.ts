import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useApiBase } from '../contexts/ApiBaseContext';
import { getCommand, getAllCommands } from '../slashCommands/registry';
import '../slashCommands/builtins';
import '../slashCommands/tools';

export function useSlashCommandHandler() {
  const { apiBase } = useApiBase();
  const { updateChat, addEphemeralMessage } = useActiveChatActions();
  const agents = useAgents();
  const queryClient = useQueryClient();

  return useCallback(async (
    sessionId: string, 
    command: string,
    context: {
      onInputCleared?: () => void;
      autocomplete: {
        openModel: () => void;
        closeCommand: () => void;
        closeAll: () => void;
      };
    }
  ) => {
    const chatState = activeChatsStore.getSnapshot()[sessionId];
    if (!chatState) return false;

    const parts = command.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const agent = agents.find(a => a.slug === chatState.agentSlug);

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
        expandedPrompt = expandedPrompt.replace(new RegExp(`{{${param.name}}}`, 'g'), value);
      });
      
      cleanup();
      return expandedPrompt;
    }

    // 2. Check registered commands
    const handler = getCommand(cmd);
    if (handler) {
      cleanup();
      
      await handler({
        sessionId,
        chatState,
        agent,
        args,
        apiBase,
        updateChat,
        addEphemeralMessage,
        queryClient,
        autocomplete: context.autocomplete,
      });
      
      return true;
    }

    // 3. Unknown command
    const availableCommands = getAllCommands();
    addEphemeralMessage(sessionId, { 
      role: 'system', 
      content: `Unknown command: ${command}\n\nAvailable:\n${availableCommands.map(c => `• /${c}`).join('\n')}`
    });
    clearAndClose();
    return true;
  }, [apiBase, agents, updateChat, addEphemeralMessage, queryClient]);
}
