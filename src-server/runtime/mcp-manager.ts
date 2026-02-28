/**
 * MCP (Model Context Protocol) management functions
 * Handles MCP server lifecycle, tool loading, and tool name normalization
 */

import { Tool, MCPConfiguration } from '@voltagent/core';
import { normalizeToolName, parseToolName } from '../utils/tool-name-normalizer.js';
import type { ToolDef, AgentSpec } from '../domain/types.js';
import type { ConfigLoader } from '../domain/config-loader.js';

/**
 * Reference counting for MCP connections - tracks which agents use each toolId
 */
const mcpRefCounts = new Map<string, Set<string>>();

/**
 * Release MCP reference for an agent and clean up if no more references
 */
export function releaseMCPRef(
  agentSlug: string,
  toolId: string,
  mcpConfigs: Map<string, MCPConfiguration>,
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>,
  integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }>
): void {
  const mcpKey = toolId;
  const refSet = mcpRefCounts.get(mcpKey);
  
  if (refSet) {
    refSet.delete(agentSlug);
    
    // Clean up if no more references
    if (refSet.size === 0) {
      mcpRefCounts.delete(mcpKey);
      mcpConfigs.delete(mcpKey);
      mcpConnectionStatus.delete(mcpKey);
      integrationMetadata.delete(mcpKey);
    }
  }
}

/**
 * Create MCP server configuration from tool definition
 */
export function createMCPServerConfig(toolDef: ToolDef): any {
  if (toolDef.transport === 'stdio' || toolDef.transport === 'process') {
    // Replace ./ with actual cwd for cross-platform compatibility
    const args = (toolDef.args || []).map(arg => 
      arg === './' ? process.cwd() : arg
    );
    
    return {
      type: 'stdio',
      command: toolDef.command,
      args,
      env: toolDef.env,
      timeout: toolDef.timeouts?.startupMs,
    };
  } else if (toolDef.transport === 'ws') {
    return {
      type: 'streamable-http',
      url: toolDef.endpoint,
      timeout: toolDef.timeouts?.startupMs,
    };
  } else if (toolDef.transport === 'tcp') {
    return {
      type: 'http',
      url: toolDef.endpoint,
      timeout: toolDef.timeouts?.startupMs,
    };
  }

  throw new Error(`Unsupported transport: ${toolDef.transport}`);
}

/**
 * Create MCP tools for a tool definition
 */
export async function createMCPTools(
  agentSlug: string,
  toolId: string,
  toolDef: ToolDef,
  mcpConfigs: Map<string, MCPConfiguration>,
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>,
  integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }>,
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>,
  toolNameReverseMapping: Map<string, string>,
  logger: any
): Promise<Tool<any>[]> {
  const mcpKey = toolId;

  let mcpConfig: MCPConfiguration;
  let isNewConfig = false;

  // Add agent to ref count
  if (!mcpRefCounts.has(mcpKey)) {
    mcpRefCounts.set(mcpKey, new Set());
  }
  mcpRefCounts.get(mcpKey)!.add(agentSlug);

  // Check if MCP config already exists
  if (mcpConfigs.has(mcpKey)) {
    mcpConfig = mcpConfigs.get(mcpKey)!;
  } else {
    // Create new MCP configuration
    const serverConfig: any = {
      [toolId]: createMCPServerConfig(toolDef),
    };

    mcpConfig = new MCPConfiguration({
      servers: serverConfig,
    });

    mcpConfigs.set(mcpKey, mcpConfig);
    isNewConfig = true;
    
    // Set up event listeners for connection status
    const clients = await mcpConfig.getClients();
    const client = clients[toolId];
    
    if (client) {
      client.on('connect', () => {
        mcpConnectionStatus.set(mcpKey, { connected: true });
        logger.debug('MCP client connected', { agent: agentSlug, tool: toolId });
      });
      
      client.on('disconnect', () => {
        mcpConnectionStatus.set(mcpKey, { connected: false });
        logger.debug('MCP client disconnected', { agent: agentSlug, tool: toolId });
      });
      
      client.on('error', (error: Error) => {
        mcpConnectionStatus.set(mcpKey, { connected: false, error: error.message });
        logger.error('MCP client error', { agent: agentSlug, tool: toolId, error: error.message });
      });
    }
  }

  // Get tools from MCP server
  const tools = await mcpConfig.getTools();
  
  // Normalize tool names for Nova compatibility and store mapping with parsed data
  const normalizedTools = tools.map(tool => {
    const normalized = normalizeToolName(tool.name);
    
    // Store mapping with parsed data if name changed
    if (normalized !== tool.name) {
      const parsed = parseToolName(tool.name);
      toolNameMapping.set(normalized, {
        original: tool.name,
        normalized: normalized,
        server: parsed.server,
        tool: parsed.tool
      });
      toolNameReverseMapping.set(tool.name, normalized);
      
      logger.debug('Tool name normalized', {
        agent: agentSlug,
        original: tool.name,
        normalized: normalized,
        server: parsed.server,
        tool: parsed.tool
      });
    }
    
    return {
      ...tool,
      name: normalized
    };
  });
  
  // Mark as connected after successful getTools
  mcpConnectionStatus.set(mcpKey, { connected: true });
  
  // Store integration metadata
  integrationMetadata.set(mcpKey, {
    type: 'mcp',
    transport: toolDef.transport,
    toolCount: normalizedTools.length,
  });

  if (isNewConfig) {
    logger.info('MCP tools loaded', { 
      agent: agentSlug, 
      tool: toolId, 
      count: normalizedTools.length,
      sampleNames: normalizedTools.slice(0, 3).map(t => t.name)
    });
  }

  return normalizedTools;
}

