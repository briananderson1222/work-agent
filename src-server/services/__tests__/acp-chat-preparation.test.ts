import { describe, expect, test } from 'vitest';
import {
  findACPModelConfigToUpdate,
  resolveACPRequestedModeId,
} from '../acp-chat-preparation.js';

describe('resolveACPRequestedModeId', () => {
  test('strips the ACP prefix from a slug', () => {
    expect(resolveACPRequestedModeId('kiro', 'kiro-build')).toBe('build');
  });
});

describe('findACPModelConfigToUpdate', () => {
  test('returns null when no model change is needed', () => {
    expect(
      findACPModelConfigToUpdate(
        [{ id: 'model', category: 'model', currentValue: 'opus' }] as any,
        'opus',
      ),
    ).toBeNull();
  });

  test('returns config update payload when requested model differs', () => {
    expect(
      findACPModelConfigToUpdate(
        [{ id: 'model', category: 'model', currentValue: 'opus' }] as any,
        'sonnet',
      ),
    ).toEqual({
      configId: 'model',
      value: 'sonnet',
    });
  });
});
