import { describe, expect, test, vi } from 'vitest';
import { shutdownRuntimeServices } from '../runtime-shutdown.js';

describe('shutdownRuntimeServices', () => {
  test('stops runtime services, disconnects MCPs, and clears state', async () => {
    const timer = setTimeout(() => {}, 60_000);
    const schedulerService = { stop: vi.fn(async () => {}) };
    const activeAgents = new Map([['default', { id: 'default' }]]);
    const mcpConfigs = new Map([
      ['alpha', { disconnect: vi.fn(async () => {}) }],
      ['beta', { disconnect: vi.fn(async () => {}) }],
    ]);
    const logger = { info: vi.fn(), error: vi.fn() };

    await shutdownRuntimeServices({
      logger,
      timers: [timer],
      schedulerService,
      mcpConfigs,
      activeAgents,
      acpBridge: { shutdown: vi.fn(async () => {}) },
      feedbackService: { stop: vi.fn() },
      notificationService: { stop: vi.fn() },
      voiceService: { stop: vi.fn(async () => {}) },
      terminalWsServer: { stop: vi.fn() },
      terminalService: { dispose: vi.fn(async () => {}) },
      configLoader: { dispose: vi.fn(async () => {}) },
    });

    expect(schedulerService.stop).toHaveBeenCalledTimes(1);
    expect(mcpConfigs.size).toBe(0);
    expect(activeAgents.size).toBe(0);
    expect(logger.info).toHaveBeenCalledWith('Shutdown complete');
  });
});
