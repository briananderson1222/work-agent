import { useCallback } from 'react';
import { useActiveChatActions, activeChatsStore } from '../contexts/ActiveChatsContext';
import { useAgents } from '../contexts/AgentsContext';
import { useModels } from '../contexts/ModelsContext';

export function useSlashCommandHandler(apiBase: string) {
  const { updateChat } = useActiveChatActions();
  const agents = useAgents(apiBase);
  const availableModels = useModels(apiBase);

  return useCallback(async (sessionId: string, command: string, onShowModelSelector?: () => void, onShowStats?: () => void) => {
    const chatState = activeChatsStore.getSnapshot()[sessionId];
    if (!chatState) return false;

    const parts = command.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // Check for custom agent commands first
    const agent = agents.find(a => a.slug === chatState.agentSlug);
    if (agent?.commands && agent.commands[cmd]) {
      const customCmd = agent.commands[cmd];
      const args = parts.slice(1);
      
      // Parse parameters and expand template
      let expandedPrompt = customCmd.prompt;
      const params = customCmd.params || [];
      
      params.forEach((param: any, idx: number) => {
        const value = args[idx] || param.default || '';
        expandedPrompt = expandedPrompt.replace(new RegExp(`{{${param.name}}}`, 'g'), value);
      });
      
      // Return expanded prompt to be sent as regular message
      updateChat(sessionId, { input: expandedPrompt });
      return expandedPrompt;
    }

    let responseContent = '';

    if (cmd === 'mcp') {
      try {
        const response = await fetch(`${apiBase}/agents/${chatState.agentSlug}`);
        const data = await response.json();
        const agentData = data.data;
        
        const tools = agentData?.tools || [];
        
        const mcpServers = [...new Set(
          tools
            .map((t: any) => {
              const name = typeof t === 'string' ? t : (t.name || t.id || '');
              return name.includes('_') ? name.split('_')[0] : null;
            })
            .filter((s: string | null) => s !== null)
        )].sort();
        
        if (mcpServers.length > 0) {
          responseContent = `**MCP Servers (${mcpServers.length}):**\n\n${mcpServers.map((s: string) => `- ${s}`).join('\n')}`;
        } else {
          responseContent = `No MCP servers loaded for this agent.`;
        }
      } catch (error) {
        responseContent = `Error: ${error}`;
      }
    } else if (cmd === 'tools') {
      try {
        const response = await fetch(`${apiBase}/agents/${chatState.agentSlug}`);
        const data = await response.json();
        const voltAgentData = data.data;
        
        const tools = voltAgentData?.tools || [];
        const autoApproveList = agent?.toolsConfig?.autoApprove || [];
        const sessionAutoApprove = chatState.sessionAutoApprove || [];
        
        if (tools.length > 0) {
          const sortedTools = [...tools].sort((a: any, b: any) => {
            const nameA = typeof a === 'string' ? a : (a.name || a.id || '');
            const nameB = typeof b === 'string' ? b : (b.name || b.id || '');
            return nameA.localeCompare(nameB);
          });
          
          const toolLines = sortedTools.map((t: any) => {
            const name = typeof t === 'string' ? t : (t.name || t.id || 'unknown');
            
            // Check both agent autoApprove and session autoApprove
            const isAutoApproved = autoApproveList.includes(name) || autoApproveList.some((pattern: string) => {
              if (pattern.includes('*')) {
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return regex.test(name);
              }
              return pattern === name;
            });
            
            const isSessionTrusted = sessionAutoApprove.includes(name);
            const trusted = isAutoApproved ? '✓' : (isSessionTrusted ? '⏱' : '');
            
            let params = '';
            if (t.parameters?.properties) {
              const required = t.parameters.required || [];
              const allParams = Object.keys(t.parameters.properties);
              const sortedParams = [
                ...allParams.filter(p => required.includes(p)),
                ...allParams.filter(p => !required.includes(p))
              ];
              const paramNames = sortedParams.map(p => 
                required.includes(p) ? p : `${p}*`
              );
              params = paramNames.length > 0 ? paramNames.join(', ') : 'none';
            }
            
            let desc = t.description || 'No description';
            desc = desc.replace(/\s+/g, ' ').replace(/^#+\s*/g, '').trim();
            if (desc.length > 200) {
              desc = desc.substring(0, 197) + '...';
            }
            
            return `| ${name} | ${desc} | ${params} | ${trusted} |`;
          });
          
          responseContent = `**Tools (${tools.length}):**\n\n| Tool | Description | Parameters (* optional) | Trusted |\ n|------|-------------|-------------------------|:-------:|\n${toolLines.join('\n')}\n\n✓ = Always trusted | ⏱ = Trusted this session`;
        } else {
          responseContent = `No tools configured.`;
        }
      } catch (error) {
        responseContent = `Error: ${error}`;
      }
    } else if (cmd === 'model') {
      onShowModelSelector?.();
      updateChat(sessionId, { input: '' });
      return true;
    } else if (cmd === 'clear' || cmd === 'new') {
      // Clear by creating new session - handled by caller
      updateChat(sessionId, { input: '' });
      return 'CLEAR';
    } else if (cmd === 'stats') {
      onShowStats?.();
      updateChat(sessionId, { input: '' });
      return true;
    } else if (cmd === 'prompts') {
      if (agent?.commands && Object.keys(agent.commands).length > 0) {
        const commandList = Object.values(agent.commands).map((cmd: any) => {
          const params = cmd.params?.map((p: any) => 
            `${p.name}${p.required === false ? '?' : ''}`
          ).join(' ') || '';
          return `• **/${cmd.name}** ${params ? `\`${params}\`` : ''}\n  ${cmd.description || 'No description'}`;
        }).join('\n\n');
        responseContent = `**Custom Slash Commands (${Object.keys(agent.commands).length})**\n\n${commandList}`;
      } else {
        responseContent = `No custom slash commands defined for this agent.`;
      }
    } else {
      responseContent = `Unknown command: ${command}\n\nAvailable:\n• /mcp - List MCP servers\n• /tools - Show tools\n• /model - Change model\n• /prompts - List custom commands\n• /clear or /new - Clear conversation\n• /stats - Show conversation statistics`;
    }

    // Add ephemeral message
    const currentMessages = chatState.messages || [];
    updateChat(sessionId, {
      input: '',
      messages: [...currentMessages, { role: 'system' as const, content: responseContent }]
    });
    
    return true;
  }, [apiBase, agents, availableModels, updateChat]);
}
