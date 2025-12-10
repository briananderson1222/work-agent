/**
 * Types for stream event handling system
 */

export interface ContentPart {
  type: 'text' | 'tool' | 'reasoning';
  content?: string;
  tool?: ToolInfo;
}

export interface ToolInfo {
  id: string;
  name: string;
  server?: string;
  toolName?: string;
  args?: any;
  result?: any;
  error?: any;
  state?: 'pending' | 'complete' | 'error';
  needsApproval?: boolean;
  approvalId?: string;
  approvalStatus?: 'auto-approved' | 'pending' | 'denied';
}

export interface StreamState {
  currentTextChunk: string;
  contentParts: ContentPart[];
  pendingApprovals?: Map<string, string>;
  approvalToasts?: Map<string, string>; // approvalId -> toastId
  reasoningChunks?: string[];
  currentReasoningChunk?: string;
}

export interface StreamEvent {
  type: string;
  [key: string]: any;
}

export interface HandlerResult {
  updated: boolean;
  currentTextChunk: string;
  contentParts: ContentPart[];
  pendingApprovals?: Map<string, string>;
  approvalToasts?: Map<string, string>; // approvalId -> toastId
  reasoningChunks?: string[];
  currentReasoningChunk?: string;
  streamingMessage?: {
    role: 'assistant';
    content: string;
    contentParts?: ContentPart[];
  };
}

export interface HandlerContext {
  sessionId: string;
  updateChat: (sessionId: string, updates: any) => void;
  apiBase?: string;
  showToolApproval?: (options: any) => void;
  handleToolApproval?: (sessionId: string, agentSlug: string, approvalId: string, toolName: string, action: string) => void;
  onNavigateToChat?: (sessionId: string) => void;
  activeChatsStore?: any;
}
