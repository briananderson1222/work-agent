import { describe, test, expect, vi } from 'vitest';
import { ACPBridge } from '../../services/acp-bridge.js';
import { ApprovalRegistry } from '../../services/approval-registry.js';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('ACPBridge', () => {
  describe('virtual agents', () => {
    test('hasAgent returns false when not connected', () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      expect(bridge.hasAgent('kiro-dev')).toBe(false);
    });

    test('getVirtualAgents returns empty when not connected', () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      expect(bridge.getVirtualAgents()).toEqual([]);
    });

    test('isConnected returns false initially', () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      expect(bridge.isConnected()).toBe(false);
    });

    test('getStatus returns disconnected initially', () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      const status = bridge.getStatus();
      expect(status.status).toBe('disconnected');
      expect(status.modes).toEqual([]);
      expect(status.sessionId).toBeNull();
    });

    test('getSlashCommands returns empty for unknown agent', () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      expect(bridge.getSlashCommands('kiro-dev')).toEqual([]);
    });
  });

  describe('handleChat returns 503 when not connected', async () => {
    test('returns error response', async () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      const mockContext = {
        json: vi.fn().mockReturnValue('error-response'),
      } as any;

      const result = await bridge.handleChat(mockContext, 'kiro-dev', 'hello', {});
      expect(mockContext.json).toHaveBeenCalledWith(
        { success: false, error: 'ACP not connected' },
        503
      );
      expect(result).toBe('error-response');
    });
  });

  describe('start with missing kiro-cli', () => {
    test('returns false and stays disconnected', async () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      // Override findKiroCli to simulate missing binary
      (bridge as any).findKiroCli = async () => null;

      const result = await bridge.start();
      expect(result).toBe(false);
      expect(bridge.isConnected()).toBe(false);
      expect(bridge.getStatus().status).toBe('disconnected');
    });
  });

  describe('shutdown', () => {
    test('cleans up without error when not connected', async () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      await expect(bridge.shutdown()).resolves.toBeUndefined();
    });

    test('prevents reconnect after shutdown', async () => {
      const bridge = new ACPBridge(new ApprovalRegistry(mockLogger), mockLogger, '/tmp');
      await bridge.shutdown();
      (bridge as any).findKiroCli = async () => '/usr/bin/kiro-cli';
      const result = await bridge.start();
      expect(result).toBe(false);
    });
  });
});
