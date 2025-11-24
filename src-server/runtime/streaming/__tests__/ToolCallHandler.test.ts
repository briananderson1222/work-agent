import { describe, test, expect, beforeEach } from 'vitest';
import { ToolCallHandler } from '../handlers/ToolCallHandler.js';
import type { ProcessContext } from '../types.js';

class MockStream {
  written: string[] = [];
  async write(data: string) {
    this.written.push(data);
  }
}

describe('ToolCallHandler', () => {
  let stream: MockStream;
  let handler: ToolCallHandler;

  beforeEach(() => {
    stream = new MockStream();
    handler = new ToolCallHandler(stream, { debug: false });
  });

  test('writes tool-call events to stream', async () => {
    const context: ProcessContext = {
      originalChunk: { 
        type: 'tool-call',
        toolData: { name: 'test_tool', input: { arg: 'value' }, id: 'tool-1' }
      },
      metadata: new Map()
    };

    await handler.process(context);
    
    expect(stream.written.length).toBe(1);
    expect(stream.written[0]).toContain('tool-call');
    expect(stream.written[0]).toContain('test_tool');
  });

  test('passes through non-tool-call events', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: 'test' },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(stream.written.length).toBe(0);
    expect(result).toBe(context);
  });

  test('tracks tool call statistics', async () => {
    const context: ProcessContext = {
      originalChunk: { 
        type: 'tool-call',
        toolData: { name: 'test_tool', input: {}, id: 'tool-1' }
      },
      metadata: new Map()
    };

    await handler.process(context);
    
    expect(context.metadata.get('toolCalls')).toBe(1);
    expect(context.eventType).toBe('tool-call');
  });
});
