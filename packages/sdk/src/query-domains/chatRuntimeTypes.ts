export type OrchestrationProviderKind = 'bedrock' | 'claude' | 'codex';

export interface ConversationSummary {
  id: string;
  resourceId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface ConversationLookup {
  id: string;
  agentSlug: string;
  projectSlug?: string;
  title?: string;
}

export interface ConversationMessagePart {
  type: string;
  content?: string;
  url?: string;
  mediaType?: string;
  name?: string;
  server?: string;
  toolName?: string;
  originalName?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  traceId?: string;
  contentParts?: ConversationMessagePart[];
}

export interface ChatAttachmentInput {
  data: string;
  type: string;
}

export interface OrchestrationProviderSummary {
  provider: OrchestrationProviderKind;
  activeSessions: number;
  prerequisites: Array<{
    id?: string;
    key?: string;
    name: string;
    status: string;
    description?: string;
  }>;
}

export type OrchestrationCommandInput =
  | {
      type: 'startSession';
      input: {
        threadId: string;
        provider: OrchestrationProviderKind;
        modelId?: string;
        modelOptions?: Record<string, unknown>;
        cwd?: string;
      };
    }
  | {
      type: 'sendTurn';
      input: {
        threadId: string;
        input: string;
        modelId?: string;
        modelOptions?: Record<string, unknown>;
      };
    }
  | {
      type: 'respondToRequest';
      threadId: string;
      requestId: string;
      decision: 'accept' | 'acceptForSession' | 'decline';
    };
