/**
 * Stream event handler chain — unit tests.
 *
 * Tests the individual handlers (TextDeltaHandler, ToolLifecycleHandler,
 * ReasoningHandler, StepHandler) in isolation, and the priority behaviour
 * from useStreamingMessage.
 */
import { describe, it, expect, vi } from 'vitest';
import { TextDeltaHandler } from '../hooks/streaming/TextDeltaHandler';
import { ToolLifecycleHandler } from '../hooks/streaming/ToolLifecycleHandler';
import { ReasoningHandler } from '../hooks/streaming/ReasoningHandler';
import { StepHandler } from '../hooks/streaming/StepHandler';
import { createNoOpResult } from '../hooks/streaming/stateHelpers';
import type { HandlerContext, StreamState } from '../hooks/streaming/types';

function makeContext(overrides?: Partial<HandlerContext>): HandlerContext {
  return {
    sessionId: 'sess-1',
    updateChat: vi.fn(),
    ...overrides,
  };
}

function makeState(overrides?: Partial<StreamState>): StreamState {
  return {
    currentTextChunk: '',
    contentParts: [],
    ...overrides,
  };
}

// ── TextDeltaHandler ───────────────────────────────────────────────────────────

describe('TextDeltaHandler', () => {
  it('handles text-delta events', () => {
    const h = new TextDeltaHandler(makeContext());
    expect(h.canHandle({ type: 'text-delta', delta: 'hi' })).toBe(true);
    expect(h.canHandle({ type: 'tool-call' })).toBe(false);
  });

  it('text delta event → appends to currentTextChunk and returns streamingMessage', () => {
    const ctx = makeContext();
    const h = new TextDeltaHandler(ctx);
    const result = h.handle({ type: 'text-delta', delta: 'Hello' }, makeState());

    expect(result.currentTextChunk).toBe('Hello');
    expect(result.streamingMessage?.content).toContain('Hello');
    expect(ctx.updateChat).toHaveBeenCalled();
  });

  it('consecutive deltas accumulate', () => {
    const ctx = makeContext();
    const h = new TextDeltaHandler(ctx);
    const state1 = makeState();
    const r1 = h.handle({ type: 'text-delta', delta: 'Hello ' }, state1);
    const r2 = h.handle({ type: 'text-delta', delta: 'World' }, makeState({ currentTextChunk: r1.currentTextChunk }));

    expect(r2.currentTextChunk).toBe('Hello World');
  });

  it('empty delta → noOp (uses event.text as fallback)', () => {
    const ctx = makeContext();
    const h = new TextDeltaHandler(ctx);
    // No delta or text
    const result = h.handle({ type: 'text-delta' }, makeState());
    expect(result.updated).toBe(false);
    expect(ctx.updateChat).not.toHaveBeenCalled();
  });
});

// ── ToolLifecycleHandler ───────────────────────────────────────────────────────

describe('ToolLifecycleHandler', () => {
  it('handles tool-call and tool-result events', () => {
    const h = new ToolLifecycleHandler(makeContext());
    expect(h.canHandle({ type: 'tool-call' })).toBe(true);
    expect(h.canHandle({ type: 'tool-result' })).toBe(true);
    expect(h.canHandle({ type: 'text-delta' })).toBe(false);
  });

  it('tool-call event → creates tool content part', () => {
    const ctx = makeContext();
    const h = new ToolLifecycleHandler(ctx);
    const result = h.handle(
      { type: 'tool-call', toolCallId: 'tc-1', toolName: 'search', input: {} },
      makeState(),
    );

    const toolPart = result.contentParts.find((p) => p.type === 'tool');
    expect(toolPart).toBeDefined();
    expect(toolPart!.tool?.id).toBe('tc-1');
    expect(toolPart!.tool?.name).toBe('search');
  });

  it('tool-result event → updates matching tool part with result', () => {
    const ctx = makeContext();
    const h = new ToolLifecycleHandler(ctx);

    const stateWithTool = makeState({
      contentParts: [
        { type: 'tool', tool: { id: 'tc-1', name: 'search', state: 'pending' } },
      ],
    });

    const result = h.handle(
      { type: 'tool-result', toolCallId: 'tc-1', output: 'found it' },
      stateWithTool,
    );

    const toolPart = result.contentParts.find((p) => p.type === 'tool');
    expect(toolPart?.tool?.result).toBe('found it');
    expect(toolPart?.tool?.state).toBe('complete');
  });
});

