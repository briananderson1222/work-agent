import { describe, test, expect, beforeEach } from 'vitest';
import { TextDeltaHandler } from '../handlers/TextDeltaHandler.js';
import type { ProcessContext } from '../types.js';

class MockStream {
  written: string[] = [];
  async write(data: string) {
    this.written.push(data);
  }
}

describe('TextDeltaHandler', () => {
  let stream: MockStream;
  let handler: TextDeltaHandler;

  beforeEach(() => {
    stream = new MockStream();
    handler = new TextDeltaHandler(stream, { debug: false });
  });

  test('writes text-delta events to stream', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: 'test' },
      eventType: 'text-delta',
      content: 'test content',
      metadata: new Map()
    };

    await handler.process(context);
    
    expect(stream.written.length).toBe(1);
    expect(stream.written[0]).toContain('text-delta');
    expect(stream.written[0]).toContain('test content');
  });

  test('passes through non-text-delta events', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'tool-call' },
      eventType: 'tool-call',
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(stream.written.length).toBe(0);
    expect(result).toBe(context);
  });

  test('tracks text statistics', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta' },
      eventType: 'text-delta',
      content: 'hello',
      metadata: new Map()
    };

    await handler.process(context);
    
    expect(context.metadata.get('textChunks')).toBe(1);
    expect(context.metadata.get('textLength')).toBe(5);
  });

  test('handles empty content', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta' },
      eventType: 'text-delta',
      content: '',
      metadata: new Map()
    };

    await handler.process(context);
    
    expect(stream.written.length).toBe(0);
  });
});
