import { describe, test, expect, beforeEach } from 'vitest';
import { ReasoningHandler } from '../handlers/ReasoningHandler.js';
import type { ProcessContext, BedrockChunk } from '../types.js';

class MockStream {
  written: string[] = [];
  async write(data: string) {
    this.written.push(data);
  }
}

describe('ReasoningHandler', () => {
  let stream: MockStream;
  let handler: ReasoningHandler;

  beforeEach(() => {
    stream = new MockStream();
    handler = new ReasoningHandler(stream, { enableThinking: true, debug: false });
  });

  test('detects thinking block start', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: '<thinking>' },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(result.eventType).toBe('reasoning-start');
    expect(stream.written.length).toBe(1);
    expect(stream.written[0]).toContain('reasoning-start');
  });

  test('buffers content inside thinking block', async () => {
    await handler.process({
      originalChunk: { type: 'text-delta', text: '<thinking>' },
      metadata: new Map()
    });

    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: 'test content' },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(result.eventType).toBe('reasoning-delta');
    expect(result.content).toBe('test content');
  });

  test('detects thinking block end', async () => {
    await handler.process({
      originalChunk: { type: 'text-delta', text: '<thinking>content' },
      metadata: new Map()
    });

    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: '</thinking>' },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(result.eventType).toBe('reasoning-end');
  });

  test('handles tag split across chunks', async () => {
    const ctx1: ProcessContext = {
      originalChunk: { type: 'text-delta', text: '<thin' },
      metadata: new Map()
    };
    await handler.process(ctx1);

    const ctx2: ProcessContext = {
      originalChunk: { type: 'text-delta', text: 'king>' },
      metadata: new Map()
    };
    const result = await handler.process(ctx2);

    expect(result.eventType).toBe('reasoning-start');
  });

  test('passes through non-thinking text as text-delta', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: 'regular text' },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(result.eventType).toBe('text-delta');
    expect(result.content).toBe('regular text');
  });

  test('respects enableThinking config', async () => {
    const disabledHandler = new ReasoningHandler(stream, { enableThinking: false });
    
    const context: ProcessContext = {
      originalChunk: { type: 'text-delta', text: '<thinking>' },
      metadata: new Map()
    };

    await disabledHandler.process(context);
    
    expect(stream.written.length).toBe(0);
  });

  test('passes through non-text-delta chunks', async () => {
    const context: ProcessContext = {
      originalChunk: { type: 'tool-call', toolData: { name: 'test', input: {}, id: '1' } },
      metadata: new Map()
    };

    const result = await handler.process(context);
    
    expect(result.eventType).toBeUndefined();
    expect(result).toBe(context);
  });
});
