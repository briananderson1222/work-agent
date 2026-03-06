/**
 * WorkspaceService — unit tests.
 *
 * Uses real ConfigLoader (temp dir). Direct class instantiation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceService } from '../workspace-service.js';
import { ConfigLoader } from '../../domain/config-loader.js';

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ws-svc-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeService(dir: string) {
  const configLoader = new ConfigLoader({ projectHomeDir: dir });
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return new WorkspaceService(configLoader, logger);
}

const validConfig = {
  slug: 'test-ws',
  name: 'Test Workspace',
  tabs: [{ id: 'tab1', label: 'Tab 1', component: 'chat', prompts: [] }],
};

describe('WorkspaceService', () => {
  let dir: string;
  let cleanup: () => void;
  let service: WorkspaceService;

  beforeEach(() => {
    const tmp = makeTempDir();
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    service = makeService(dir);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── listWorkspaces ─────────────────────────────────────────────────────────

  it('listWorkspaces — empty → []', async () => {
    const result = await service.listWorkspaces();
    expect(result).toEqual([]);
  });

  it('listWorkspaces — multiple → returns all', async () => {
    await service.createWorkspace(validConfig);
    await service.createWorkspace({
      slug: 'another-ws',
      name: 'Another Workspace',
      tabs: [{ id: 't1', label: 'T1', component: 'chat' }],
    });

    const result = await service.listWorkspaces();
    expect(result.length).toBe(2);
    const slugs = result.map((w) => w.slug);
    expect(slugs).toContain('test-ws');
    expect(slugs).toContain('another-ws');
  });

  it('listWorkspaces — after delete → deleted workspace not in list', async () => {
    await service.createWorkspace(validConfig);
    await service.createWorkspace({
      slug: 'to-delete',
      name: 'To Delete',
      tabs: [{ id: 't1', label: 'T1', component: 'chat' }],
    });

    await service.deleteWorkspace('to-delete');
    const result = await service.listWorkspaces();
    const slugs = result.map((w) => w.slug);
    expect(slugs).not.toContain('to-delete');
    expect(slugs).toContain('test-ws');
  });

  // ── createWorkspace ────────────────────────────────────────────────────────

  it('createWorkspace — valid → returns config, persisted', async () => {
    const result = await service.createWorkspace(validConfig);
    expect(result.slug).toBe('test-ws');
    expect(result.name).toBe('Test Workspace');

    // Verify it's persisted
    const loaded = await service.getWorkspace('test-ws');
    expect(loaded.name).toBe('Test Workspace');
  });

  it('createWorkspace — missing required field → throws', async () => {
    await expect(
      service.createWorkspace({ name: 'No Slug' } as any),
    ).rejects.toThrow();
  });

  // ── getWorkspace ───────────────────────────────────────────────────────────

  it('getWorkspace — existing → returns config', async () => {
    await service.createWorkspace(validConfig);
    const result = await service.getWorkspace('test-ws');
    expect(result.name).toBe('Test Workspace');
    expect(result.tabs.length).toBe(1);
  });

  it('getWorkspace — unknown → throws', async () => {
    await expect(service.getWorkspace('nonexistent')).rejects.toThrow();
  });

  // ── updateWorkspace ────────────────────────────────────────────────────────

  it('updateWorkspace — partial → merged result returned', async () => {
    await service.createWorkspace(validConfig);
    const updated = await service.updateWorkspace('test-ws', {
      name: 'Renamed WS',
    });
    expect(updated.name).toBe('Renamed WS');
    expect(updated.slug).toBe('test-ws');
    expect(updated.tabs.length).toBe(1);
  });

  it('updateWorkspace — unknown → throws', async () => {
    await expect(
      service.updateWorkspace('ghost', { name: 'Nope' }),
    ).rejects.toThrow();
  });

  // ── deleteWorkspace ────────────────────────────────────────────────────────

  it('deleteWorkspace — existing → resolves', async () => {
    await service.createWorkspace(validConfig);
    await expect(service.deleteWorkspace('test-ws')).resolves.not.toThrow();
  });

  it('deleteWorkspace — unknown → throws', async () => {
    await expect(service.deleteWorkspace('ghost')).rejects.toThrow();
  });

  // ── workflow CRUD ──────────────────────────────────────────────────────────

  it('workflow CRUD — full roundtrip: create → list → read → update → delete', async () => {
    // Need an agent directory for workflows
    const configLoader = new ConfigLoader({ projectHomeDir: dir });
    await configLoader.createAgent({ name: 'Wf Agent', prompt: 'p' });
    const agentSlug = 'wf-agent';

    // Create
    await service.createWorkflow(agentSlug, 'flow.ts', 'export default {}');

    // List
    const list = await service.listAgentWorkflows(agentSlug);
    expect(list.length).toBe(1);
    expect(list[0].filename).toBe('flow.ts');

    // Read
    const content = await service.getWorkflow(agentSlug, 'flow.ts');
    expect(content).toBe('export default {}');

    // Update
    await service.updateWorkflow(
      agentSlug,
      'flow.ts',
      'export default { v: 2 }',
    );
    const updated = await service.getWorkflow(agentSlug, 'flow.ts');
    expect(updated).toBe('export default { v: 2 }');

    // Delete
    await service.deleteWorkflow(agentSlug, 'flow.ts');
    const after = await service.listAgentWorkflows(agentSlug);
    expect(after.length).toBe(0);
  });
});
