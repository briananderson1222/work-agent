/**
 * Workspace Routes — contract tests.
 *
 * Uses real WorkspaceService + ConfigLoader (temp dir).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createWorkspaceRoutes, createWorkflowRoutes } from '../workspaces.js';
import { WorkspaceService } from '../../services/workspace-service.js';
import { makeTempDir, makeConfigLoader, mockLogger, req } from './helpers.js';

function makeService(dir: string) {
  const configLoader = makeConfigLoader(dir);
  const logger = mockLogger();
  return new WorkspaceService(configLoader, logger);
}

const validWorkspace = {
  slug: 'my-workspace',
  name: 'My Workspace',
  tabs: [{ id: 'tab1', label: 'Tab 1', component: 'chat', prompts: [] }],
};

describe('workspace routes', () => {
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

  function makeApp() {
    return createWorkspaceRoutes(service);
  }

  // ── GET / ─────────────────────────────────────────────────────────────────

  it('GET / — empty → 200 with []', async () => {
    const { status, body } = await req(makeApp(), 'GET', '/');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  // ── POST / ────────────────────────────────────────────────────────────────

  it('POST / — valid → 201 with workspace data', async () => {
    const { status, body } = await req(makeApp(), 'POST', '/', validWorkspace);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('my-workspace');
  });

  it('POST / — missing required field → 400', async () => {
    const { status, body } = await req(makeApp(), 'POST', '/', {
      name: 'Missing Slug',
      // missing slug and tabs
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  // ── GET /:slug ─────────────────────────────────────────────────────────────

  it('GET /:slug — existing → 200 with workspace config', async () => {
    await req(makeApp(), 'POST', '/', validWorkspace);
    const { status, body } = await req(makeApp(), 'GET', '/my-workspace');
    expect(status).toBe(200);
    expect(body.data.name).toBe('My Workspace');
  });

  it('GET /:slug — unknown → 404', async () => {
    const { status, body } = await req(makeApp(), 'GET', '/ghost');
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });

  // ── PUT /:slug ─────────────────────────────────────────────────────────────

  it('PUT /:slug — partial update → 200 with merged config', async () => {
    await req(makeApp(), 'POST', '/', validWorkspace);
    const { status, body } = await req(makeApp(), 'PUT', '/my-workspace', {
      name: 'Updated Name',
    });
    expect(status).toBe(200);
    expect(body.data.name).toBe('Updated Name');
    expect(body.data.slug).toBe('my-workspace');
  });

  it('PUT /:slug — unknown → 404', async () => {
    const { status } = await req(makeApp(), 'PUT', '/ghost', {
      name: 'Nope',
    });
    expect(status).toBe(404);
  });

  // ── DELETE /:slug ──────────────────────────────────────────────────────────

  it('DELETE /:slug — existing → 200 success:true', async () => {
    await req(makeApp(), 'POST', '/', validWorkspace);
    const { status, body } = await req(makeApp(), 'DELETE', '/my-workspace');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /:slug — unknown → 404', async () => {
    const { status, body } = await req(makeApp(), 'DELETE', '/ghost');
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe('workflow routes', () => {
  let dir: string;
  let cleanup: () => void;
  let service: WorkspaceService;

  beforeEach(async () => {
    const tmp = makeTempDir();
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    service = makeService(dir);
    // Also create an agent directory so workflow operations have a valid slug
    const configLoader = makeConfigLoader(dir);
    await configLoader.createAgent({
      name: 'Agent One',
      prompt: 'A test agent.',
    });
  });

  afterEach(() => {
    cleanup();
  });

  function makeApp() {
    // Workflow routes live at /:slug/workflows/*
    // We mount them at / so the test paths include the slug
    const wfApp = createWorkflowRoutes(service);
    return wfApp;
  }

  it('GET /:slug/workflows/files — existing agent → 200 with empty list initially', async () => {
    const { status, body } = await req(
      makeApp(),
      'GET',
      '/agent-one/workflows/files',
    );
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('POST /:slug/workflows — creates workflow → 201 with filename', async () => {
    const { status, body } = await req(
      makeApp(),
      'POST',
      '/agent-one/workflows',
      {
        filename: 'my-workflow.ts',
        content: 'export default {}',
      },
    );
    expect(status).toBe(201);
    expect(body.data.filename).toBe('my-workflow.ts');
  });

  it('DELETE /:slug/workflows/:id — existing → 200 success:true', async () => {
    // Create first
    await req(makeApp(), 'POST', '/agent-one/workflows', {
      filename: 'to-delete.ts',
      content: 'export default {}',
    });
    const { status, body } = await req(
      makeApp(),
      'DELETE',
      '/agent-one/workflows/to-delete.ts',
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
