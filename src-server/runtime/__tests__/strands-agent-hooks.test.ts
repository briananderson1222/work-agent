import {
  AfterInvocationEvent,
  AfterToolCallEvent,
  BeforeToolCallEvent,
} from '@strands-agents/sdk';
import { describe, expect, test, vi } from 'vitest';
import { wireStrandsAgentHooks } from '../strands-agent-hooks.js';

function createHooksRegistry() {
  const callbacks = new Map<any, any>();
  return {
    callbacks,
    addHook: vi.fn((eventType: any, callback: any) => {
      callbacks.set(eventType, callback);
    }),
  };
}

describe('wireStrandsAgentHooks', () => {
  test('marks denied tool calls and forwards after-tool hooks', async () => {
    const registry = createHooksRegistry();
    const deniedToolUseIds = new Set<string>();
    const afterToolCall = vi.fn();

    wireStrandsAgentHooks({
      strandsAgent: { addHook: registry.addHook } as any,
      hooks: {
        beforeToolCall: vi.fn().mockResolvedValue(false),
        afterToolCall,
      },
      deniedToolUseIds,
      invocationCtx: {
        agentSlug: 'agent-a',
        conversationId: 'conv-1',
        userId: 'user-1',
      },
      memoryAdapter: {
        getMessages: vi.fn().mockResolvedValue([]),
        addMessage: vi.fn(),
      } as any,
      logger: { info: vi.fn(), error: vi.fn() },
      resolvedModel: 'anthropic.test',
      getLastStreamUsage: () => null,
    });

    await registry.callbacks.get(BeforeToolCallEvent)({
      toolUse: { name: 'read_file', toolUseId: 'tool-1', input: { path: 'a' } },
    });
    registry.callbacks.get(AfterToolCallEvent)({
      toolUse: { name: 'read_file', toolUseId: 'tool-1', input: { path: 'a' } },
      result: { content: { ok: true } },
    });

    expect(deniedToolUseIds.has('tool-1')).toBe(true);
    expect(afterToolCall).toHaveBeenCalledWith(
      {
        toolName: 'read_file',
        toolCallId: 'tool-1',
        toolArgs: { path: 'a' },
      },
      {
        output: { ok: true },
        error: undefined,
      },
      {
        agentSlug: 'agent-a',
        conversationId: 'conv-1',
        userId: 'user-1',
      },
    );
  });

  test('syncs messages and forwards usage on invocation completion', async () => {
    const registry = createHooksRegistry();
    const memoryAdapter = {
      getMessages: vi.fn().mockResolvedValue([]),
      addMessage: vi.fn().mockResolvedValue(undefined),
    };
    const afterInvocation = vi.fn().mockResolvedValue(undefined);

    wireStrandsAgentHooks({
      strandsAgent: { addHook: registry.addHook } as any,
      hooks: { afterInvocation },
      deniedToolUseIds: new Set<string>(),
      invocationCtx: {
        agentSlug: 'agent-a',
        conversationId: 'conv-1',
        userId: 'user-1',
      },
      memoryAdapter: memoryAdapter as any,
      logger: { info: vi.fn(), error: vi.fn() },
      resolvedModel: 'anthropic.test',
      getLastStreamUsage: () => ({ promptTokens: 3, completionTokens: 2 }),
    });

    await registry.callbacks.get(AfterInvocationEvent)({
      agent: {
        messages: [{ role: 'assistant', content: [{ text: 'hello' }] }],
      },
    });

    expect(memoryAdapter.getMessages).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(memoryAdapter.addMessage).toHaveBeenCalledTimes(1);
    expect(afterInvocation).toHaveBeenCalledWith({
      invocation: {
        agentSlug: 'agent-a',
        conversationId: 'conv-1',
        userId: 'user-1',
      },
      usage: {
        promptTokens: 3,
        completionTokens: 2,
      },
      toolCallCount: 0,
    });
  });
});
