import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import { FunctionTool, McpClient } from '@strands-agents/sdk';
import {
  normalizeToolName,
  parseToolName,
} from '../utils/tool-name-normalizer.js';
import type { ITool } from './types.js';
import type { CreateAgentOptions } from './voltagent-adapter.js';

export interface StrandsToolLoaderState {
  mcpClients: Map<string, McpClient>;
  agentMcpClients: Map<string, string[]>;
}

type StrandsToolLoadOptions = Pick<
  CreateAgentOptions,
  | 'configLoader'
  | 'mcpConnectionStatus'
  | 'integrationMetadata'
  | 'toolNameMapping'
  | 'toolNameReverseMapping'
  | 'logger'
>;

export function createStrandsFunctionTools(
  tools: ITool[],
  deniedToolUseIds: Set<string>,
): FunctionTool[] {
  return tools.map(
    (tool) =>
      new FunctionTool({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.parameters as any,
        callback: async (input: unknown, toolContext: any) => {
          const toolUseId = toolContext?.toolUse?.toolUseId;
          if (toolUseId && deniedToolUseIds.has(toolUseId)) {
            deniedToolUseIds.delete(toolUseId);
            return `Tool '${tool.name}' was denied by the user.`;
          }
          return tool.execute(input);
        },
      }),
  );
}

export function applyStrandsAvailableToolFilter(
  tools: ITool[],
  available: string[] = ['*'],
): ITool[] {
  if (available.includes('*')) {
    return tools;
  }

  return tools.filter((tool) =>
    available.some((pattern) => {
      if (pattern === tool.name) {
        return true;
      }
      if (pattern.endsWith('*')) {
        return tool.name.startsWith(pattern.slice(0, -1));
      }
      return false;
    }),
  );
}

export async function loadStrandsTools(options: {
  slug: string;
  spec: AgentSpec;
  opts: StrandsToolLoadOptions;
  state: StrandsToolLoaderState;
}): Promise<ITool[]> {
  const { slug, spec, opts, state } = options;
  if (!spec.tools?.mcpServers?.length) {
    return [];
  }

  const allTools: ITool[] = [];
  const agentClientIds: string[] = [];

  for (const toolId of spec.tools.mcpServers) {
    try {
      const toolDef = await opts.configLoader.loadIntegration(toolId);

      if (toolDef.kind !== 'mcp') {
        continue;
      }
      if (toolDef.transport !== 'stdio' && toolDef.transport !== 'process') {
        opts.logger.warn('Strands adapter only supports stdio MCP transport', {
          toolId,
          transport: toolDef.transport,
        });
        continue;
      }

      let client = state.mcpClients.get(toolId);
      if (!client) {
        const args = (toolDef.args || []).map((arg: string) =>
          arg === './' ? process.cwd() : arg,
        );
        client = new McpClient({
          transport: new StdioClientTransport({
            command: toolDef.command!,
            args,
            env: { ...process.env, ...toolDef.env } as Record<string, string>,
          }),
        });
        state.mcpClients.set(toolId, client);
      }

      const mcpTools = await client.listTools();

      for (const tool of mcpTools) {
        const normalized = normalizeToolName(tool.toolSpec.name);
        if (normalized !== tool.toolSpec.name) {
          const parsed = parseToolName(tool.toolSpec.name);
          opts.toolNameMapping.set(normalized, {
            original: tool.toolSpec.name,
            normalized,
            server: parsed.server,
            tool: parsed.tool,
          });
          opts.toolNameReverseMapping.set(tool.toolSpec.name, normalized);
        }

        allTools.push({
          name: normalized,
          description: tool.toolSpec.description,
          parameters: tool.toolSpec.inputSchema,
          execute: async (input: any) => client!.callTool(tool, input),
        } as ITool);
      }

      opts.mcpConnectionStatus.set(toolId, { connected: true });
      opts.integrationMetadata.set(toolId, {
        type: 'mcp',
        transport: toolDef.transport,
        toolCount: mcpTools.length,
      });
      agentClientIds.push(toolId);

      opts.logger.info('Strands MCP tools loaded', {
        agent: slug,
        tool: toolId,
        count: mcpTools.length,
      });
    } catch (error) {
      opts.logger.error('Failed to load MCP tool via Strands', {
        agent: slug,
        toolId,
        error,
      });
      opts.mcpConnectionStatus.set(toolId, {
        connected: false,
        error: String(error),
      });
    }
  }

  state.agentMcpClients.set(slug, agentClientIds);
  return applyStrandsAvailableToolFilter(
    allTools,
    spec.tools.available || ['*'],
  );
}

export async function destroyStrandsAgentTools(
  slug: string,
  state: StrandsToolLoaderState,
): Promise<void> {
  const clientIds = state.agentMcpClients.get(slug);
  if (!clientIds) {
    return;
  }

  for (const id of clientIds) {
    const client = state.mcpClients.get(id);
    if (!client) {
      continue;
    }
    await client.disconnect().catch(() => {});
    state.mcpClients.delete(id);
  }

  state.agentMcpClients.delete(slug);
}
