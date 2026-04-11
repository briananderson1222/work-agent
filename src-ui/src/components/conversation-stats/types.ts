export interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
}

export interface ConversationStatsSnapshot {
  contextWindowPercentage?: number;
  contextTokens?: number;
  systemPromptTokens?: number;
  mcpServerTokens?: number;
  userMessageTokens?: number;
  assistantMessageTokens?: number;
  contextFilesTokens?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  toolCalls: number;
  estimatedCost: number;
  modelStats?: Record<string, ModelStats>;
}
