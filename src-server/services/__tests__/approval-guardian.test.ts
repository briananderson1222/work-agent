import { describe, expect, test, vi } from 'vitest';
import { ApprovalGuardianService } from '../approval-guardian.js';

vi.mock('../../telemetry/metrics.js', () => ({
  approvalGuardianOps: { add: vi.fn() },
}));

describe('ApprovalGuardianService', () => {
  test('returns defer when guardian is disabled', async () => {
    const service = new ApprovalGuardianService({
      appConfig: {
        defaultModel: 'default-model',
        invokeModel: 'invoke-model',
        structureModel: 'structure-model',
      },
      framework: {} as any,
      logger: { warn: vi.fn() },
      projectHomeDir: '/tmp/project',
    });

    await expect(
      service.reviewToolCall({
        agentSlug: 'planner',
        toolName: 'filesystem_write',
        toolArgs: {},
      }),
    ).resolves.toEqual({
      decision: 'defer',
      reason: 'Guardian disabled.',
    });
  });

  test('returns structured guardian decisions from the temp agent', async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        decision: 'deny',
        reason: 'The target path looks destructive.',
      },
    });
    const createTempAgent = vi.fn().mockResolvedValue({
      generateObject,
    });

    const service = new ApprovalGuardianService({
      appConfig: {
        defaultModel: 'default-model',
        invokeModel: 'invoke-model',
        structureModel: 'structure-model',
        approvalGuardian: {
          enabled: true,
          mode: 'enforce',
        },
      },
      framework: {
        createModel: vi.fn().mockResolvedValue({ kind: 'model' }),
        createTempAgent,
      } as any,
      logger: { warn: vi.fn() },
      projectHomeDir: '/tmp/project',
    });

    await expect(
      service.reviewToolCall({
        agentName: 'Planner',
        agentSlug: 'planner',
        toolName: 'filesystem_write',
        toolDescription: 'Write a file',
        toolArgs: { path: '/etc/passwd' },
      }),
    ).resolves.toEqual({
      decision: 'deny',
      reason: 'The target path looks destructive.',
    });

    expect(createTempAgent).toHaveBeenCalledOnce();
    expect(generateObject).toHaveBeenCalledOnce();
  });

  test('defers when guardian review fails', async () => {
    const service = new ApprovalGuardianService({
      appConfig: {
        defaultModel: 'default-model',
        invokeModel: 'invoke-model',
        structureModel: 'structure-model',
        approvalGuardian: {
          enabled: true,
        },
      },
      framework: {
        createModel: vi
          .fn()
          .mockRejectedValue(new Error('provider unavailable')),
      } as any,
      logger: { warn: vi.fn() },
      projectHomeDir: '/tmp/project',
    });

    await expect(
      service.reviewToolCall({
        agentSlug: 'planner',
        toolName: 'filesystem_write',
        toolArgs: {},
      }),
    ).resolves.toEqual({
      decision: 'defer',
      reason: 'Guardian review failed.',
    });
  });
});
