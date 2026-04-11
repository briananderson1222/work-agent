import { describe, expect, test } from 'vitest';
import { errorMessage } from '../schema-validation.js';

describe('schema-validation helpers', () => {
  test('errorMessage returns the message for Error instances', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  test('errorMessage stringifies non-Error values', () => {
    expect(errorMessage({ code: 'E_FAIL' })).toBe('[object Object]');
  });
});