// ── ReasoningHandler ───────────────────────────────────────────────────────────

describe('ReasoningHandler', () => {
  it('handles reasoning events', () => {
    const h = new ReasoningHandler(makeContext());
    for (const type of ['reasoning-start', 'reasoning-delta', 'reasoning-end', 'reasoning']) {
      expect(h.canHandle({ type })).toBe(true);
    }
    expect(h.canHandle({ type: 'text-delta' })).toBe(false);
  });

  it('reasoning-start → adds reasoning content part', () => {
    const ctx = makeContext();
    const h = new ReasoningHandler(ctx);
    const result = h.handle({ type: 'reasoning-start' }, makeState());

    const reasoningPart = result.contentParts.find((p) => p.type === 'reasoning');
    expect(reasoningPart).toBeDefined();
    expect(result.currentReasoningChunk).toBe('');
  });

  it('reasoning-delta → accumulates reasoning content', () => {
    const ctx = makeContext();
    const h = new ReasoningHandler(ctx);
    const stateWithReasoning = makeState({
      contentParts: [{ type: 'reasoning', content: '' }],
      currentReasoningChunk: '',
    });

    const result = h.handle(
      { type: 'reasoning-delta', textDelta: 'thinking...' },
      stateWithReasoning,
    );

    const reasoningPart = result.contentParts.find((p) => p.type === 'reasoning');
    expect(reasoningPart?.content).toBe('thinking...');
  });

  it('reasoning-end → clears currentReasoningChunk', () => {
    const ctx = makeContext();
    const h = new ReasoningHandler(ctx);
    const result = h.handle(
      { type: 'reasoning-end' },
      makeState({ currentReasoningChunk: 'was thinking' }),
    );

    expect(result.currentReasoningChunk).toBeUndefined();
  });
});

// ── StepHandler ────────────────────────────────────────────────────────────────

describe('StepHandler', () => {
  it('handles start-step and finish-step', () => {
    const h = new StepHandler(makeContext());
    expect(h.canHandle({ type: 'start-step' })).toBe(true);
    expect(h.canHandle({ type: 'finish-step' })).toBe(true);
    expect(h.canHandle({ type: 'text-delta' })).toBe(false);
  });

  it('start-step → calls updateChat with isProcessingStep:true', () => {
    const ctx = makeContext();
    const h = new StepHandler(ctx);
    h.handle({ type: 'start-step' }, makeState());

    expect(ctx.updateChat).toHaveBeenCalledWith('sess-1', { isProcessingStep: true });
  });

  it('finish-step → calls updateChat with isProcessingStep:false', () => {
    const ctx = makeContext();
    const h = new StepHandler(ctx);
    h.handle({ type: 'finish-step' }, makeState());

    expect(ctx.updateChat).toHaveBeenCalledWith('sess-1', { isProcessingStep: false });
  });
});

// ── Handler chain priority ─────────────────────────────────────────────────────

describe('handler chain priority', () => {
  it('first canHandle wins — does not double-process', () => {
    const ctx = makeContext();
    const updateChat = ctx.updateChat as ReturnType<typeof vi.fn>;

    const handlers = [
      new StepHandler(ctx),
      new ReasoningHandler(ctx),
      new TextDeltaHandler(ctx),
      new ToolLifecycleHandler(ctx),
    ];

    const event = { type: 'start-step' };
    const handler = handlers.find((h) => h.canHandle(event));
    handler?.handle(event, makeState());

    // Only StepHandler.updateChat should have been called (once)
    expect(updateChat).toHaveBeenCalledTimes(1);
  });

  it('unknown event type → no handler matched → no updateChat called', () => {
    const ctx = makeContext();
    const handlers = [
      new StepHandler(ctx),
      new ReasoningHandler(ctx),
      new TextDeltaHandler(ctx),
      new ToolLifecycleHandler(ctx),
    ];

    const event = { type: 'completely-unknown' };
    const handler = handlers.find((h) => h.canHandle(event));
    expect(handler).toBeUndefined();

    // Simulate what useStreamingMessage does when no handler matched
    const result = createNoOpResult(makeState());
    expect(result.updated).toBe(false);
    expect(ctx.updateChat).not.toHaveBeenCalled();
  });
});
