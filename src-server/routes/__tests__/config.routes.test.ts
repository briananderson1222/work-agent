/**
 * Config Routes — contract tests.
 *
 * Uses real ConfigLoader (temp dir) and a mocked eventBus.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConfigRoutes } from '../config.js';
import { makeTempDir, makeConfigLoader, mockLogger, req } from './helpers.js';

describe('config routes', () => {
  let dir: string;
  let cleanup: () => void;
  let eventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const tmp = makeTempDir();
    dir = tmp.dir;
    cleanup = tmp.cleanup;
    eventBus = { emit: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function makeApp(withEventBus = true) {
    const configLoader = makeConfigLoader(dir);
    const logger = mockLogger();
    return createConfigRoutes(
      configLoader,
      logger,
      withEventBus ? eventBus : undefined,
    );
  }

  // ── GET /app ──────────────────────────────────────────────────────────────

  it('GET /app — fresh dir → 200 with default config fields', async () => {
    const { status, body } = await req(makeApp(), 'GET', '/app');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Default config should have region and defaultModel
    expect(body.data).toMatchObject({
      region: expect.any(String),
      defaultModel: expect.any(String),
    });
  });

  // ── PUT /app ──────────────────────────────────────────────────────────────

  it('PUT /app — valid update → 200 merged, eventBus.emit called', async () => {
    const { status, body } = await req(makeApp(), 'PUT', '/app', {
      region: 'us-west-2',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.region).toBe('us-west-2');
    expect(eventBus.emit).toHaveBeenCalledWith(
      'system:status-changed',
      expect.objectContaining({ source: 'config' }),
    );
  });

  it('PUT /app — emits event with {source:"config"}', async () => {
    await req(makeApp(), 'PUT', '/app', { region: 'eu-west-1' });
    const [eventName, eventData] = eventBus.emit.mock.calls[0];
    expect(eventName).toBe('system:status-changed');
    expect(eventData).toEqual({ source: 'config' });
  });

  it('PUT /app — no eventBus → 200, no crash', async () => {
    const { status, body } = await req(makeApp(false), 'PUT', '/app', {
      region: 'ap-south-1',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT /app — GET roundtrip: second GET returns updated value', async () => {
    await req(makeApp(), 'PUT', '/app', { region: 'ca-central-1' });

    const { body } = await req(makeApp(), 'GET', '/app');
    expect(body.data.region).toBe('ca-central-1');
  });

  it('PUT /app — partial update preserves other fields', async () => {
    // Get default config first
    const { body: initial } = await req(makeApp(), 'GET', '/app');
    const originalModel = initial.data.defaultModel;

    await req(makeApp(), 'PUT', '/app', { region: 'us-east-2' });

    const { body: updated } = await req(makeApp(), 'GET', '/app');
    expect(updated.data.region).toBe('us-east-2');
    expect(updated.data.defaultModel).toBe(originalModel);
  });

  it('PUT /app — invalid schema → 400', async () => {
    // Pass an invalid type to trigger validation error
    const { status, body } = await req(makeApp(), 'PUT', '/app', {
      region: 12345, // region must be a string
    });
    // validation via Zod/ajv may return 400
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('GET /app — configLoader throws → 500', async () => {
    const configLoader = makeConfigLoader(dir);
    const logger = mockLogger();
    // Override loadAppConfig to throw
    (configLoader as any).loadAppConfig = vi
      .fn()
      .mockRejectedValue(new Error('disk failure'));

    const app = createConfigRoutes(configLoader, logger, eventBus);
    const { status, body } = await req(app, 'GET', '/app');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });
});
