import { describe, test, expect, beforeEach } from 'vitest';
import { StreamPipeline } from '../StreamPipeline.js';
import { ReasoningHandler } from '../handlers/ReasoningHandler.js';
import { TextDeltaHandler } from '../handlers/TextDeltaHandler.js';
import { ToolCallHandler } from '../handlers/ToolCallHandler.js';
import { MetadataHandler } from '../handlers/MetadataHandler.js';
import type { BedrockChunk } from '../types.js';

class MockStream {
  written: string[] = [];
  async write(data: string) {
    this.written.push(data);
  }
  
  getEvents() {
    return this.written.map(line => {
      const match = line.match(/data: (.+)\n\n/);
      return match ? JSON.parse(match[1]) : null;
    }).filter(Boolean);
  }
}

describe('StreamPipeline Integration', () => {
  let stream: MockStream;
  let pipeline: StreamPipeline;
  let metadataHandler: MetadataHandler;

  beforeEach(() => {
    stream = new MockStream();
    metadataHandler = new MetadataHandler();
    
    pipeline = new StreamPipeline()
      .use(new ReasoningHandler(stream, { enableThinking: true }))
      .use(new TextDeltaHandler(stream))
      .use(new ToolCallHandler(stream))
      .use(metadataHandler);
  });

  test('processes simple text response', async () => {
    const chunks: BedrockChunk[] = [
      { type: 'text-delta', text: 'Hello ' },
      { type: 'text-delta', text: 'world' }
    ];

    for (const chunk of chunks) {
      await pipeline.process(chunk);
    }

    const events = stream.getEvents();
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('text-delta');
    expect(events[0].content).toBe('Hello ');
    expect(events[1].content).toBe('world');
  });

  test('processes response with thinking blocks', async () => {
    const chunks: BedrockChunk[] = [
      { type: 'text-delta', text: '<thinking>' },
      { type: 'text-delta', text: 'internal thought' },
      { type: 'text-delta', text: '</thinking>' },
      { type: 'text-delta', text: 'response' }
    ];

    for (const chunk of chunks) {
      await pipeline.process(chunk);
    }

    const events = stream.getEvents();
    expect(events.some(e => e.type === 'reasoning-start')).toBe(true);
    expect(events.some(e => e.type === 'reasoning-delta')).toBe(true);
    expect(events.some(e => e.type === 'reasoning-end')).toBe(true);
    expect(events.some(e => e.type === 'text-delta' && e.content === 'response')).toBe(true);
  });

  test('processes response with tool calls', async () => {
    const chunks: BedrockChunk[] = [
      { type: 'text-delta', text: 'Using tool...' },
      { type: 'tool-call', toolData: { name: 'test_tool', input: { arg: 'val' }, id: 'tool-1' } }
    ];

    for (const chunk of chunks) {
      await pipeline.process(chunk);
    }

    const events = stream.getEvents();
    expect(events.some(e => e.type === 'text-delta')).toBe(true);
    expect(events.some(e => e.type === 'tool-call')).toBe(true);
  });

  test('processes mixed content: text + thinking + tool calls', async () => {
    const chunks: BedrockChunk[] = [
      { type: 'text-delta', text: 'Start ' },
      { type: 'text-delta', text: '<thinking>' },
      { type: 'text-delta', text: 'plan' },
      { type: 'text-delta', text: '</thinking>' },
      { type: 'text-delta', text: 'middle ' },
      { type: 'tool-call', toolData: { name: 'tool', input: {}, id: '1' } },
      { type: 'text-delta', text: 'end' }
    ];

    for (const chunk of chunks) {
      await pipeline.process(chunk);
    }

    const events = stream.getEvents();
    expect(events.length).toBeGreaterThan(0);
    
    const stats = metadataHandler.getStats();
    expect(stats.textChunks).toBeGreaterThan(0);
    expect(stats.reasoningBlocks).toBe(1);
    expect(stats.toolCalls).toBe(1);
  });

  test('handles tag split across chunks', async () => {
    const chunks: BedrockChunk[] = [
      { type: 'text-delta', text: '<thin' },
      { type: 'text-delta', text: 'king>' },
      { type: 'text-delta', text: 'thought' },
      { type: 'text-delta', text: '</think' },
      { type: 'text-delta', text: 'ing>' }
    ];

    for (const chunk of chunks) {
      await pipeline.process(chunk);
    }

    const events = stream.getEvents();
    expect(events.some(e => e.type === 'reasoning-start')).toBe(true);
    expect(events.some(e => e.type === 'reasoning-end')).toBe(true);
  });
});
