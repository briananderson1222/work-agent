import type { ProviderKind } from '@stallion-ai/contracts/provider';

export type OrchestrationEvent =
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'content.text-delta' | 'content.reasoning-delta';
      itemId: string;
      delta: string;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.started';
      itemId: string;
      toolCallId: string;
      toolName: string;
      arguments?: unknown;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.progress';
      itemId: string;
      toolCallId: string;
      message: string;
      progress?: number;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'tool.completed';
      itemId: string;
      toolCallId: string;
      toolName: string;
      status: 'success' | 'error' | 'cancelled';
      output?: unknown;
      error?: string;
      turnId?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'request.opened';
      requestId: string;
      requestType: string;
      title: string;
      description?: string;
      payload?: Record<string, unknown>;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'request.resolved';
      requestId: string;
      status: 'approved' | 'denied' | 'cancelled' | 'expired';
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.started';
      turnId: string;
      prompt?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.completed';
      turnId: string;
      outputText?: string;
      finishReason?: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'turn.aborted';
      turnId: string;
      reason: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'session.started' | 'session.configured' | 'session.exited';
      sessionId: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'session.state-changed';
      sessionId: string;
      from: string;
      to: string;
    }
  | {
      provider: ProviderKind;
      threadId: string;
      createdAt: string;
      method: 'runtime.error' | 'runtime.warning';
      message: string;
    };

export type OrchestrationSnapshotPayload = {
  sessions: Array<{
    provider: ProviderKind;
    threadId: string;
    status: string;
    model?: string;
  }>;
};

