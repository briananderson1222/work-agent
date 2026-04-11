import { describe, expect, test } from 'vitest';
import {
  getOpenFileMime,
  isAllowedOpenFilePath,
  parseToolCallResponse,
} from '../dev/http.js';

describe('dev http helpers', () => {
  test('parseToolCallResponse unwraps nested MCP text payloads', () => {
    expect(
      parseToolCallResponse({
        content: [
          {
            text: JSON.stringify({
              content: [{ text: JSON.stringify({ ok: true, count: 2 }) }],
            }),
          },
        ],
      }),
    ).toEqual({ ok: true, count: 2 });
  });

  test('getOpenFileMime maps known extensions and falls back to plain text', () => {
    expect(getOpenFileMime('notes.md')).toBe('text/markdown');
    expect(getOpenFileMime('config.json')).toBe('application/json');
    expect(getOpenFileMime('other.xyz')).toBe('text/plain');
  });

  test('isAllowedOpenFilePath only allows cwd and plugin tree access', () => {
    expect(isAllowedOpenFilePath('/repo/src/file.ts', '/repo', '/plugins')).toBe(
      true,
    );
    expect(
      isAllowedOpenFilePath('/plugins/demo/plugin.json', '/repo', '/plugins'),
    ).toBe(true);
    expect(isAllowedOpenFilePath('/etc/passwd', '/repo', '/plugins')).toBe(
      false,
    );
  });
});
