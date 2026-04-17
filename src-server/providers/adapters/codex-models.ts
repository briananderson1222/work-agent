export type CodexReasoningEffort = 'xhigh' | 'high' | 'medium' | 'low';

export interface CodexModelOptions {
  reasoningEffort?: CodexReasoningEffort;
  fastMode?: boolean;
}
