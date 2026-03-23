import { describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  projectOps: { add: vi.fn() },
}));
vi.mock('@stallion-ai/shared', () => ({
  BUILTIN_KNOWLEDGE_NAMESPACES: [{ id: 'default', label: 'Default' }],
}));

const { ProjectService } = await import('../project-service.js');

function createMockStorageAdapter() {
  const projects = new Map<string, any>();
  return {
    listProjects: vi.fn(() => [...projects.values()].map((p) => ({ slug: p.slug, name: p.name }))),
    getProject: vi.fn((slug: string) => {
      const p = projects.get(slug);
      if (!p) throw new Error(`Project '${slug}' not found`);
      return p;
    }),
    saveProject: vi.fn(async (p: any) => { projects.set(p.slug || p.id, p); }),
    deleteProject: vi.fn((slug: string) => { projects.delete(slug); }),
  };
}

describe('ProjectService', () => {
  test('createProject generates id and timestamps', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProjectService(adapter as any);
    const result = await svc.createProject({ name: 'Test', slug: 'test' } as any);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(result.name).toBe('Test');
  });

  test('createProject derives name from workingDirectory', async () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProjectService(adapter as any);
    const result = await svc.createProject({ name: 'Untitled', slug: 'my-app', workingDirectory: '/home/user/my-app' } as any);
    expect(result.name).toBe('My-app');
  });

  test('listProjects delegates', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProjectService(adapter as any);
    svc.listProjects();
    expect(adapter.listProjects).toHaveBeenCalled();
  });

  test('deleteProject delegates', () => {
    const adapter = createMockStorageAdapter();
    const svc = new ProjectService(adapter as any);
    svc.deleteProject('test');
    expect(adapter.deleteProject).toHaveBeenCalledWith('test');
  });

  test('updateProject merges and updates timestamp', async () => {
    const adapter = createMockStorageAdapter();
    adapter.getProject.mockResolvedValue({ slug: 'test', name: 'Old', createdAt: '2026-01-01' });
    const svc = new ProjectService(adapter as any);
    const result = await svc.updateProject('test', { name: 'New' });
    expect(result.name).toBe('New');
    expect(result.updatedAt).toBeDefined();
    expect(adapter.saveProject).toHaveBeenCalled();
  });
});
