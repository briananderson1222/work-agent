import type { EventEmitter } from 'node:events';
import { trace } from '@opentelemetry/api';
import { MonitoringEmitter } from '../../../monitoring/emitter.js';
import {
  toolCalls as otelToolCalls,
  toolDuration as otelToolDuration,
} from '../../../telemetry/metrics.js';
import type { StreamChunk, StreamHandler } from '../types.js';

/**
 * Collects statistics and emits monitoring events
 *
 * Tracks:
 * - Text chunks
 * - Reasoning blocks
 * - Tool calls + duration
 * - Step count
 *
 * Emits monitoring events for observability
 */
export class MetadataHandler implements StreamHandler {
  name = 'metadata';

  private stats = {
    textChunks: 0,
    reasoningBlocks: 0,
    toolCalls: 0,
    steps: 0,
  };

  private toolStartTimes = new Map<string, { start: number; tool: string }>();

  constructor(
    _monitoringEvents?: EventEmitter,
    private context?: {
      slug: string;
      conversationId?: string;
      userId?: string;
      traceId?: string;
      plugin?: string;
    },
    private monitoringEmitter?: MonitoringEmitter,
  ) {}

  async *process(
    input: AsyncIterable<StreamChunk>,
  ): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      // Collect stats
      this.collectStats(chunk);

      // Emit monitoring events
      this.emitMonitoringEvent(chunk);

      // Pass through unchanged
      yield chunk;
    }
  }

  private collectStats(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text-delta':
        this.stats.textChunks++;
        break;
      case 'reasoning-start':
        this.stats.reasoningBlocks++;
        break;
      case 'tool-call':
        this.stats.toolCalls++;
        otelToolCalls.add(1, {
          tool: chunk.toolName || 'unknown',
          plugin: this.context?.plugin || '',
        });
        if (chunk.toolCallId) {
          this.toolStartTimes.set(chunk.toolCallId, {
            start: performance.now(),
            tool: chunk.toolName || 'unknown',
          });
        }
        break;
      case 'tool-result':
        if (chunk.toolCallId) {
          const entry = this.toolStartTimes.get(chunk.toolCallId);
          if (entry) {
            otelToolDuration.record(performance.now() - entry.start, {
              tool: entry.tool,
              plugin: this.context?.plugin || '',
            });
            this.toolStartTimes.delete(chunk.toolCallId);
          }
        }
        break;
      case 'start-step':
        this.stats.steps++;
        break;
    }
  }

  private emitMonitoringEvent(chunk: StreamChunk): void {
    if (!this.monitoringEmitter || !this.context) return;
    const { slug, conversationId, userId, traceId } = this.context;

    switch (chunk.type) {
      case 'tool-call':
        this.monitoringEmitter.emitToolCall({
          slug,
          conversationId: conversationId ?? '',
          userId: userId ?? '',
          traceId: traceId ?? '',
          toolName: chunk.toolName || 'unknown',
          toolCallId: chunk.toolCallId || '',
          input: chunk.input,
          toolCallNumber: this.stats.toolCalls,
        });
        trace.getActiveSpan()?.addEvent('tool-call', {
          'tool.name': chunk.toolName || 'unknown',
          'tool.call_id': chunk.toolCallId,
        });
        break;
      case 'tool-result':
        this.monitoringEmitter.emitToolResult({
          slug,
          conversationId: conversationId ?? '',
          userId: userId ?? '',
          traceId: traceId ?? '',
          toolName: chunk.toolName || 'unknown',
          toolCallId: chunk.toolCallId || '',
          result: chunk.output,
        });
        trace.getActiveSpan()?.addEvent('tool-result', {
          'tool.name': chunk.toolName || 'unknown',
          'tool.call_id': chunk.toolCallId,
        });
        break;
      case 'reasoning-end': {
        const reasoningChunk = chunk as StreamChunk & { text?: string };
        if (reasoningChunk.text) {
          this.monitoringEmitter.emitReasoning({
            slug,
            conversationId: conversationId ?? '',
            userId: userId ?? '',
            traceId: traceId ?? '',
            text: reasoningChunk.text,
          });
        }
        break;
      }
    }
  }

  finalize() {
    return this.stats;
  }
}
