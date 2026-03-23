import { describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  layoutOps: { add: vi.fn() },
}));

const { LayoutService } = await import('../layout-service.js');

function createMockConfigLoader() {
  return {
    listLayouts: vi.fn().mockResolvedValue([{ slug: 'default', name: 'Default' }]),
    loadLayout: vi.fn().mockResolvedValue({ slug: 'default', name: 'Default', tabs: [] }),
    createLayout: vi.fn().mockResolvedValue(undefined),
    updateLayout: vi.fn().mockImplementation((_slug: string, updates: any) => Promise.resolve({ slug: 'default', ...updates })),
    deleteLayout: vi.fn().mockResolvedValue(undefined),
    listAgentWorkflows: vi.fn().mockResolvedValue([]),
    readWorkflow: vi.fn().mockResolvedValue('// code'),
    createWorkflow: vi.fn().mockResolvedValue(undefined),
    updateWorkflow: vi.fn().mockResolvedValue(undefined),
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LayoutService', () => {
  test('listLayouts delegates to configLoader', async () => {
    const loader = createMockConfigLoader();
    const svc = new LayoutService(loader as any, {});
    const result = await svc.listLayouts();
    expect(result).toEqual([{ slug: 'default', name: 'Default' }]);
    expect(loader.listLayouts).toHaveBeenCalled();
  });

  test('getLayout delegates to configLoader', async () => {
    const loader = createMockConfigLoader();
    const svc = new LayoutService(loader as any, {});
    const result = await svc.getLayout('default');
    expect(loader.loadLayout).toHaveBeenCalledWith('default');
    expect(result.slug).toBe('default');
  });

  test('createLayout delegates and returns config', async () => {
    const loader = createMockConfigLoader();
    const svc = new LayoutService(loader as any, {});
    const config = { slug: 'new', name: 'New', tabs: [] } as any;
    const result = await svc.createLayout(config);
    expect(loader.createLayout).toHaveBeenCalledWith(config);
    expect(result).toBe(config);
  });

  test('deleteLayout delegates', async () => {
    const loader = createMockConfigLoader();
    const svc = new LayoutService(loader as any, {});
    await svc.deleteLayout('old');
    expect(loader.deleteLayout).toHaveBeenCalledWith('old');
  });

  test('workflow CRUD delegates', async () => {
    const loader = createMockConfigLoader();
    const svc = new LayoutService(loader as any, {});
    await svc.listAgentWorkflows('agent1');
    expect(loader.listAgentWorkflows).toHaveBeenCalledWith('agent1');
    await svc.getWorkflow('agent1', 'wf1');
    expect(loader.readWorkflow).toHaveBeenCalledWith('agent1', 'wf1');
    await svc.createWorkflow('agent1', 'wf.ts', '// code');
    expect(loader.createWorkflow).toHaveBeenCalledWith('agent1', 'wf.ts', '// code');
    await svc.deleteWorkflow('agent1', 'wf1');
    expect(loader.deleteWorkflow).toHaveBeenCalledWith('agent1', 'wf1');
  });
});
