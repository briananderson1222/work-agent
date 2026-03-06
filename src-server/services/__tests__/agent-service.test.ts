/**
 * AgentService — unit tests.
 *
 * Uses real ConfigLoader (temp dir). Direct class instantiation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentService } from '../agent-service.js';
import { ConfigLoader } from '../../domain/config-loader.js';

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-svc-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeService(dir: string) {
  const configLoader = new ConfigLoader({ workAgentDir: dir });
  const activeAgents = new Map<string, any>();
  const agentMetadataMap = new Map<string, any>();
  const agentSpecs = new Map<string, any>();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    service: new AgentService(
      configLoader,
      activeAgents,
      agentMetadataMap,
      agentSpecs,
      logger,
    ),
    logger,
  };
}

const validSpec = { name: 'My Agent', prompt: 'You are helpful.' };

describe('AgentService', () => {
  let dir: string;
  let cleanup: () => void;
  let service: AgentService;
  let logger: any;

  beforeEach(() => {
    const tmp = makeTempDir();
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    ({ service, logger } = makeService(dir));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── createAgent ────────────────────────────────────────────────────────────

  it('createAgent — valid → returns {slug, spec}', async () => {
    const { slug, spec } = await service.createAgent(validSpec);
    expect(slug).toBe('my-agent');
    expect(spec.name).toBe('My Agent');
    expect(spec.prompt).toBe('You are helpful.');
  });

  it('createAgent — slug format: "My Agent" → "my-agent"', async () => {
    const { slug } = await service.createAgent({
      name: 'My Agent',
      prompt: 'p',
    });
    expect(slug).toBe('my-agent');
  });

  it('createAgent — duplicate → throws with "already exists"', async () => {
    await service.createAgent(validSpec);
    await expect(service.createAgent(validSpec)).rejects.toThrow(
      /already exists/i,
    );
  });

  it('createAgent — missing name → throws validation error', async () => {
    await expect(
      service.createAgent({ prompt: 'No name.' } as any),
    ).rejects.toThrow();
  });

  // ── updateAgent ────────────────────────────────────────────────────────────

  it('updateAgent — existing → returns updated spec', async () => {
    await service.createAgent(validSpec);
    const updated = await service.updateAgent('my-agent', {
      prompt: 'New prompt.',
    });
    expect(updated.prompt).toBe('New prompt.');
  });

  it('updateAgent — unknown slug → throws with slug in error', async () => {
    await expect(
      service.updateAgent('nonexistent', { prompt: 'x' }),
    ).rejects.toThrow(/nonexistent/i);
  });

  it('updateAgent — null fields → field cleared (null passes through)', async () => {
    // model is a nullable field in AgentSpec (type: ["string", "null"])
    await service.createAgent({
      name: 'Nullish',
      prompt: 'p',
      model: 'some-model',
    });

    // null passes through to configLoader which merges it in, clearing the field
    const updated = await service.updateAgent('nullish', {
      model: null as any,
    });
    expect(updated.model).toBeNull();
  });

  // ── deleteAgent ────────────────────────────────────────────────────────────

  it('deleteAgent — existing → resolves, agent no longer in listAgents', async () => {
    await service.createAgent(validSpec);
    const result = await service.deleteAgent('my-agent');
    expect(result.success).toBe(true);

    const agents = await service.listAgents();
    expect(agents.find((a) => a.slug === 'my-agent')).toBeUndefined();
  });

  it('deleteAgent — unknown → throws (agent not found)', async () => {
    // SPEC: service.deleteAgent throws when slug doesn't exist (only returns
    // {success:false} for workspace dependency case). Route layer catches the throw.
    await expect(service.deleteAgent('ghost')).rejects.toThrow(/not found/i);
  });

  // ── getEnrichedAgents ──────────────────────────────────────────────────────

  it('getEnrichedAgents — agent in metadata map → returns enriched with spec fields', async () => {
    const { slug } = await service.createAgent(validSpec);

    // Simulate what VoltAgent would provide
    const coreAgents = [{ id: 'agent:my-agent' }];

    // Inject into metadata map
    const configLoader = new ConfigLoader({ workAgentDir: dir });
    const activeAgents = new Map<string, any>();
    const agentMetadataMap = new Map<string, any>();
    agentMetadataMap.set('agent:my-agent', { slug, name: 'My Agent' });
    const agentSpecs = new Map<string, any>();
    const enrichService = new AgentService(
      configLoader,
      activeAgents,
      agentMetadataMap,
      agentSpecs,
      logger,
    );

    const enriched = await enrichService.getEnrichedAgents(coreAgents);
    expect(enriched.length).toBe(1);
    expect(enriched[0].slug).toBe('my-agent');
    expect(enriched[0].prompt).toBe('You are helpful.');
  });

  it('getEnrichedAgents — agent not in metadata map → filtered out (returns [])', async () => {
    const coreAgents = [{ id: 'agent:some-other-agent' }];
    // No metadata in map
    const result = await service.getEnrichedAgents(coreAgents);
    expect(result).toEqual([]);
  });

  it('getEnrichedAgents — spec file missing → silently filtered, warn logged', async () => {
    const coreAgents = [{ id: 'agent:ghost' }];

    // Inject into metadata map so it gets past the first check
    const configLoader = new ConfigLoader({ workAgentDir: dir });
    const activeAgents = new Map<string, any>();
    const agentMetadataMap = new Map<string, any>();
    agentMetadataMap.set('agent:ghost', { slug: 'ghost', name: 'Ghost' });
    const agentSpecs = new Map<string, any>();
    const warnLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const enrichService = new AgentService(
      configLoader,
      activeAgents,
      agentMetadataMap,
      agentSpecs,
      warnLogger,
    );

    const result = await enrichService.getEnrichedAgents(coreAgents);
    expect(result).toEqual([]);
    expect(warnLogger.warn).toHaveBeenCalled();
  });

  // ── listAgents ─────────────────────────────────────────────────────────────

  it('listAgents — roundtrip: lists agents created via createAgent', async () => {
    await service.createAgent(validSpec);
    await service.createAgent({ name: 'Second Agent', prompt: 'Second.' });

    const agents = await service.listAgents();
    const slugs = agents.map((a) => a.slug);
    expect(slugs).toContain('my-agent');
    expect(slugs).toContain('second-agent');
  });

  // ── deleteAgent — referenced by workspace ─────────────────────────────────

  it('deleteAgent — referenced by workspace → success:false with "referenced" error', async () => {
    await service.createAgent(validSpec);

    // Create a workspace that references this agent
    const configLoader = new ConfigLoader({ workAgentDir: dir });
    await configLoader.createWorkspace({
      slug: 'ws1',
      name: 'Workspace 1',
      tabs: [
        {
          id: 'tab1',
          label: 'Tab',
          component: 'chat',
          prompts: [{ agent: 'my-agent', label: 'Test', prompt: 'test' }],
        },
      ],
    });

    const result = await service.deleteAgent('my-agent');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/referenced|in use|ws1/i);
  });
});
