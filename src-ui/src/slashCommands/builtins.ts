import { agentQueries } from '@stallion-ai/sdk';
import { registerCommand } from './registry';

// MCP command
registerCommand(
  'mcp',
  async ({ chatState, queryClient, addEphemeralMessage, sessionId }) => {
    try {
      const data = await queryClient.fetchQuery(
        agentQueries.agent(chatState.agentSlug),
      );

      const tools = data?.tools || [];

      const mcpServers = [
        ...new Set(
          tools
            .map((t: any) => {
              const name = typeof t === 'string' ? t : t.name || t.id || '';
              return name.includes('_') ? name.split('_')[0] : null;
            })
            .filter((s: string | null) => s !== null),
        ),
      ].sort();

      const content =
        mcpServers.length > 0
          ? `**MCP Servers (${mcpServers.length}):**\n\n${mcpServers.map((s: string) => `- ${s}`).join('\n')}`
          : 'No MCP servers loaded for this agent.';

      addEphemeralMessage(sessionId, { role: 'system', content });
    } catch (error) {
      addEphemeralMessage(sessionId, {
        role: 'system',
        content: `Error: ${error}`,
      });
    }
  },
);

// Prompts command
registerCommand(
  'prompts',
  async ({ agent, addEphemeralMessage, sessionId }) => {
    if (agent?.commands && Object.keys(agent.commands).length > 0) {
      const commandList = Object.values(agent.commands)
        .map((cmd: any) => {
          const params =
            cmd.params
              ?.map((p: any) => `${p.name}${p.required === false ? '?' : ''}`)
              .join(' ') || '';
          return `• **/${cmd.name}** ${params ? `\`${params}\`` : ''}\n  ${cmd.description || 'No description'}`;
        })
        .join('\n\n');
      addEphemeralMessage(sessionId, {
        role: 'system',
        content: `**Custom Slash Commands (${Object.keys(agent.commands).length})**\n\n${commandList}`,
      });
    } else {
      addEphemeralMessage(sessionId, {
        role: 'system',
        content: 'No custom slash commands defined for this agent.',
      });
    }
  },
);

// Model command - override default by setting input and opening model selector
registerCommand('model', async ({ updateChat, sessionId, autocomplete }) => {
  autocomplete.closeCommand();
  updateChat(sessionId, { input: '/model ' });
  autocomplete.openModel();
});

// Stats command
registerCommand(
  'stats',
  async ({ sessionId, chatState, queryClient, addEphemeralMessage }) => {
    try {
      if (!chatState.conversationId) {
        addEphemeralMessage(sessionId, {
          role: 'system',
          content: 'No conversation ID available.',
        });
        return;
      }

      const stats = await queryClient.fetchQuery(
        agentQueries.stats(chatState.agentSlug, chatState.conversationId),
      );

      const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 14px;">
        <strong style="font-size: 16px;">Conversation Statistics</strong><br/><br/>
        
        <details open style="margin-bottom: 12px;">
          <summary style="cursor: pointer; font-weight: 600; padding: 8px; background: var(--bg-secondary); border-radius: 4px; user-select: none;">
            Context Window Usage
          </summary>
          <div style="padding: 12px 8px;">
            <span style="color: var(--text-muted);">${stats.contextTokens?.toLocaleString() || 0} tokens (all messages + system prompt + tools)</span><br/>
            <div style="background: var(--bg-tertiary); height: 8px; border-radius: 4px; margin-top: 8px; overflow: hidden;">
              <div style="background: #10b981; height: 100%; width: ${stats.contextWindowPercentage || 0}%;"></div>
            </div>
            <span style="font-weight: 600; margin-top: 4px; display: inline-block;">${(stats.contextWindowPercentage || 0).toFixed(1)}%</span>
          </div>
        </details>
        
        <details open style="margin-bottom: 12px;">
          <summary style="cursor: pointer; font-weight: 600; padding: 8px; background: var(--bg-secondary); border-radius: 4px; user-select: none;">
            Context Breakdown
          </summary>
          <div style="padding: 12px 8px;">
            <table style="width: 100%;">
              <tr><td>System Prompt:</td><td style="text-align: right;">${stats.systemPromptTokens?.toLocaleString() || 0}</td></tr>
              <tr><td>MCP Tools:</td><td style="text-align: right;">${stats.mcpServerTokens?.toLocaleString() || 0}</td></tr>
              <tr><td>User Messages:</td><td style="text-align: right;">${stats.userMessageTokens?.toLocaleString() || 0}</td></tr>
              <tr><td>Assistant Messages:</td><td style="text-align: right;">${stats.assistantMessageTokens?.toLocaleString() || 0}</td></tr>
            </table>
          </div>
        </details>
        
        <details open style="margin-bottom: 12px;">
          <summary style="cursor: pointer; font-weight: 600; padding: 8px; background: var(--bg-secondary); border-radius: 4px; user-select: none;">
            Total LLM Consumption
          </summary>
          <div style="padding: 12px 8px;">
            <span style="color: var(--text-muted); font-size: 12px;">Tokens sent/received across all API calls</span><br/>
            <div style="margin-top: 8px;">
              In: <strong>${stats.inputTokens?.toLocaleString() || 0}</strong><br/>
              Out: <strong>${stats.outputTokens?.toLocaleString() || 0}</strong><br/>
              Total: <strong>${stats.totalTokens?.toLocaleString() || 0}</strong>
            </div>
          </div>
        </details>
        
        <details style="margin-bottom: 12px;">
          <summary style="cursor: pointer; font-weight: 600; padding: 8px; background: var(--bg-secondary); border-radius: 4px; user-select: none;">
            Activity & Cost
          </summary>
          <div style="padding: 12px 8px;">
            <div style="margin-bottom: 12px;">
              <strong>Activity</strong><br/>
              Turns: <strong>${stats.turns || 0}</strong><br/>
              Tool Calls: <strong>${stats.toolCalls || 0}</strong>
            </div>
            <div>
              <strong>Cost</strong><br/>
              Total: <strong>$${(stats.estimatedCost || 0).toFixed(4)}</strong><br/>
              Per Turn: <strong>$${((stats.estimatedCost || 0) / (stats.turns || 1)).toFixed(4)}</strong>
            </div>
          </div>
        </details>
        
        ${
          stats.modelStats && Object.keys(stats.modelStats).length > 0
            ? `
          <details style="margin-bottom: 12px;">
            <summary style="cursor: pointer; font-weight: 600; padding: 8px; background: var(--bg-secondary); border-radius: 4px; user-select: none;">
              Per-Model Breakdown
            </summary>
            <div style="padding: 12px 8px;">
              ${Object.entries(stats.modelStats)
                .map(
                  ([modelId, modelData]: [string, any]) => `
                <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px;">
                  <div style="font-family: monospace; font-size: 12px; margin-bottom: 8px;">${modelId}</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                    <div>
                      <strong>Consumed</strong><br/>
                      In: ${modelData.inputTokens?.toLocaleString() || 0}<br/>
                      Out: ${modelData.outputTokens?.toLocaleString() || 0}<br/>
                      Total: ${modelData.totalTokens?.toLocaleString() || 0}
                    </div>
                    <div>
                      <strong>Stats</strong><br/>
                      Turns: ${modelData.turns || 0}<br/>
                      Tool Calls: ${modelData.toolCalls || 0}<br/>
                      Cost: $${(modelData.estimatedCost || 0).toFixed(4)}
                    </div>
                  </div>
                </div>
              `,
                )
                .join('')}
            </div>
          </details>
        `
            : ''
        }
      </div>
    `;

      addEphemeralMessage(sessionId, {
        role: 'system',
        content: html,
        contentType: 'html',
      });
    } catch (error) {
      addEphemeralMessage(sessionId, {
        role: 'system',
        content: `Error fetching stats: ${error}`,
      });
    }
  },
);

// Clear/New command
registerCommand(
  'clear',
  async ({ updateChat, sessionId, addEphemeralMessage }) => {
    updateChat(sessionId, { messages: [] });
    addEphemeralMessage(sessionId, {
      role: 'system',
      content: 'Conversation cleared',
    });
  },
);

registerCommand(
  'new',
  async ({ updateChat, sessionId, addEphemeralMessage }) => {
    updateChat(sessionId, { messages: [] });
    addEphemeralMessage(sessionId, {
      role: 'system',
      content: 'Conversation cleared',
    });
  },
);
