import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useRef } from 'react';

type Toast = {
  id: string;
  message: string;
  sessionId?: string;
  duration?: number;
};

class ToastStore {
  private toasts: Toast[] = [];
  private listeners = new Set<() => void>();
  private snapshot = this.toasts;
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.snapshot;
  };

  private notify = () => {
    this.snapshot = [...this.toasts];
    this.listeners.forEach(listener => listener());
  };

  show(message: string, sessionId?: string, duration = 5000) {
    const id = `${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, sessionId, duration };
    
    this.toasts.push(toast);
    this.notify();

    // Auto-dismiss
    const timeout = setTimeout(() => {
      this.dismiss(id);
    }, duration);
    this.timeouts.set(id, timeout);

    return id;
  }

  dismiss(id: string) {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
    
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  clear() {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    this.toasts = [];
    this.notify();
  }
}

export const toastStore = new ToastStore();

const ToastContext = createContext<{
  showToast: (message: string, sessionId?: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback((message: string, sessionId?: string, duration?: number) => {
    return toastStore.show(message, sessionId, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    toastStore.dismiss(id);
  }, []);

  const clearToasts = useCallback(() => {
    toastStore.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearToasts }}>
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
  return useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot
  );
}

// Toast display component
export function ToastContainer() {
  const toasts = useToasts();
  const { dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
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
      ))}
    </div>
  );
}