/**
 * Check if tool name matches any pattern in the list
 */
export function matchesToolPattern(
  toolName: string, 
  patterns: string[], 
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>
): boolean {
  // Get original name if this is a normalized name
  const mapping = toolNameMapping.get(toolName);
  const originalName = mapping?.original || toolName;
  
  for (const pattern of patterns) {
    // Exact match (check both normalized and original)
    if (pattern === toolName || pattern === originalName) return true;
    
    // Wildcard pattern (e.g., "my-server_*" or "myServer_*")
    if (pattern.endsWith('_*')) {
      const prefix = pattern.slice(0, -2);
      if (toolName.startsWith(`${prefix}_`) || originalName.startsWith(`${prefix}_`)) return true;
    }
    
    // Legacy slash pattern support (e.g., "my-server/*")
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (toolName.startsWith(`${prefix}_`) || toolName.startsWith(`${prefix}/`) ||
          originalName.startsWith(`${prefix}_`) || originalName.startsWith(`${prefix}/`)) return true;
    }
  }
  
  return false;
}

/**
 * Load tools for an agent (regular tools + MCP tools)
 */
export async function loadAgentTools(
  agentSlug: string,
  spec: AgentSpec,
  configLoader: ConfigLoader,
  mcpConfigs: Map<string, MCPConfiguration>,
  mcpConnectionStatus: Map<string, { connected: boolean; error?: string }>,
  integrationMetadata: Map<string, { type: string; transport?: string; toolCount?: number }>,
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>,
  toolNameReverseMapping: Map<string, string>,
  logger: any
): Promise<Tool<any>[]> {
  const tools: Tool<any>[] = [];

  if (!spec.tools || !spec.tools.mcpServers || spec.tools.mcpServers.length === 0) {
    return tools;
  }

  // Load each MCP server from catalog
  for (const toolId of spec.tools.mcpServers) {
    try {
      const toolDef = await configLoader.loadTool(toolId);

      if (toolDef.kind === 'mcp') {
        const mcpTools = await createMCPTools(
          agentSlug, 
          toolId, 
          toolDef,
          mcpConfigs,
          mcpConnectionStatus,
          integrationMetadata,
          toolNameMapping,
          toolNameReverseMapping,
          logger
        );
        tools.push(...mcpTools);
      } else if (toolDef.kind === 'builtin') {
        const builtinTool = createBuiltinTool(toolDef, logger);
        if (builtinTool) {
          tools.push(builtinTool);
        }
      }
    } catch (error) {
      logger.error('Failed to load tool', { agent: agentSlug, toolId, error });
    }
  }

  // Apply available filter (defaults to all tools)
  const available = spec.tools.available || ['*'];
  
  logger.debug('Tool filtering', {
    agent: agentSlug,
    totalTools: tools.length,
    availablePatterns: available,
    toolNames: tools.slice(0, 5).map(t => t.name)
  });
  
  if (!available.includes('*')) {
    const filtered = tools.filter(tool => matchesToolPattern(tool.name, available, toolNameMapping));
    logger.info('Tools filtered', {
      agent: agentSlug,
      before: tools.length,
      after: filtered.length,
      removed: tools.length - filtered.length
    });
    return filtered;
  }

  return tools;
}

/**
 * Create a built-in tool from definition
 */
export function createBuiltinTool(toolDef: ToolDef, logger: any): Tool<any> | null {
  // Built-in tools would be implemented here
  // For now, returning null as they need specific implementations
  logger.warn('Built-in tools not yet implemented', { tool: toolDef.id });
  return null;
}

/**
 * Get original tool name from normalized name
 */
export function getOriginalToolName(
  normalizedName: string,
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>
): string {
  const mapping = toolNameMapping.get(normalizedName);
  return mapping?.original || normalizedName;
}

/**
 * Get normalized tool name from original name
 */
export function getNormalizedToolName(
  originalName: string,
  toolNameReverseMapping: Map<string, string>
): string {
  return toolNameReverseMapping.get(originalName) || originalName;
}