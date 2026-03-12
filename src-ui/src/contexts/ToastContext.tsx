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
  /** Opaque metadata from server-side notifications (e.g. navigateTo for cross-project routing) */
  metadata?: Record<string, unknown>;
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

  show(
    message: string,
    sessionId?: string,
    duration = 5000,
    actions?: ToastAction[],
    metadata?: Record<string, unknown>,
  ) {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = {
      id,
      message,
      sessionId,
      duration,
      type: 'info',
      actions,
      metadata,
    };

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
  showToast: (
    message: string,
    sessionId?: string,
    duration?: number,
    actions?: ToastAction[],
  ) => string;
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
    (
      message: string,
      sessionId?: string,
      duration?: number,
      actions?: ToastAction[],
    ) => {
      return toastStore.show(message, sessionId, duration, actions);
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
