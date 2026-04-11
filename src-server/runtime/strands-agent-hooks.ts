import {
  AfterInvocationEvent,
  AfterToolCallEvent,
  BeforeToolCallEvent,
  Agent as StrandsAgent,
} from '@strands-agents/sdk';
import { syncStrandsMessagesToMemory } from './strands-message-sync.js';
import type {
  IAgentHooks,
  IMemory,
  InvocationContext,
  TokenUsage,
} from './types.js';

export function wireStrandsAgentHooks(options: {
  strandsAgent: StrandsAgent;
  hooks?: IAgentHooks;
  deniedToolUseIds: Set<string>;
  invocationCtx: InvocationContext;
  memoryAdapter: IMemory;
  logger: any;
  resolvedModel: string;
  getLastStreamUsage: () => TokenUsage | null | undefined;
}): void {
  const {
    strandsAgent,
    hooks,
    deniedToolUseIds,
    invocationCtx,
    memoryAdapter,
    logger,
    resolvedModel,
    getLastStreamUsage,
  } = options;

  let toolCallCount = 0;

  if (hooks?.beforeToolCall) {
    strandsAgent.hooks.addCallback(BeforeToolCallEvent, async (event) => {
      const approved = await hooks.beforeToolCall!(
        {
          toolName: event.toolUse.name,
          toolCallId: event.toolUse.toolUseId,
          toolArgs: event.toolUse.input,
        },
        invocationCtx,
      );
      if (!approved) {
        deniedToolUseIds.add(event.toolUse.toolUseId);
      }
    });
  }

  if (hooks?.afterToolCall) {
    strandsAgent.hooks.addCallback(AfterToolCallEvent, (event) => {
      toolCallCount++;
      hooks.afterToolCall!(
        {
          toolName: event.toolUse.name,
          toolCallId: event.toolUse.toolUseId,
          toolArgs: event.toolUse.input,
        },
        {
          output: event.result?.content,
          error: event.error,
        },
        invocationCtx,
      );
    });
  }

  strandsAgent.hooks.addCallback(AfterInvocationEvent, async (event) => {
    logger.info('[Strands] AfterInvocationEvent fired', {
      hasMessages: !!(event as any).agent?.messages?.length,
      messageCount: (event as any).agent?.messages?.length || 0,
      lastStreamUsage: getLastStreamUsage(),
      conversationId: invocationCtx.conversationId,
      userId: invocationCtx.userId,
      agentSlug: invocationCtx.agentSlug,
    });

    const agentMessages = (event as any).agent?.messages || [];
    const ctx: InvocationContext = { ...invocationCtx };

    await syncStrandsMessagesToMemory({
      agentMessages,
      invocation: ctx,
      logger,
      memoryAdapter,
      resolvedModel,
    });

    if (hooks?.afterInvocation) {
      await hooks.afterInvocation({
        invocation: invocationCtx,
        usage: getLastStreamUsage() || (event as any).metrics?.usage,
        toolCallCount,
      });
    }

    toolCallCount = 0;
  });
}
