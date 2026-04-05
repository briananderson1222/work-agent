import { describe, expect, test } from 'vitest';
import { type CliCommandResult, parseCliAuthState } from '../cli-auth.js';

describe('parseCliAuthState', () => {
  test('treats explicit login-required output as unauthenticated', () => {
    const result: CliCommandResult = {
      stdout: '',
      stderr: 'Not logged in. Run codex login.',
      code: 1,
    };

    expect(parseCliAuthState(result, 'codex')).toBe('unauthenticated');
  });

  test('treats json auth markers as authenticated', () => {
    const result: CliCommandResult = {
      stdout: JSON.stringify({ authenticated: true }),
      stderr: '',
      code: 0,
    };

    expect(parseCliAuthState(result, 'claude')).toBe('authenticated');
  });

  test('treats zero exit code without markers as authenticated', () => {
    const result: CliCommandResult = {
      stdout: 'Logged in',
      stderr: '',
      code: 0,
    };

    expect(parseCliAuthState(result, 'claude')).toBe('authenticated');
  });

  test('falls back to unknown for inconclusive failures', () => {
    const result: CliCommandResult = {
      stdout: '',
      stderr: 'something unexpected happened',
      code: 1,
    };

    expect(parseCliAuthState(result, 'claude')).toBe('unknown');
  });
});
