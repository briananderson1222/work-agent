import React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { _setWorkspaceContext } from './api';
import type { WorkspaceConfig } from './types';

/**
 * SDK Context - Provides access to all core app contexts and hooks
 *
 * The core app injects its contexts here, making them available to plugins
 * through the SDK hooks.
 */

export interface SDKContextValue {
  apiBase: string;

  // Core contexts (injected by core app)
  contexts: {
    agents?: any;
    workspaces?: any;
    conversations?: any;
    activeChats?: any;
    models?: any;
    config?: any;
    navigation?: any;
    toast?: any;
    stats?: any;
    auth?: any;
    keyboardShortcuts?: any;
    workflows?: any;
  };

  // Custom hooks (injected by core app)
  hooks: {
    slashCommandHandler?: () => any;
    slashCommands?: () => any;
    toolApproval?: () => any;
    keyboardShortcut?: (
      key: string,
      callback: () => void,
      deps?: any[],
    ) => void;
  };
}

export const SDKContext = createContext<SDKContextValue | null>(null);

interface SDKProviderProps {
  value: SDKContextValue;
  children: ReactNode;
}

/**
 * SDKProvider - Wraps plugins with SDK context
 *
 * The core app uses this to inject contexts into plugins.
 */
export function SDKProvider({ value, children }: SDKProviderProps) {
  return <SDKContext.Provider value={value}>{children}</SDKContext.Provider>;
}

/**
 * WorkspaceProvider - Convenience wrapper for workspace plugins
 *
 * Provides common workspace props and SDK context.
 */
interface WorkspaceProviderProps {
  sdk: SDKContextValue;
  workspace?: WorkspaceConfig;
  project?: { slug: string; name: string; [key: string]: any };
  layout?: { slug: string; type: string; [key: string]: any };
  children: ReactNode;
}

export function WorkspaceProvider({
  sdk,
  workspace,
  project: _project,
  layout: _layout,
  children,
}: WorkspaceProviderProps) {
  // Set workspace context for API agent resolution
  useEffect(() => {
    _setWorkspaceContext(workspace);
    return () => _setWorkspaceContext(undefined);
  }, [workspace]);

  return <SDKProvider value={sdk}>{children}</SDKProvider>;
}

// Workspace Navigation Context
interface WorkspaceNavigationContextType {
  getTabState: (tabId: string) => string;
  setTabState: (tabId: string, state: string) => void;
  clearTabState: (tabId: string) => void;
}

const WorkspaceNavigationContext =
  createContext<WorkspaceNavigationContextType | null>(null);

interface WorkspaceNavigationProviderProps {
  children: ReactNode;
  activeTabId?: string;
  workspaceSlug?: string;
}

// Global hash restoration mechanism
let lastSetHash: string | null = null;
const hashRestoreTimeout: NodeJS.Timeout | null = null;

const restoreHashIfCleared = () => {
  const currentHash = window.location.hash.slice(1);
  if (lastSetHash && currentHash !== lastSetHash) {
    window.location.hash = lastSetHash;
  }
};

export function WorkspaceNavigationProvider({
  children,
  activeTabId,
  workspaceSlug,
}: WorkspaceNavigationProviderProps) {
  const [_instanceId] = useState(() => Math.random().toString(36).substr(2, 9));

  // IMMEDIATE hash restoration - before any state initialization
  if (activeTabId && workspaceSlug) {
    const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
    const stored = sessionStorage.getItem(key);
    const currentHash = window.location.hash.slice(1);

    if (stored && !currentHash) {
      window.location.hash = stored;
    }
  }

  const [previousActiveTab, setPreviousActiveTab] = useState<
    string | undefined
  >(undefined);
  const [isInitialized, setIsInitialized] = useState(false);

  // Log mount/unmount
  useEffect(() => {
    return () => {};
  }, []);

  // Restore hash from sessionStorage on mount
  useEffect(() => {
    if (activeTabId && workspaceSlug) {
      const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
      const stored = sessionStorage.getItem(key);
      const currentHash = window.location.hash.slice(1);
      if (stored && !currentHash) {
        window.location.hash = stored;
      }
    }
  }, [activeTabId, workspaceSlug]); // Empty deps - only run on mount

  // Debug: Track all hash changes
  useEffect(() => {
    const handleHashChange = () => {};

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle tab switching - restore hash for the active tab
  useEffect(() => {
    // Skip on first mount - let existing hash remain
    if (!isInitialized) {
      setPreviousActiveTab(activeTabId);
      setIsInitialized(true);
      return;
    }

    if (previousActiveTab !== activeTabId && activeTabId) {
      // Always restore the active tab's hash when switching tabs
      const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        window.location.hash = stored;
      } else {
        window.location.hash = '';
      }
      setPreviousActiveTab(activeTabId);
    }
  }, [activeTabId, previousActiveTab, workspaceSlug, isInitialized]);

  const getTabState = useCallback(
    (tabId: string): string => {
      // Always use sessionStorage as source of truth
      const key = `workspace-${workspaceSlug}-tab-${tabId}`;
      const stored = sessionStorage.getItem(key);
      return stored || '';
    },
    [workspaceSlug],
  );

  const setTabState = useCallback(
    (tabId: string, state: string) => {
      // Always save to sessionStorage first
      const key = `workspace-${workspaceSlug}-tab-${tabId}`;
      sessionStorage.setItem(key, state);

      if (tabId === activeTabId) {
        // Active tab also updates URL hash
        window.location.hash = state;

        // Global restoration mechanism - use requestAnimationFrame for after render
        lastSetHash = state;
        if (hashRestoreTimeout) clearTimeout(hashRestoreTimeout);
        requestAnimationFrame(() => {
          setTimeout(restoreHashIfCleared, 0);
        });
      }
    },
    [activeTabId, workspaceSlug],
  );

  const clearTabState = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) {
        window.location.hash = '';
      } else {
        const key = `workspace-${workspaceSlug}-tab-${tabId}`;
        sessionStorage.removeItem(key);
      }
    },
    [activeTabId, workspaceSlug],
  );

  return (
    <WorkspaceNavigationContext.Provider
      value={{ getTabState, setTabState, clearTabState }}
    >
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation() {
  const context = useContext(WorkspaceNavigationContext);
  if (!context) {
    // Context validation
    throw new Error(
      'useWorkspaceNavigation must be used within WorkspaceNavigationProvider',
    );
  }
  return context;
}
