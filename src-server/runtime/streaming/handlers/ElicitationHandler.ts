import type { StreamChunk, StreamHandler, HandlerConfig } from '../types.js';

/**
 * Configuration for elicitation (tool approval)
 */
export interface ElicitationConfig extends Pick<HandlerConfig, 'debug'> {
  /** List of tool name patterns to auto-approve (supports wildcards) */
  autoApprove: string[];
  /** Callback to request user approval for a tool call */
  onApprovalRequest: (request: ApprovalRequest) => Promise<boolean>;
}

/**
 * Tool approval request
 */
export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolDescription?: string;
  toolArgs: any;
}

/**
 * Handles tool call approval (elicitation)
 * 
 * For each tool-call event:
 * - Checks if tool is in auto-approve list
 * - If yes: passes through immediately
 * - If no: emits tool-approval-request, waits for user response, then passes through or blocks
 * 
 * This ensures approval requests happen in the correct order (after reasoning-end)
 * and prevents race conditions with other handlers.
 */
export class ElicitationHandler implements StreamHandler {
  name = 'elicitation';
  
  constructor(private config: ElicitationConfig) {}

  async *process(input: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    for await (const chunk of input) {
      if (chunk.type === 'tool-call') {
        yield* this.handleToolCall(chunk);
      } else {
        yield chunk;
      }
    }
  }

  /**
   * Handle tool-call event
   * Check auto-approve, request approval if needed, then pass through or block
   */
  private async *handleToolCall(chunk: any): AsyncGenerator<StreamChunk> {
    const toolName = chunk.toolName;
    
    // Check if auto-approved
    if (this.isAutoApproved(toolName)) {
      yield chunk; // Pass through immediately
      return;
    }
    
    // Need user approval
    const approvalId = this.generateApprovalId();
    
    // Emit approval request
    yield {
      type: 'tool-approval-request',
      approvalId,
      toolName,
      toolDescription: this.getToolDescription(chunk),
      toolArgs: chunk.input
    } as any;
    
    // Wait for user approval (suspends generator)
    const approved = await this.config.onApprovalRequest({
      approvalId,
      toolName,
      toolDescription: this.getToolDescription(chunk),
      toolArgs: chunk.input
    });
    
    if (approved) {
      yield chunk; // Pass through original tool-call
    }
    // If not approved, don't yield - block the tool call
  }

  /**
   * Check if tool name matches any auto-approve pattern
   * Supports wildcards: "tool_*" matches "tool_read", "tool_write", etc.
   */
  private isAutoApproved(toolName: string): boolean {
    return this.config.autoApprove.some(pattern => {
      if (pattern === '*') return true;
      
      // Convert wildcard pattern to regex
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
        .replace(/\*/g, '.*'); // Convert * to .*
      
      return new RegExp(`^${regexPattern}$`).test(toolName);
    });
  }

  /**
   * Generate unique approval ID
   */
  private generateApprovalId(): string {
    return `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract tool description from chunk if available
   */
  private getToolDescription(chunk: any): string | undefined {
    // Tool description might be in chunk metadata
    // For now, return undefined - can be enhanced later
    return undefined;
  }
}
