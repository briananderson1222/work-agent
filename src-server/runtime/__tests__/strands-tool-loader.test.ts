import { describe, expect, test, vi } from 'vitest';
import {
  applyStrandsAvailableToolFilter,
  createStrandsFunctionTools,
  destroyStrandsAgentTools,
} from '../strands-tool-loader.js';

vi.mock('@strands-agents/sdk', () => ({
  FunctionTool: class {
    config: any;

    constructor(config: any) {
      this.config = config;
    }

    callback(input: unknown, toolContext: any) {
      return this.config.callback(input, toolContext);
    }
  },
}));

describe('applyStrandsAvailableToolFilter', () => {
  test('keeps exact and wildcard tool matches', () => {
    const tools = [
      { name: 'read_file', execute: vi.fn() },
      { name: 'edit_file', execute: vi.fn() },
      { name: 'mcp__github__search', execute: vi.fn() },
    ] as any;

    expect(
      applyStrandsAvailableToolFilter(tools, ['read_file', 'mcp__github__*']),
    ).toEqual([tools[0], tools[2]]);
  });

  test('returns all tools for wildcard availability', () => {
    const tools = [{ name: 'read_file', execute: vi.fn() }] as any;

    expect(applyStrandsAvailableToolFilter(tools, ['*'])).toEqual(tools);
  });
});

describe('createStrandsFunctionTools', () => {
  test('short-circuits denied tool calls and clears the denied set', async () => {
    const execute = vi.fn();
    const deniedToolUseIds = new Set(['tool-1']);
    const [tool] = createStrandsFunctionTools(
      [
        { name: 'read_file', description: 'Read', parameters: {}, execute },
      ] as any,
      deniedToolUseIds,
    ) as any[];

    await expect(
      tool.callback({}, { toolUse: { toolUseId: 'tool-1' } }),
    ).resolves.toBe("Tool 'read_file' was denied by the user.");
    expect(execute).not.toHaveBeenCalled();
    expect(deniedToolUseIds.has('tool-1')).toBe(false);
  });

  test('passes tool context through to the underlying tool implementation', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const [tool] = createStrandsFunctionTools(
      [
        { name: 'read_file', description: 'Read', parameters: {}, execute },
      ] as any,
      new Set(),
    ) as any[];
    const toolContext = { toolUse: { toolUseId: 'tool-2' }, extra: true };

    await tool.callback({}, toolContext);

    expect(execute).toHaveBeenCalledWith({}, toolContext);
  });
});

describe('destroyStrandsAgentTools', () => {
  test('disconnects tracked MCP clients and clears agent ownership', async () => {
    const client = { disconnect: vi.fn().mockResolvedValue(undefined) };
    const state = {
      mcpClients: new Map([['tool-1', client as any]]),
      agentMcpClients: new Map([['agent-a', ['tool-1']]]),
    };

    await destroyStrandsAgentTools('agent-a', state);

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(state.mcpClients.has('tool-1')).toBe(false);
    expect(state.agentMcpClients.has('agent-a')).toBe(false);
  });
});
