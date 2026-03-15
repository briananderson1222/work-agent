import type { EventEmitter } from 'node:events';
import { trace } from '@opentelemetry/api';
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
    private monitoringEvents?: EventEmitter,
    private context?: {
      slug: string;
      conversationId?: string;
      userId?: string;
      traceId?: string;
      plugin?: string;
    },
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
        otelToolCalls.add(1, { tool: chunk.toolName || 'unknown', plugin: this.context?.plugin || '' });
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
    if (!this.monitoringEvents || !this.context) return;

    const baseEvent = {
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      agentSlug: this.context.slug,
      conversationId: this.context.conversationId,
      userId: this.context.userId,
      traceId: this.context.traceId,
    };

    switch (chunk.type) {
      case 'tool-call':
        this.monitoringEvents.emit('event', {
          ...baseEvent,
          type: 'tool-call',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          input: chunk.input,
          toolCallNumber: this.stats.toolCalls,
        });
        trace.getActiveSpan()?.addEvent('tool-call', {
          'tool.name': chunk.toolName,
          'tool.call_id': chunk.toolCallId,
        });
        break;

      case 'tool-result':
        this.monitoringEvents.emit('event', {
          ...baseEvent,
          type: 'tool-result',
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          result: chunk.output,
        });
        trace.getActiveSpan()?.addEvent('tool-result', {
          'tool.name': chunk.toolName,
          'tool.call_id': chunk.toolCallId,
        });
        break;

      case 'reasoning-end': {
        // Only emit reasoning event at the end with complete content
        // Note: reasoning-end in AI SDK doesn't have text field, but custom handlers may add it
        const reasoningChunk = chunk as StreamChunk & { text?: string };
        if (reasoningChunk.text) {
          this.monitoringEvents.emit('event', {
            ...baseEvent,
            type: 'reasoning',
            data: reasoningChunk.text,
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
