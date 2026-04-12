/**
 * Shared registry for pending tool approval requests.
 * Used by both VoltAgent elicitation and ACP permission requests.
 */

import { approvalDuration, approvalOps } from '../telemetry/metrics.js';
import type { EventBus } from './event-bus.js';

export interface ApprovalRequestMetadata {
  agentName?: string;
  agentSlug?: string;
  conversationId?: string;
  conversationTitle?: string;
  description?: string;
  server?: string | null;
  source: 'acp' | 'runtime';
  title: string;
  tool?: string;
  toolName?: string;
}

export interface ApprovalRegisterOptions {
  metadata?: ApprovalRequestMetadata;
  timeoutMs?: number;
}

interface PendingApproval {
  metadata?: ApprovalRequestMetadata;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

export class ApprovalRegistry {
  private pending = new Map<string, PendingApproval>();
  private logger: any;
  private eventBus?: EventBus;

  constructor(logger: any, options?: { eventBus?: EventBus }) {
    this.logger = logger;
    this.eventBus = options?.eventBus;
  }

  /**
   * Register a pending approval and wait for resolution.
   * Returns a Promise<boolean> that resolves when the user responds.
   */
  register(
    approvalId: string,
    options: ApprovalRegisterOptions | number = 60000,
  ): Promise<boolean> {
    const timeoutMs =
      typeof options === 'number' ? options : (options.timeoutMs ?? 60000);
    const metadata = typeof options === 'number' ? undefined : options.metadata;

    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const entry = this.pending.get(approvalId);
        if (entry) {
          this.pending.delete(approvalId);
          this.logger.warn('[ApprovalRegistry] Timeout', { approvalId });
          this.emitResolved(approvalId, 'expired', entry.metadata);
          resolve(false);
        }
      }, timeoutMs);

      const wrappedResolve = (value: boolean) => {
        clearTimeout(timeout);
        resolve(value);
      };

      this.pending.set(approvalId, {
        metadata,
        resolve: wrappedResolve,
        reject,
        createdAt: Date.now(),
      });
      approvalOps.add(1, { operation: 'request' });
      this.eventBus?.emit('approval:opened', {
        approvalId,
        ...serializeMetadata(metadata),
      });
    });
  }

  /**
   * Resolve a pending approval. Returns true if found, false if not.
   */
  resolve(approvalId: string, approved: boolean): boolean {
    const entry = this.pending.get(approvalId);
    if (entry) {
      const elapsed = Date.now() - entry.createdAt;
      entry.resolve(approved);
      this.pending.delete(approvalId);
      approvalOps.add(1, { operation: approved ? 'approve' : 'deny' });
      approvalDuration.record(elapsed, {
        action: approved ? 'approve' : 'deny',
      });
      this.emitResolved(
        approvalId,
        approved ? 'approved' : 'denied',
        entry.metadata,
      );
      this.logger.info('[ApprovalRegistry] Resolved', { approvalId, approved });
      return true;
    }
    return false;
  }

  has(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  cancelAll(): number {
    let count = 0;
    for (const [approvalId, entry] of this.pending) {
      entry.resolve(false);
      this.emitResolved(approvalId, 'cancelled', entry.metadata);
      count++;
    }
    this.pending.clear();
    return count;
  }

  /** Generate a unique approval ID */
  static generateId(prefix = 'approval'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private emitResolved(
    approvalId: string,
    status: 'approved' | 'cancelled' | 'denied' | 'expired',
    metadata?: ApprovalRequestMetadata,
  ): void {
    this.eventBus?.emit('approval:resolved', {
      approvalId,
      status,
      ...serializeMetadata(metadata),
    });
  }
}

function serializeMetadata(
  metadata?: ApprovalRequestMetadata,
): Record<string, string> {
  if (!metadata) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      value == null ? [] : [[key, String(value)]],
    ),
  );
}
