import { describe, expect, test } from 'vitest';
import {
  acpConnectionSchema,
  addJobSchema,
  pluginInstallSchema,
  promptCreateSchema,
} from '../schemas.js';

describe('schema definitions barrel', () => {
  test('exports runtime and content schemas through schemas.ts', () => {
    expect(
      acpConnectionSchema.parse({
        id: 'kiro',
        command: 'kiro-cli',
      }),
    ).toEqual({
      id: 'kiro',
      command: 'kiro-cli',
    });

    expect(
      promptCreateSchema.parse({
        name: 'My Prompt',
        content: 'Hello',
      }),
    ).toEqual({
      name: 'My Prompt',
      content: 'Hello',
    });
  });

  test('exports scheduler and system schemas through schemas.ts', () => {
    expect(
      addJobSchema.parse({
        name: 'daily-sync',
        cron: '0 9 * * *',
        prompt: 'run sync',
      }).name,
    ).toBe('daily-sync');

    expect(
      pluginInstallSchema.parse({
        source: 'https://example.com/plugin.tgz',
      }),
    ).toEqual({
      source: 'https://example.com/plugin.tgz',
    });
  });
});
