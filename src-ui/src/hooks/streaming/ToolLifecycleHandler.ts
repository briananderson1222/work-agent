/**
 * Handler for tool lifecycle events (tool-call, tool-result)
 * Uses standard AI SDK event types
 */

import { StreamEventHandler } from './BaseHandler';
import {
  appendContentPart,
  createResult,
  getTextFromParts,
} from './stateHelpers';
import type { ContentPart, HandlerResult, StreamEvent, StreamState } from './types';

export class ToolLifecycleHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return ['tool-call', 'tool-result'].includes(event.type);
  }

  handle(event: StreamEvent, state: StreamState): HandlerResult {
    if (event.type === 'tool-call') {
      return this.handleToolCall(event, state);
    }
    return this.handleToolResult(event, state);
  }

  private handleToolCall(
    event: StreamEvent,
    state: StreamState,
  ): HandlerResult {
    let newContentParts = [...state.contentParts];

    // Add current text chunk as a text part if present
    if (state.currentTextChunk) {
      newContentParts = appendContentPart(newContentParts, {
        type: 'text',
        content: state.currentTextChunk,
      });
    }

    // Check if tool needs approval
    const chatState =
      this.context.activeChatsStore?.getSnapshot()[this.context.sessionId];
    const sessionAutoApprove = chatState?.sessionAutoApprove || [];
    const isAutoApproved = sessionAutoApprove.includes(event.toolName);

    const argsKey = JSON.stringify(event.input);
    const approvalId = state.pendingApprovals?.get(argsKey);
    const needsApproval = !!approvalId && !isAutoApproved;

    // Add tool part
    newContentParts = appendContentPart(newContentParts, {
      type: 'tool',
      tool: {
        id: event.toolCallId,
        name: event.toolName,
        server: event.server,
        toolName: event.tool,
        args: event.input,
        needsApproval,
        approvalId,
        approvalStatus: isAutoApproved ? 'auto-approved' : undefined,
      },
    });

    const streamingMessage = this.createStreamingMessage(
      getTextFromParts(newContentParts),
      newContentParts,
    );
    this.updateChat({ streamingMessage });

    return createResult(state, {
      currentTextChunk: '',
      contentParts: newContentParts,
      streamingMessage,
    });
  }

  private handleToolResult(
    event: StreamEvent,
    state: StreamState,
  ): HandlerResult {
    const toolCallId = event.toolCallId;
    const output = event.output || event.result;
    const error = event.error;

    const newContentParts = state.contentParts.map((part) => {
      if (part.type === 'tool' && part.tool?.id === toolCallId) {
        return {
          ...part,
          tool: {
            ...part.tool,
            result: output,
            error: error,
            state: error ? ('error' as const) : ('complete' as const),
          },
        } as ContentPart;
      }
      return part;
    }) as ContentPart[];

    const streamingMessage = this.createStreamingMessage(
      getTextFromParts(newContentParts),
      newContentParts,
    );
    this.updateChat({ streamingMessage });

    return createResult(state, {
      contentParts: newContentParts,
      streamingMessage,
    });
  }
}
