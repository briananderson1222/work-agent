import type {
  CreateTerminalRequest,
  RequestPermissionRequest,
} from '@agentclientprotocol/sdk';

export interface ACPMode {
  id: string;
  name: string;
  description?: string;
}

export interface ACPSlashCommand {
  name: string;
  description: string;
  hint?: string;
}

export interface ManagedTerminal {
  process: import('node:child_process').ChildProcess;
  output: string;
  exitCode: number | null;
}

export interface InitializeResult {
  protocolVersion: number;
  agentInfo?: {
    name: string;
    version?: string;
  };
  agentCapabilities?: {
    loadSession?: boolean;
    promptCapabilities?: {
      image?: boolean;
      audio?: boolean;
      embeddedContext?: boolean;
    };
  };
}

export interface ConfigOption {
  category: string;
  currentValue?: string;
  options?: Array<{
    name: string;
    value: string;
  }>;
}

export interface SessionResult {
  sessionId: string;
  modes?: {
    availableModes: ACPMode[];
    currentModeId?: string;
  };
  configOptions?: ConfigOption[];
}

export interface SessionUpdate {
  sessionUpdate: string;
  content?:
    | {
        type: string;
        text?: string;
        url?: string;
        data?: string;
        resource?: {
          text?: string;
          uri?: string;
        };
      }
    | Array<{
        type: string;
        content?: {
          type: string;
          text?: string;
        };
        path?: string;
        oldText?: string | null;
        newText?: string;
      }>;
  toolCallId?: string;
  title?: string;
  rawInput?: any;
  status?: string;
  entries?: Array<{
    status: string;
    content: string;
  }>;
  modeId?: string;
  configOptions?: ConfigOption[];
}

export interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: any;
  state?: string;
  result?: string;
  isError?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  metadata?: {
    timestamp?: number;
    model?: string | null;
  };
}

export interface ExtNotificationParams {
  commands?: Array<{
    name: string;
    description?: string;
    input?: {
      hint?: string;
    };
  }>;
  serverName?: string;
  url?: string;
}

export interface ToolCall {
  title?: string | null;
  rawInput?: any;
}

export interface ExtendedRequestPermissionRequest
  extends Omit<RequestPermissionRequest, 'toolCall'> {
  toolCall?: ToolCall;
}

export interface EnvironmentVariable {
  name: string;
  value: string;
}

export interface ExtendedCreateTerminalRequest extends CreateTerminalRequest {
  env?: EnvironmentVariable[];
}
