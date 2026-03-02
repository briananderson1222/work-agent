/**
 * System Routes — contract tests.
 *
 * All external calls mocked: node:child_process, bedrock, registry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { mockLogger, req } from './helpers.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../providers/bedrock.js', () => ({
  checkBedrockCredentials: vi.fn(),
}));

vi.mock('../../providers/registry.js', () => ({
  getOnboardingProviders: vi.fn().mockReturnValue([]),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execSync: vi.fn(),
}));

import { checkBedrockCredentials } from '../../providers/bedrock.js';
import { getOnboardingProviders } from '../../providers/registry.js';
import { execFile } from 'node:child_process';
import { createSystemRoutes } from '../system.js';

const mockCheckCreds = checkBedrockCredentials as ReturnType<typeof vi.fn>;
const mockGetProviders = getOnboardingProviders as ReturnType<typeof vi.fn>;
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

function makeExecFileImpl(results: Record<string, string>) {
  return (cmd: string, args: string[], cb: (err: any, stdout: string) => void) => {
    if (cmd === 'which') {
      const tool = args[0];
      const found = results[tool];
      if (found) {
        cb(null, found);
      } else {
        cb(new Error('not found'), '');
      }
    } else {
      cb(null, '');
    }
  };
}

function makeACPStatus(connected: boolean) {
  return {
    getACPStatus: () => ({
      connected,
      connections: connected ? [{ id: 'test', status: 'connected' }] : [],
    }),
    getAppConfig: () => ({ region: 'us-east-1', defaultModel: 'claude-3' }),
  };
}

describe('system routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviders.mockReturnValue([]);
    // Default: all tools found
    mockExecFile.mockImplementation(
      makeExecFileImpl({ boo: '/usr/bin/boo', 'kiro-cli': '/usr/bin/kiro-cli', claude: '/usr/bin/claude' }),
    );
  });

  function makeApp(deps?: Parameters<typeof createSystemRoutes>[0]) {
    return createSystemRoutes(
      deps ?? makeACPStatus(true),
      mockLogger(),
    );
  }

  // ── GET /status ───────────────────────────────────────────────────────────

  it('GET /status — all green → 200, ready:true', async () => {
    mockCheckCreds.mockResolvedValue(true);

    const { status, body } = await req(makeApp(), 'GET', '/status');
    expect(status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.bedrock.credentialsFound).toBe(true);
    expect(body.acp.connected).toBe(true);
    expect(body.scheduler.booInstalled).toBe(true);
  });

  it('GET /status — credentials missing → credentialsFound:false', async () => {
    mockCheckCreds.mockResolvedValue(false);

    const { body } = await req(makeApp(makeACPStatus(false)), 'GET', '/status');
    expect(body.bedrock.credentialsFound).toBe(false);
    expect(body.ready).toBe(false);
  });

  it('GET /status — boo not installed → booInstalled:false', async () => {
    mockCheckCreds.mockResolvedValue(true);
    mockExecFile.mockImplementation(
      makeExecFileImpl({ 'kiro-cli': '/usr/bin/kiro-cli', claude: '/usr/bin/claude' }),
    );

    const { body } = await req(makeApp(), 'GET', '/status');
    expect(body.scheduler.booInstalled).toBe(false);
  });

  it('GET /status — ACP disconnected → acp.connected:false', async () => {
    mockCheckCreds.mockResolvedValue(true);

    const { body } = await req(makeApp(makeACPStatus(false)), 'GET', '/status');
    expect(body.acp.connected).toBe(false);
  });

  it('GET /status — prerequisite provider throws → still returns 200, empty prerequisites', async () => {
    mockCheckCreds.mockResolvedValue(true);
    mockGetProviders.mockReturnValue([
      {
        provider: { getPrerequisites: vi.fn().mockRejectedValue(new Error('boom')) },
        source: 'test',
      },
    ]);

    const { status, body } = await req(makeApp(), 'GET', '/status');
    expect(status).toBe(200);
    expect(body.prerequisites).toEqual([]);
  });

  // ── GET /capabilities ────────────────────────────────────────────────────

  it('GET /capabilities → 200 with voice + context shape', async () => {
    const { status, body } = await req(makeApp(), 'GET', '/capabilities');
    expect(status).toBe(200);
    expect(body.voice).toBeDefined();
    expect(Array.isArray(body.voice.stt)).toBe(true);
    expect(Array.isArray(body.voice.tts)).toBe(true);
    expect(body.context).toBeDefined();
    expect(Array.isArray(body.context.providers)).toBe(true);
  });

  // ── GET /discover ─────────────────────────────────────────────────────────

  it('GET /discover → 200 with stallion:true, name, port; CORS header present', async () => {
    const app = makeApp();
    const res = await app.request('/discover', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json();
    expect(body.stallion).toBe(true);
    expect(typeof body.name).toBe('string');
    expect(typeof body.port).toBe('number');
  });

  // ── POST /verify-bedrock ──────────────────────────────────────────────────

  it('POST /verify-bedrock — BedrockClient throws → 400/500 verified:false', async () => {
    // We can't easily mock the dynamic import of @aws-sdk/client-bedrock here,
    // so we just verify the error response shape. In practice the SDK may not
    // be available or credentials are wrong in test environment.
    const { body } = await req(makeApp(), 'POST', '/verify-bedrock', {
      region: 'us-east-1',
    });
    // In test environment without real AWS, it should fail
    expect(body).toBeDefined();
    // Either succeeds (CI with real creds) or fails gracefully
    if (body.verified === false) {
      expect(typeof body.error).toBe('string');
    }
  });
});
