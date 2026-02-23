import { describe, test, expect, beforeEach } from 'vitest';
import { StreamPipeline } from '../StreamPipeline.js';
import { ReasoningHandler } from '../handlers/ReasoningHandler.js';
import { TextDeltaHandler } from '../handlers/TextDeltaHandler.js';
import { ToolCallHandler } from '../handlers/ToolCallHandler.js';
import { MetadataHandler } from '../handlers/MetadataHandler.js';
import type { StreamChunk } from '../types.js';
import { toStream, collect } from './helpers.js';

describe('StreamPipeline Integration', () => {
  let pipeline: StreamPipeline;
  let metadataHandler: MetadataHandler;

  beforeEach(() => {
    metadataHandler = new MetadataHandler();
    pipeline = new StreamPipeline()
      .use(new ReasoningHandler({ enableThinking: true }))
      .use(new TextDeltaHandler())
      .use(new ToolCallHandler())
      .use(metadataHandler);
  });

  test('processes simple text response', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-start', id: '0' } as StreamChunk,
      { type: 'text-delta', id: '0', text: 'Hello ' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'world' } as unknown as StreamChunk,
      { type: 'text-end', id: '0' } as StreamChunk,
    ];

    const result = await collect(pipeline.run(toStream(chunks)));
    const textDeltas = result.filter(c => c.type === 'text-delta');
    expect(textDeltas.length).toBeGreaterThan(0);
    // Verify all text content is present
    const text = textDeltas.map(c => (c as any).text).join('');
    expect(text).toBe('Hello world');
  });

  test('processes response with thinking blocks', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-start', id: '0' } as StreamChunk,
      { type: 'text-delta', id: '0', text: '<thinking>' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'internal thought' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: '</thinking>' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'response' } as unknown as StreamChunk,
      { type: 'text-end', id: '0' } as StreamChunk,
    ];

    const result = await collect(pipeline.run(toStream(chunks)));
    expect(result.some(c => c.type === 'reasoning-start')).toBe(true);
    expect(result.some(c => c.type === 'reasoning-delta')).toBe(true);
    expect(result.some(c => c.type === 'reasoning-end')).toBe(true);
    expect(result.some(c => c.type === 'text-delta')).toBe(true);
  });

  test('processes response with tool calls', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-start', id: '0' } as StreamChunk,
      { type: 'text-delta', id: '0', text: 'Using tool...' } as unknown as StreamChunk,
      { type: 'text-end', id: '0' } as StreamChunk,
      { type: 'tool-call', toolCallId: '1', toolName: 'test_tool', args: { arg: 'val' } } as unknown as StreamChunk,
    ];

    const result = await collect(pipeline.run(toStream(chunks)));
    expect(result.some(c => c.type === 'text-delta')).toBe(true);
    expect(result.some(c => c.type === 'tool-call')).toBe(true);
  });

  test('processes mixed content: text + thinking + tool calls', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-start', id: '0' } as StreamChunk,
      { type: 'text-delta', id: '0', text: 'Start ' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: '<thinking>' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'plan' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: '</thinking>' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'middle ' } as unknown as StreamChunk,
      { type: 'text-end', id: '0' } as StreamChunk,
      { type: 'tool-call', toolCallId: '1', toolName: 'tool', args: {} } as unknown as StreamChunk,
      { type: 'text-start', id: '1' } as StreamChunk,
      { type: 'text-delta', id: '1', text: 'end' } as unknown as StreamChunk,
      { type: 'text-end', id: '1' } as StreamChunk,
    ];

    const result = await collect(pipeline.run(toStream(chunks)));
    expect(result.length).toBeGreaterThan(0);

    const stats = metadataHandler.finalize();
    expect(stats.textChunks).toBeGreaterThan(0);
    expect(stats.reasoningBlocks).toBe(1);
    expect(stats.toolCalls).toBe(1);
  });

  test('handles tag split across chunks', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-start', id: '0' } as StreamChunk,
      { type: 'text-delta', id: '0', text: '<thin' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'king>' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'thought' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: '</think' } as unknown as StreamChunk,
      { type: 'text-delta', id: '0', text: 'ing>' } as unknown as StreamChunk,
      { type: 'text-end', id: '0' } as StreamChunk,
    ];

    const result = await collect(pipeline.run(toStream(chunks)));
    expect(result.some(c => c.type === 'reasoning-start')).toBe(true);
    expect(result.some(c => c.type === 'reasoning-end')).toBe(true);
  });
});
