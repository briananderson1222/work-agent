/**
 * Shared registry for pending tool approval requests.
 * Used by both VoltAgent elicitation and ACP permission requests.
 */

interface PendingApproval {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
}

export class ApprovalRegistry {
  private pending = new Map<string, PendingApproval>();
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * Register a pending approval and wait for resolution.
   * Returns a Promise<boolean> that resolves when the user responds.
   */
  register(approvalId: string, timeoutMs = 60000): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.has(approvalId)) {
          this.pending.delete(approvalId);
          this.logger.warn('[ApprovalRegistry] Timeout', { approvalId });
          resolve(false);
        }
      }, timeoutMs);

      const wrappedResolve = (value: boolean) => {
        clearTimeout(timeout);
        resolve(value);
      };

      this.pending.set(approvalId, { resolve: wrappedResolve, reject });
    });
  }

  /**
   * Resolve a pending approval. Returns true if found, false if not.
   */
  resolve(approvalId: string, approved: boolean): boolean {
    const entry = this.pending.get(approvalId);
    if (entry) {
      entry.resolve(approved);
      this.pending.delete(approvalId);
      this.logger.info('[ApprovalRegistry] Resolved', { approvalId, approved });
      return true;
    }
    return false;
  }

  has(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  /** Generate a unique approval ID */
  static generateId(prefix = 'approval'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
