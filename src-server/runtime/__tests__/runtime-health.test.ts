import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  runRuntimeHealthChecks,
  startRuntimeHealthChecks,
} from '../runtime-health.js';

describe('runtime-health', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('startRuntimeHealthChecks runs immediately and schedules repeats', async () => {
    vi.useFakeTimers();
    const runHealthChecks = vi.fn(async () => {});
    const timers: NodeJS.Timeout[] = [];
    const logger = { debug: vi.fn() };

    startRuntimeHealthChecks({
      timers,
      logger,
      interval: 1000,
      runHealthChecks,
    });

    expect(runHealthChecks).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(runHealthChecks).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith('Health checks started', {
      interval: 1000,
    });

    clearInterval(timers[0]);
  });

  test('runRuntimeHealthChecks emits health snapshots for agent and ACP connections', async () => {
    const emitHealth = vi.fn();

    await runRuntimeHealthChecks({
      activeAgents: new Map([
        [
          'default',
          {
            model: { id: 'model-1' },
          },
        ],
      ]),
      agentSpecs: new Map([
        [
          'default',
          {
            tools: {
              mcpServers: ['docs'],
            },
          },
        ],
      ]),
      memoryAdapters: new Map([['default', {}]]),
      mcpConnectionStatus: new Map([
        ['default:docs', { connected: true }],
      ]),
      integrationMetadata: new Map([
        ['default:docs', { type: 'mcp', transport: 'stdio', toolCount: 3 }],
      ]),
      acpStatus: {
        connections: [{ id: 'claude', status: 'available', modes: ['chat'] }],
      },
      monitoringEmitter: { emitHealth },
    });

    expect(emitHealth).toHaveBeenCalledTimes(2);
    expect(emitHealth.mock.calls[0][0]).toMatchObject({
      slug: 'default',
      healthy: true,
      checks: {
        loaded: true,
        hasModel: true,
        hasMemory: true,
        integrationsConfigured: true,
        integrationsConnected: true,
      },
    });
    expect(emitHealth.mock.calls[1][0]).toMatchObject({
      slug: 'acp:claude',
      healthy: true,
      checks: {
        connected: true,
        modesAvailable: true,
      },
    });
  });
});
