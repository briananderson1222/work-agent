import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApprovalRegistry } from '../../services/approval-registry.js';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('ApprovalRegistry', () => {
  let registry: ApprovalRegistry;

  beforeEach(() => {
    registry = new ApprovalRegistry(mockLogger);
  });

  test('register and resolve approved', async () => {
    const promise = registry.register('test-1');
    expect(registry.has('test-1')).toBe(true);

    registry.resolve('test-1', true);
    const result = await promise;

    expect(result).toBe(true);
    expect(registry.has('test-1')).toBe(false);
  });

  test('register and resolve denied', async () => {
    const promise = registry.register('test-2');
    registry.resolve('test-2', false);
    expect(await promise).toBe(false);
  });

  test('resolve unknown id returns false', () => {
    expect(registry.resolve('nonexistent', true)).toBe(false);
  });

  test('timeout resolves as denied', async () => {
    const promise = registry.register('test-timeout', 50);
    const result = await promise;
    expect(result).toBe(false);
  });

  test('generateId produces unique ids', () => {
    const a = ApprovalRegistry.generateId('test');
    const b = ApprovalRegistry.generateId('test');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^test-/);
  });

  test('multiple concurrent approvals', async () => {
    const p1 = registry.register('a');
    const p2 = registry.register('b');
    const p3 = registry.register('c');

    registry.resolve('b', true);
    registry.resolve('a', false);
    registry.resolve('c', true);

    expect(await p1).toBe(false);
    expect(await p2).toBe(true);
    expect(await p3).toBe(true);
  });
});
