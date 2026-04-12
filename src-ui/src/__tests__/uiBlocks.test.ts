import type { UIBlock } from '@stallion-ai/contracts/ui-block';
import { describe, expect, test } from 'vitest';
import { upsertToolResultBlocks } from '../hooks/orchestration/messageParts';
import { extractUIBlocks } from '../utils/uiBlocks';

describe('ui block helpers', () => {
  test('extracts valid card and table blocks from tool output', () => {
    expect(
      extractUIBlocks({
        uiBlocks: [
          {
            type: 'card',
            title: 'Summary',
            body: 'Ready to ship',
          },
          {
            type: 'table',
            columns: ['Metric', 'Value'],
            rows: [['Coverage', 98]],
          },
          { type: 'unknown' },
        ],
      }),
    ).toEqual([
      {
        type: 'card',
        title: 'Summary',
        body: 'Ready to ship',
        tone: undefined,
        fields: undefined,
        id: undefined,
      },
      {
        type: 'table',
        columns: ['Metric', 'Value'],
        rows: [['Coverage', 98]],
        caption: undefined,
        id: undefined,
        title: undefined,
      },
    ]);
  });

  test('inserts ui blocks immediately after their tool result', () => {
    const parts = upsertToolResultBlocks(
      [
        {
          type: 'tool',
          tool: { id: 'tool-1', name: 'summarize' },
        },
      ],
      'tool-1',
      [
        {
          type: 'card',
          title: 'Summary',
          body: 'Ready to ship',
        } satisfies UIBlock,
      ],
    );

    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({
      type: 'ui-block',
      toolCallId: 'tool-1',
      uiBlock: {
        type: 'card',
        title: 'Summary',
        body: 'Ready to ship',
      },
    });
  });
});
