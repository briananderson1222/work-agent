import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';

type ToastAction = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
};

type Toast = {
  id: string;
  message: string;
  sessionId?: string;
  duration?: number;
  type?: 'info' | 'tool-approval';
  toolName?: string;
  agentName?: string;
  conversationTitle?: string;
  actions?: ToastAction[];
  onNavigate?: () => void;
};

class ToastStore {
  private toasts: Toast[] = [];
  private history: (Toast & { timestamp: number; dismissed: boolean })[] = [];
  private listeners = new Set<() => void>();
  private historyListeners = new Set<() => void>();
  private snapshot = this.toasts;
  private historySnapshot = this.history;
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private maxHistory = 100; // Keep last 100 notifications

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeHistory = (listener: () => void) => {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  getHistorySnapshot = () => {
    return this.historySnapshot;
  };

  private notify = () => {
    this.snapshot = [...this.toasts];
    this.listeners.forEach((listener) => listener());
  };

  private notifyHistory = () => {
    this.historySnapshot = [...this.history];
    this.historyListeners.forEach((listener) => listener());
  };

  show(message: string, sessionId?: string, duration = 5000) {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, sessionId, duration, type: 'info' };

    this.toasts.push(toast);
    this.history.unshift({ ...toast, timestamp: Date.now(), dismissed: false });

    // Keep history size limited
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    this.notify();
    this.notifyHistory();

    // Auto-dismiss
    const timeout = setTimeout(() => {
      this.dismiss(id);
    }, duration);
    this.timeouts.set(id, timeout);

    return id;
  }

  showToolApproval(options: {
    sessionId: string;
    toolName: string;
    server?: string;
    tool?: string;
    agentName: string;
    conversationTitle?: string;
    actions: ToastAction[];
    onNavigate?: () => void;
  }) {
    const id = `approval-${Date.now()}-${Math.random()}`;

    // Format tool display: [server] tool or just toolName
    const toolDisplay =
      options.server && options.tool
        ? `[${options.server}] ${options.tool}`
        : options.toolName;

    const conversationInfo = options.conversationTitle || 'Conversation';

    const toast: Toast = {
      id,
      message: `${options.agentName} wants to use ${toolDisplay}`,
      sessionId: options.sessionId,
      type: 'tool-approval',
      toolName: toolDisplay,
      agentName: options.agentName,
      conversationTitle: conversationInfo,
      actions: options.actions,
      onNavigate: options.onNavigate,
      duration: 0, // No auto-dismiss for approvals
    };

    this.toasts.push(toast);
    this.history.unshift({ ...toast, timestamp: Date.now(), dismissed: false });

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    this.notify();
    this.notifyHistory();

    return id;
  }

  dismiss(id: string) {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    // Mark as dismissed in history
    const historyItem = this.history.find((h) => h.id === id);
    if (historyItem) {
      historyItem.dismissed = true;
      this.notifyHistory();
    }

    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
    this.toasts = [];
    this.notify();
  }

  clearHistory() {
    this.history = [];
    this.notifyHistory();
  }
}

export const toastStore = new ToastStore();

const ToastContext = createContext<{
  showToast: (message: string, sessionId?: string, duration?: number) => string;
  showToolApproval: (options: {
    sessionId: string;
    toolName: string;
    server?: string;
    tool?: string;
    agentName: string;
    conversationTitle?: string;
    actions: ToastAction[];
    onNavigate?: () => void;
  }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  clearHistory: () => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback(
    (message: string, sessionId?: string, duration?: number) => {
      return toastStore.show(message, sessionId, duration);
    },
    [],
  );

  const showToolApproval = useCallback(
    (options: {
      sessionId: string;
      toolName: string;
      server?: string;
      tool?: string;
      agentName: string;
      conversationTitle?: string;
      actions: ToastAction[];
      onNavigate?: () => void;
    }) => {
      return toastStore.showToolApproval(options);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    toastStore.dismiss(id);
  }, []);

  const clearToasts = useCallback(() => {
    toastStore.clear();
  }, []);

  const clearHistory = useCallback(() => {
    toastStore.clearHistory();
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showToolApproval,
        dismissToast,
        clearToasts,
        clearHistory,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function useToasts() {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
}

export function useNotificationHistory() {
  return useSyncExternalStore(
    toastStore.subscribeHistory,
    toastStore.getHistorySnapshot,
  );
}

// Toast display component
export function ToastContainer() {
  const toasts = useToasts();
  const { dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        if (toast.type === 'tool-approval') {
          return (
            <div
              key={toast.id}
              style={{
                padding: '16px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                color: 'var(--text-primary)',
                pointerEvents: 'auto',
                minWidth: '320px',
                maxWidth: '400px',
              }}
            >
              <div
                style={{
                  cursor: toast.onNavigate ? 'pointer' : 'default',
                  marginBottom: '12px',
                }}
                onClick={toast.onNavigate}
                onMouseEnter={(e) => {
                  if (toast.onNavigate) {
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '4px',
                  }}
                >
                  Tool Approval Required
                </div>
                <div
                  style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
                >
                  {toast.message}
                </div>
                {toast.onNavigate && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-primary)',
                      marginTop: '4px',
                      textDecoration: 'underline',
                    }}
                  >
                    Click to view chat
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                }}
              >
                {toast.actions?.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      action.onClick();
                      dismissToast(toast.id);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      borderRadius: '4px',
                      border:
                        action.variant === 'primary'
                          ? 'none'
                          : '1px solid var(--border-primary)',
                      background:
                        action.variant === 'primary'
                          ? 'var(--accent-primary)'
                          : action.variant === 'danger'
                            ? 'var(--error-bg)'
                            : 'transparent',
                      color:
                        action.variant === 'primary'
                          ? 'white'
                          : action.variant === 'danger'
                            ? 'var(--error-text)'
                            : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: action.variant === 'primary' ? 500 : 400,
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={toast.id}
            style={{
              padding: '12px 20px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              color: 'var(--text-primary)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              minWidth: '200px',
            }}
            onClick={() => dismissToast(toast.id)}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
