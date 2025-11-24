/**
 * Handler for tool-approval-request events
 */

import { StreamEventHandler } from './BaseHandler';
import type { StreamEvent, StreamState, HandlerResult } from './types';
import { createResult } from './stateHelpers';
import { log } from '@/utils/logger';

export class ToolApprovalHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'tool-approval-request';
  }

  handle(event: StreamEvent, state: StreamState): HandlerResult {
    const chatState = this.context.activeChatsStore?.getSnapshot()[this.context.sessionId];
    const sessionAutoApprove = chatState?.sessionAutoApprove || [];

    // Auto-approve if tool is in session auto-approve list
    if (sessionAutoApprove.includes(event.toolName)) {
      this.autoApprove(event.approvalId);
      return this.noOp(state);
    }

    // Track pending approval with toast ID
    const pendingApprovals = new Map(state.pendingApprovals || []);
    const argsKey = JSON.stringify(event.toolArgs);
    pendingApprovals.set(argsKey, event.approvalId);

    // Show approval UI and get toast ID
    const toastId = this.showApprovalToast(event, chatState);

    // Store toast ID for dismissal
    const approvalToasts = new Map(state.approvalToasts || []);
    approvalToasts.set(event.approvalId, toastId);

    // Update chat state with pending approval
    const chatPendingApprovals = chatState?.pendingApprovals || [];
    if (!chatPendingApprovals.includes(event.approvalId)) {
      this.context.updateChat(this.context.sessionId, {
        pendingApprovals: [...chatPendingApprovals, event.approvalId]
      });
    }

    return createResult(state, {
      updated: false,
      pendingApprovals,
      approvalToasts,
    });
  }

  private autoApprove(approvalId: string): void {
    if (!this.context.apiBase) return;

    fetch(`${this.context.apiBase}/tool-approval/${approvalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    }).catch(err => log.api('Failed to auto-approve tool:', err));
  }

  private showApprovalToast(event: StreamEvent, chatState: any): string {
    if (!this.context.showToolApproval || !this.context.handleToolApproval) return '';

    const agentName = chatState?.agentName || 'Agent';
    const agentSlug = chatState?.agentSlug || '';
    const conversationTitle = chatState?.title || chatState?.conversationId || 'Conversation';

    return this.context.showToolApproval({
      sessionId: this.context.sessionId,
      toolName: event.toolName,
      server: event.server,
      tool: event.tool,
      agentName,
      conversationTitle,
      onNavigate: this.context.onNavigateToChat
        ? () => this.context.onNavigateToChat!(this.context.sessionId)
        : undefined,
      actions: [
        {
          label: 'Deny',
          variant: 'danger',
          onClick: () =>
            this.context.handleToolApproval!(
              this.context.sessionId,
              agentSlug,
              event.approvalId,
              event.toolName,
              'deny'
            ),
        },
        {
          label: 'Allow Once',
          variant: 'secondary',
          onClick: () =>
            this.context.handleToolApproval!(
              this.context.sessionId,
              agentSlug,
              event.approvalId,
              event.toolName,
              'once'
            ),
        },
        {
          label: 'Always Allow',
          variant: 'primary',
          onClick: () =>
            this.context.handleToolApproval!(
              this.context.sessionId,
              agentSlug,
              event.approvalId,
              event.toolName,
              'trust'
            ),
        },
      ],
    });
  }
}
