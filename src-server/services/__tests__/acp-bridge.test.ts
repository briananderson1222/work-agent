import { describe, expect, test, vi } from 'vitest';
import { ACPConnection, ACPManager } from '../../services/acp-bridge.js';
import { ApprovalRegistry } from '../../services/approval-registry.js';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
const defaultConfig = {
  id: 'kiro',
  name: 'kiro-cli',
  command: 'kiro-cli',
  args: ['acp'],
  icon: '🔌',
  enabled: true,
};

describe('ACPConnection', () => {
  test('hasAgent returns false when not connected', () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(conn.hasAgent('kiro-dev')).toBe(false);
  });

  test('getVirtualAgents returns empty when not connected', () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(conn.getVirtualAgents()).toEqual([]);
  });

  test('isConnected returns false initially', () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(conn.isConnected()).toBe(false);
  });

  test('getStatus returns disconnected initially', () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(conn.getStatus().status).toBe('disconnected');
  });

  test('prefix matches config id', () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(conn.prefix).toBe('kiro');
  });

  test('disabled connection skips start', async () => {
    const conn = new ACPConnection(
      { ...defaultConfig, enabled: false },
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(await conn.start()).toBe(false);
  });

  test('handleChat returns 503 when not connected', async () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    const mockContext = { json: vi.fn().mockReturnValue('err') } as any;
    await conn.handleChat(mockContext, 'kiro-dev', 'hello', {});
    expect(mockContext.json).toHaveBeenCalledWith(
      { success: false, error: 'ACP not connected' },
      503,
    );
  });

  test('shutdown without error when not connected', async () => {
    const conn = new ACPConnection(
      defaultConfig,
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    await expect(conn.shutdown()).resolves.toBeUndefined();
  });
});

describe('ACPManager', () => {
  test('hasAgent returns false with no connections', () => {
    const mgr = new ACPManager(
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(mgr.hasAgent('kiro-dev')).toBe(false);
  });

  test('getVirtualAgents returns empty with no connections', () => {
    const mgr = new ACPManager(
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(mgr.getVirtualAgents()).toEqual([]);
  });

  test('getStatus returns empty connections array', () => {
    const mgr = new ACPManager(
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    expect(mgr.getStatus().connections).toEqual([]);
  });

  test('shutdown without error', async () => {
    const mgr = new ACPManager(
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    await expect(mgr.shutdown()).resolves.toBeUndefined();
  });

  test('removeConnection is no-op for unknown id', async () => {
    const mgr = new ACPManager(
      new ApprovalRegistry(mockLogger),
      mockLogger,
      '/tmp',
    );
    await expect(mgr.removeConnection('nonexistent')).resolves.toBeUndefined();
  });
});
