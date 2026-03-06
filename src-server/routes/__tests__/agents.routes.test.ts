/**
 * Agent Routes — contract tests.
 *
 * Uses real AgentService + ConfigLoader (temp dir) so every test hits the
 * actual persistence layer. getVoltAgent is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAgentRoutes } from '../agents.js';
import { AgentService } from '../../services/agent-service.js';
import { makeTempDir, makeConfigLoader, mockLogger, req } from './helpers.js';

function makeService(dir: string) {
  const configLoader = makeConfigLoader(dir);
  const activeAgents = new Map<string, any>();
  const agentMetadataMap = new Map<string, any>();
  const agentSpecs = new Map<string, any>();
  const logger = mockLogger();
  return new AgentService(
    configLoader,
    activeAgents,
    agentMetadataMap,
    agentSpecs,
    logger,
  );
}

describe('agents routes', () => {
  let dir: string;
  let cleanup: () => void;
  let service: AgentService;
  let reinitialize: ReturnType<typeof vi.fn>;
  let getVoltAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const tmp = makeTempDir();
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    service = makeService(dir);
    reinitialize = vi.fn().mockResolvedValue(undefined);
    getVoltAgent = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function makeApp() {
    return createAgentRoutes(service, reinitialize, getVoltAgent);
  }

  // ── GET / ──────────────────────────────────────────────────────────────────

  it('GET / — VoltAgent not initialized → 500', async () => {
    getVoltAgent.mockReturnValue(null);
    const { status, body } = await req(makeApp(), 'GET', '/');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('GET / — empty agent list → 200 with empty array', async () => {
    getVoltAgent.mockReturnValue({ getAgents: vi.fn().mockResolvedValue([]) });
    const { status, body } = await req(makeApp(), 'GET', '/');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  // ── POST / ────────────────────────────────────────────────────────────────

  it('POST / — valid body → 201, slug derived, reinitialize called', async () => {
    const { status, body } = await req(makeApp(), 'POST', '/', {
      name: 'Test Agent',
      prompt: 'You are a helpful assistant.',
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.slug).toBe('test-agent');
    expect(reinitialize).toHaveBeenCalledOnce();
  });

  it('POST / — slug format: Hello World! → hello-world', async () => {
    const { body } = await req(makeApp(), 'POST', '/', {
      name: 'Hello World!',
      prompt: 'A test agent.',
    });
    expect(body.data.slug).toBe('hello-world');
  });

  it('POST / — missing name → 400', async () => {
    const { status, body } = await req(makeApp(), 'POST', '/', {
      prompt: 'No name provided.',
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST / — missing prompt → 400', async () => {
    const { status, body } = await req(makeApp(), 'POST', '/', {
      name: 'No Prompt Agent',
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('POST / — duplicate slug → 400 with "already exists"', async () => {
    // Create first
    await req(makeApp(), 'POST', '/', {
      name: 'Duplicate',
      prompt: 'First.',
    });
    reinitialize.mockClear();
    // Create duplicate
    const { status, body } = await req(makeApp(), 'POST', '/', {
      name: 'Duplicate',
      prompt: 'Second.',
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });

  it('POST / failure → reinitialize not called', async () => {
    // Missing required fields causes failure
    await req(makeApp(), 'POST', '/', { name: 'Bad' });
    expect(reinitialize).not.toHaveBeenCalled();
  });

  // ── PUT /:slug ─────────────────────────────────────────────────────────────

  it('PUT /:slug — existing agent → 200, updated, reinitialize called', async () => {
    // First create the agent
    await req(makeApp(), 'POST', '/', {
      name: 'Updatable',
      prompt: 'Original prompt.',
    });
    reinitialize.mockClear();

    const { status, body } = await req(makeApp(), 'PUT', '/updatable', {
      prompt: 'Updated prompt.',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.prompt).toBe('Updated prompt.');
    expect(reinitialize).toHaveBeenCalledOnce();
  });

  it('PUT /:slug — unknown slug → 404', async () => {
    const { status } = await req(makeApp(), 'PUT', '/nonexistent', {
      prompt: 'Update.',
    });
    expect(status).toBe(404);
  });

  it('PUT /:slug — reinitialize NOT called on error', async () => {
    await req(makeApp(), 'PUT', '/nonexistent', { prompt: 'Nope.' });
    expect(reinitialize).not.toHaveBeenCalled();
  });

  // ── DELETE /:slug ──────────────────────────────────────────────────────────

  it('DELETE /:slug — existing → 200, reinitialize called', async () => {
    await req(makeApp(), 'POST', '/', {
      name: 'Deletable',
      prompt: 'To be deleted.',
    });
    reinitialize.mockClear();

    const { status, body } = await req(makeApp(), 'DELETE', '/deletable');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(reinitialize).toHaveBeenCalledOnce();
  });

  it('DELETE /:slug — unknown → 404 with success:false', async () => {
    const { status, body } = await req(makeApp(), 'DELETE', '/ghost');
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});
