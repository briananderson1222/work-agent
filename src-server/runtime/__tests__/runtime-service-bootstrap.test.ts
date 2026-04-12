import { describe, expect, test, vi } from 'vitest';
import { createRuntimeServiceBundle } from '../runtime-service-bootstrap.js';

describe('createRuntimeServiceBundle', () => {
  test('creates storage-backed services in the correct order and starts terminal WS', () => {
    const storageAdapter = { kind: 'storage' };
    const terminalWsServer = { start: vi.fn() };
    const usageAggregatorRef = { get: vi.fn(() => ({ id: 'usage' })) };
    const createAgentService = vi.fn(() => ({ kind: 'agent-service' }));
    const createProviderService = vi.fn(() => ({ kind: 'provider-service' }));
    const createConnectionService = vi.fn(() => ({
      kind: 'connection-service',
    }));
    const createACPManager = vi.fn(() => ({
      kind: 'acp-bridge',
      getStatus: () => ({}),
    }));

    const bundle = createRuntimeServiceBundle(
      {
        projectHomeDir: '/tmp/project',
        port: 4123,
        logger: { info: vi.fn() },
        configLoader: {
          getProjectHomeDir: () => '/tmp/project',
          loadACPConfig: vi.fn(async () => ({ connections: [] })),
          loadAppConfig: vi.fn(async () => ({})),
          updateAppConfig: vi.fn(async () => ({})),
        } as any,
        approvalRegistry: {} as any,
        eventBus: {} as any,
        monitoringEvents: {} as any,
        memoryAdapters: new Map(),
        activeAgents: new Map(),
        agentMetadataMap: new Map(),
        agentSpecs: new Map(),
        agentTools: new Map(),
        mcpConfigs: new Map(),
        mcpConnectionStatus: new Map(),
        integrationMetadata: new Map(),
        toolNameMapping: new Map(),
        usageAggregatorRef,
        getTerminalShell: () => '/bin/zsh',
        persistEvent: vi.fn(async () => {}),
        bootstrapVoiceAgent: vi.fn(async () => {}),
        resolveVectorDbProvider: vi.fn(),
        resolveEmbeddingProvider: vi.fn(),
      },
      {
        createStorageAdapter: () => storageAdapter,
        createAgentService,
        createSkillService: () => ({ kind: 'skill-service' }),
        createMcpService: () => ({ kind: 'mcp-service' }),
        createLayoutService: () => ({ kind: 'layout-service' }),
        createProjectService: () => ({ kind: 'project-service' }),
        createProviderService,
        createKnowledgeService: () => ({ kind: 'knowledge-service' }),
        createFileTreeService: () => ({ kind: 'file-tree-service' }),
        createPtyAdapter: () => ({ kind: 'pty' }),
        createHistoryStore: () => ({ kind: 'history' }),
        createTerminalService: () => ({ kind: 'terminal-service' }),
        createTerminalWsServer: () => terminalWsServer,
        createVoiceService: () => ({ kind: 'voice-service' }),
        createMonitoringEmitter: () => ({ kind: 'monitoring' }),
        createACPManager,
        createConnectionService,
        createFeedbackService: () => ({ kind: 'feedback-service' }),
      },
    );

    expect(createAgentService).toHaveBeenCalledWith(
      expect.anything(),
      storageAdapter,
      expect.any(Map),
      expect.any(Map),
      expect.any(Map),
      expect.anything(),
    );
    expect(createProviderService).toHaveBeenCalledWith(
      storageAdapter,
      expect.any(Function),
    );
    expect(createConnectionService).toHaveBeenCalled();
    expect(createACPManager).toHaveBeenCalled();
    expect(terminalWsServer.start).toHaveBeenCalledWith(4124);
    expect(bundle.storageAdapter).toBe(storageAdapter);
    expect(bundle.agentService).toEqual({ kind: 'agent-service' });
  });
});
