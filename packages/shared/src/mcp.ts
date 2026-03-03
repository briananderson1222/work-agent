/**
 * MCP Client Factory — creates MCP clients from tool definitions.
 *
 * Supports stdio, SSE, and Streamable HTTP transports.
 * Used by both the core server and CLI dev server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDef } from './index.js';

export interface MCPToolInfo {
  name: string; // prefixed: "{serverId}_{toolName}"
  originalName: string; // raw name from MCP server
  serverId: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPConnection {
  client: Client;
  serverId: string;
  tools: MCPToolInfo[];
  close: () => Promise<void>;
}

export interface MCPManagerOptions {
  /** Called when a server connects or fails */
  onStatus?: (
    serverId: string,
    status: 'connected' | 'failed',
    error?: string,
  ) => void;
}

/**
 * Create an MCP client from a tool definition.
 * Returns the connected client with its tool catalog.
 */
export async function connectMCP(
  def: ToolDef,
  opts?: MCPManagerOptions,
): Promise<MCPConnection> {
  const transport = createTransport(def);
  const client = new Client(
    { name: 'stallion-dev', version: '0.1.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    opts?.onStatus?.(def.id, 'connected');
  } catch (err: any) {
    opts?.onStatus?.(def.id, 'failed', err.message);
    throw err;
  }

  // Discover tools
  const result = await client.listTools();
  const tools: MCPToolInfo[] = (result.tools || []).map((t) => ({
    name: `${def.id}_${t.name}`,
    originalName: t.name,
    serverId: def.id,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  return {
    client,
    serverId: def.id,
    tools,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Call a tool on an MCP connection.
 */
export async function callTool(
  conn: MCPConnection,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  // Accept both prefixed ("server_tool") and raw ("tool") names
  const originalName = toolName.startsWith(`${conn.serverId}_`)
    ? toolName.slice(conn.serverId.length + 1)
    : toolName;

  const result = await conn.client.callTool({
    name: originalName,
    arguments: args,
  });
  return result;
}

/**
 * Manage multiple MCP connections for a set of tool definitions.
 */
export class MCPManager {
  private connections = new Map<string, MCPConnection>();
  private opts: MCPManagerOptions;

  constructor(opts: MCPManagerOptions = {}) {
    this.opts = opts;
  }

  /** Connect to all provided tool definitions. Failures are logged, not thrown. */
  async connectAll(defs: ToolDef[]): Promise<void> {
    const results = await Promise.allSettled(
      defs
        .filter((d) => d.kind === 'mcp')
        .map(async (def) => {
          const conn = await connectMCP(def, this.opts);
          this.connections.set(def.id, conn);
        }),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        // Already reported via onStatus callback
      }
    }
  }

  /** Get all discovered tools across all connections. */
  listTools(): MCPToolInfo[] {
    return Array.from(this.connections.values()).flatMap((c) => c.tools);
  }

  /** Call a tool by its prefixed name (e.g., "my-server_list_items"). */
  async callTool(
    prefixedName: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    // Find which connection owns this tool
    for (const conn of this.connections.values()) {
      const tool = conn.tools.find((t) => t.name === prefixedName);
      if (tool) return callTool(conn, prefixedName, args);
    }
    throw new Error(`Tool not found: ${prefixedName}`);
  }

  /** Get connection for a specific server. */
  getConnection(serverId: string): MCPConnection | undefined {
    return this.connections.get(serverId);
  }

  /** Shut down all connections. */
  async closeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.connections.values()).map((c) => c.close()),
    );
    this.connections.clear();
  }
}

// ── Transport factory ──────────────────────────────────────────────

function createTransport(def: ToolDef) {
  const transport = def.transport || (def.command ? 'stdio' : undefined);

  switch (transport) {
    case 'stdio':
      if (!def.command)
        throw new Error(`Tool '${def.id}': stdio transport requires 'command'`);
      return new StdioClientTransport({
        command: def.command,
        args: def.args,
        env: { ...process.env, ...(def.env || {}) } as Record<string, string>,
      });

    case 'sse':
      if (!def.endpoint)
        throw new Error(`Tool '${def.id}': sse transport requires 'endpoint'`);
      return new SSEClientTransport(new URL(def.endpoint));

    case 'streamable-http':
      if (!def.endpoint)
        throw new Error(
          `Tool '${def.id}': streamable-http transport requires 'endpoint'`,
        );
      return new StreamableHTTPClientTransport(new URL(def.endpoint));

    default:
      // Legacy: treat 'process' same as stdio, ignore ws/tcp (deprecated)
      if (def.command) {
        return new StdioClientTransport({
          command: def.command,
          args: def.args,
          env: { ...process.env, ...(def.env || {}) } as Record<string, string>,
        });
      }
      throw new Error(
        `Tool '${def.id}': cannot determine transport (set 'transport' or 'command')`,
      );
  }
}
