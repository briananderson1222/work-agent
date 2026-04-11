import { describe, expect, test } from 'vitest';
import { getModelDisplayName } from '../components/chat/message-bubble/utils';

describe('message bubble utils', () => {
  test('maps known Claude models to readable labels', () => {
    expect(getModelDisplayName('claude-3-7-sonnet-latest')).toBe(
      '🤖 Claude 3.7 Sonnet',
    );
    expect(getModelDisplayName('claude-3-opus')).toBe('🤖 Claude 3 Opus');
  });

  test('falls back to custom for unknown models', () => {
    expect(getModelDisplayName('gpt-5.4')).toBe('🤖 Custom');
  });
});
