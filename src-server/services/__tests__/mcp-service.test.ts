import { describe, expect, test, vi } from 'vitest';

vi.mock('../../telemetry/metrics.js', () => ({
  mcpLifecycle: { add: vi.fn() },
}));

const { MCPService } = await import('../mcp-service.js');

function createMockConfigLoader() {
  return {
    listIntegrations: vi
      .fn()
      .mockResolvedValue([{ id: 'mcp-1', name: 'Test' }]),
    getToolAgentMap: vi.fn().mockResolvedValue({ 'mcp-1': ['default'] }),
    saveIntegration: vi.fn().mockResolvedValue(undefined),
    loadIntegration: vi
      .fn()
      .mockResolvedValue({ id: 'mcp-1', name: 'Test', type: 'stdio' }),
    deleteIntegration: vi.fn().mockResolvedValue(undefined),
    loadAgent: vi.fn().mockResolvedValue({
      tools: { mcpServers: ['mcp-1'], available: ['*'] },
    }),
    updateAgent: vi.fn().mockResolvedValue(undefined),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('MCPService', () => {
  test('listIntegrations delegates to configLoader', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    const result = await svc.listIntegrations();
    expect(result).toEqual([{ id: 'mcp-1', name: 'Test' }]);
  });

  test('getToolAgentMap delegates', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    const result = await svc.getToolAgentMap();
    expect(result).toEqual({ 'mcp-1': ['default'] });
  });

  test('saveIntegration delegates', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    await svc.saveIntegration({ id: 'new', name: 'New' } as any);
    expect(loader.saveIntegration).toHaveBeenCalled();
  });

  test('deleteIntegration delegates', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    await svc.deleteIntegration('mcp-1');
    expect(loader.deleteIntegration).toHaveBeenCalledWith('mcp-1');
  });

  test('getAgentTools returns empty for unknown agent', () => {
    const svc = new MCPService(
      {} as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    expect(svc.getAgentTools('unknown')).toEqual([]);
  });

  test('getAgentTools maps tool metadata', () => {
    const tools = new Map([
      [
        'default',
        [{ name: 'myServer_doThing', id: 't1', description: 'Does thing' }],
      ],
    ]);
    const mapping = new Map([
      [
        'myServer_doThing',
        {
          original: 'doThing',
          normalized: 'myServer_doThing',
          server: 'myServer',
          tool: 'doThing',
        },
      ],
    ]);
    const svc = new MCPService(
      {} as any,
      new Map(),
      new Map(),
      new Map(),
      tools,
      mapping,
      mockLogger,
    );
    const result = svc.getAgentTools('default');
    expect(result).toHaveLength(1);
    expect(result[0].server).toBe('myServer');
    expect(result[0].toolName).toBe('doThing');
  });

  test('addToolToAgent adds to mcpServers list', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    const result = await svc.addToolToAgent('default', 'mcp-2');
    expect(result).toContain('mcp-2');
    expect(loader.updateAgent).toHaveBeenCalled();
  });

  test('addToolToAgent deduplicates', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    const result = await svc.addToolToAgent('default', 'mcp-1');
    expect(result.filter((id: string) => id === 'mcp-1')).toHaveLength(1);
  });

  test('removeToolFromAgent removes from list', async () => {
    const loader = createMockConfigLoader();
    const svc = new MCPService(
      loader as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    await svc.removeToolFromAgent('default', 'mcp-1');
    expect(loader.updateAgent).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        tools: expect.objectContaining({ mcpServers: [] }),
      }),
    );
  });

  test('getConnectionStatus returns undefined for unknown', () => {
    const svc = new MCPService(
      {} as any,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    expect(svc.getConnectionStatus('default', 'mcp-1')).toBeUndefined();
  });

  test('getConnectionStatus returns stored status', () => {
    const status = new Map([['default:mcp-1', { connected: true }]]);
    const svc = new MCPService(
      {} as any,
      new Map(),
      status as any,
      new Map(),
      new Map(),
      new Map(),
      mockLogger,
    );
    expect(svc.getConnectionStatus('default', 'mcp-1')).toEqual({
      connected: true,
    });
  });
});
