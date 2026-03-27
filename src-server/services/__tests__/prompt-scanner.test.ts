import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { scanPromptDir } from '../prompt-scanner.js';

describe('scanPromptDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-scan-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('returns empty for missing directory', () => {
    expect(scanPromptDir(join(dir, 'nope'), 'test')).toEqual([]);
  });

  test('scans .md files and parses frontmatter', () => {
    writeFileSync(
      join(dir, 'hello.md'),
      `---\nlabel: Hello World\ndescription: A greeting\ncategory: general\n---\nSay hello to the user.`,
    );
    const prompts = scanPromptDir(dir, 'my-plugin');
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe('Hello World');
    expect(prompts[0].content).toBe('Say hello to the user.');
    expect(prompts[0].description).toBe('A greeting');
    expect(prompts[0].source).toBe('plugin:my-plugin');
    expect(prompts[0].id).toBe('my-plugin:hello');
  });

  test('uses filename as id when no frontmatter id', () => {
    writeFileSync(join(dir, 'test-prompt.md'), 'Just content, no frontmatter.');
    const prompts = scanPromptDir(dir, 'ns');
    expect(prompts[0].id).toBe('ns:test-prompt');
    expect(prompts[0].name).toBe('test-prompt');
  });

  test('ignores non-md files', () => {
    writeFileSync(join(dir, 'readme.txt'), 'not a prompt');
    writeFileSync(join(dir, 'actual.md'), 'a prompt');
    expect(scanPromptDir(dir, 'ns')).toHaveLength(1);
  });
});
