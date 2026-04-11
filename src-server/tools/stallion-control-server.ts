#!/usr/bin/env node
/**
 * stallion-control — Built-in MCP server exposing Stallion's API as tools.
 * Runs as a stdio MCP server. Any agent can use it by adding "stallion-control"
 * to their mcpServers list.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAgentTools } from './stallion-control-agent-tools.js';
import { registerCatalogTools } from './stallion-control-catalog-tools.js';
import { registerOperationsTools } from './stallion-control-operations-tools.js';
import { registerPlatformTools } from './stallion-control-platform-tools.js';

const server = new McpServer({
  name: 'stallion-control',
  version: '1.0.0',
});

registerAgentTools(server);
registerCatalogTools(server);
registerOperationsTools(server);
registerPlatformTools(server);

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
