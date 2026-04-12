import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  buildLayoutAgentReferences,
  deleteStoredRecord,
  listSortedConversations,
  saveStoredRecord,
} from '../file-storage-records.js';

describe('file-storage-records', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'storage-records-'));
    filePath = join(tempDir, 'records.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('saveStoredRecord upserts by id and deleteStoredRecord removes existing entries', () => {
    saveStoredRecord(filePath, { id: 'one', value: 1 });
    saveStoredRecord(filePath, { id: 'one', value: 2 });

    expect(deleteStoredRecord(filePath, 'one')).toBe(true);
    expect(deleteStoredRecord(filePath, 'missing')).toBe(false);
  });

  test('listSortedConversations sorts newest-first and applies pagination', () => {
    saveStoredRecord(filePath, {
      id: 'one',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    saveStoredRecord(filePath, {
      id: 'two',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    saveStoredRecord(filePath, {
      id: 'three',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(listSortedConversations(filePath, { offset: 1, limit: 1 })).toEqual([
      expect.objectContaining({ id: 'two' }),
    ]);
  });

  test('buildLayoutAgentReferences finds tab, global, and configured agent references', () => {
    const refs = buildLayoutAgentReferences(
      [{ slug: 'project-a' }],
      () => [{ slug: 'layout-1' }],
      () => ({
        config: {
          tabs: [{ prompts: [{ agent: 'agent-a' }] }],
          actions: [{ agent: 'agent-b' }],
          defaultAgent: 'agent-c',
          availableAgents: ['agent-d'],
        },
      }),
      'agent-c',
    );

    expect(refs).toEqual([
      { projectSlug: 'project-a', layoutSlug: 'layout-1' },
    ]);
  });
});
