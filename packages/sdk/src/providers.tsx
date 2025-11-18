import React, { createContext, useContext, useCallback, ReactNode, useState, useEffect } from 'react';
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
    keyboardShortcuts?: any;
    workflows?: any;
  };
  
  // Custom hooks (injected by core app)
  hooks: {
    slashCommandHandler?: () => any;
    slashCommands?: () => any;
    toolApproval?: () => any;
    keyboardShortcut?: (key: string, callback: () => void, deps?: any[]) => void;
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
  return (
    <SDKContext.Provider value={value}>
      {children}
    </SDKContext.Provider>
  );
}

/**
 * WorkspaceProvider - Convenience wrapper for workspace plugins
 * 
 * Provides common workspace props and SDK context.
 */
interface WorkspaceProviderProps {
  sdk: SDKContextValue;
  workspace?: WorkspaceConfig;
  children: ReactNode;
}

export function WorkspaceProvider({ sdk, workspace, children }: WorkspaceProviderProps) {
  // Set workspace context for API agent resolution
  useEffect(() => {
    _setWorkspaceContext(workspace);
    return () => _setWorkspaceContext(undefined);
  }, [workspace]);

  return (
    <SDKProvider value={sdk}>
      {children}
    </SDKProvider>
  );
}

// Workspace Navigation Context
interface WorkspaceNavigationContextType {
  getTabState: (tabId: string) => string;
  setTabState: (tabId: string, state: string) => void;
  clearTabState: (tabId: string) => void;
}

const WorkspaceNavigationContext = createContext<WorkspaceNavigationContextType | null>(null);

interface WorkspaceNavigationProviderProps {
  children: ReactNode;
  activeTabId?: string;
  workspaceSlug?: string;
}

// Global hash restoration mechanism
let lastSetHash: string | null = null;
let hashRestoreTimeout: NodeJS.Timeout | null = null;

const restoreHashIfCleared = () => {
  const currentHash = window.location.hash.slice(1);
  console.log('[WorkspaceNavigation] Global restore check:', { lastSetHash, currentHash });
  if (lastSetHash && currentHash !== lastSetHash) {
    console.log('[WorkspaceNavigation] Global: Hash was cleared, restoring:', lastSetHash);
    window.location.hash = lastSetHash;
  }
};

export function WorkspaceNavigationProvider({ 
  children, 
  activeTabId, 
  workspaceSlug 
}: WorkspaceNavigationProviderProps) {
  const [instanceId] = useState(() => Math.random().toString(36).substr(2, 9));
  console.log('[WorkspaceNavigationProvider] Render - Instance:', instanceId, 'with:', { activeTabId, workspaceSlug });
  
  // IMMEDIATE hash restoration - before any state initialization
  if (activeTabId && workspaceSlug) {
    const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
    const stored = sessionStorage.getItem(key);
    const currentHash = window.location.hash.slice(1);
    
    if (stored && !currentHash) {
      console.log('[WorkspaceNavigation] IMMEDIATE restore on render:', stored);
      window.location.hash = stored;
    }
  }
  
  const [previousActiveTab, setPreviousActiveTab] = useState<string | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);

  // Log mount/unmount
  useEffect(() => {
    console.log('[WorkspaceNavigationProvider] MOUNTED - Instance:', instanceId);
    return () => {
      console.log('[WorkspaceNavigationProvider] UNMOUNTED - Instance:', instanceId);
    };
  }, [instanceId]);

  // Restore hash from sessionStorage on mount
  useEffect(() => {
    if (activeTabId && workspaceSlug) {
      const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
      const stored = sessionStorage.getItem(key);
      const currentHash = window.location.hash.slice(1);
      console.log('[WorkspaceNavigation] Mount restore check:', { key, stored, currentHash, instanceId });
      if (stored && !currentHash) {
        console.log('[WorkspaceNavigation] Restoring hash on mount:', stored);
        window.location.hash = stored;
      }
    }
  }, []); // Empty deps - only run on mount

  // Debug: Track all hash changes
  useEffect(() => {
    const handleHashChange = () => {
      console.log('[WorkspaceNavigation] Hash changed to:', window.location.hash);
      console.trace('[WorkspaceNavigation] Hash change stack trace');
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Handle tab switching - restore hash for the active tab
  useEffect(() => {
    console.log('[WorkspaceNavigation] Tab change effect running:', { previousActiveTab, activeTabId, currentHash: window.location.hash, isInitialized });
    
    // Skip on first mount - let existing hash remain
    if (!isInitialized) {
      console.log('[WorkspaceNavigation] Skipping first mount, setting initialized');
      setPreviousActiveTab(activeTabId);
      setIsInitialized(true);
      return;
    }
    
    if (previousActiveTab !== activeTabId && activeTabId) {
      console.log('[WorkspaceNavigation] Tab changed, restoring hash for active tab');
      // Always restore the active tab's hash when switching tabs
      const key = `workspace-${workspaceSlug}-tab-${activeTabId}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        console.log('[WorkspaceNavigation] Restoring hash for active tab:', stored);
        window.location.hash = stored;
      } else {
        console.log('[WorkspaceNavigation] No stored hash for tab, clearing hash');
        window.location.hash = '';
      }
      setPreviousActiveTab(activeTabId);
    }
  }, [activeTabId, previousActiveTab, workspaceSlug, isInitialized]);

  const getTabState = useCallback((tabId: string): string => {
    console.log('[WorkspaceNavigation] getTabState called for:', tabId, 'activeTabId:', activeTabId);
    // Always use sessionStorage as source of truth
    const key = `workspace-${workspaceSlug}-tab-${tabId}`;
    const stored = sessionStorage.getItem(key);
    console.log('[WorkspaceNavigation] Returning stored state:', stored);
    return stored || '';
  }, [activeTabId, workspaceSlug]);

  const setTabState = useCallback((tabId: string, state: string) => {
    console.log('[WorkspaceNavigation] setTabState called:', { tabId, state, activeTabId });
    
    // Always save to sessionStorage first
    const key = `workspace-${workspaceSlug}-tab-${tabId}`;
    sessionStorage.setItem(key, state);
    console.log('[WorkspaceNavigation] Saved to sessionStorage:', key, state);
    
    if (tabId === activeTabId) {
      // Active tab also updates URL hash
      console.log('[WorkspaceNavigation] Setting hash for active tab:', state);
      console.log('[WorkspaceNavigation] Hash BEFORE setting:', window.location.hash);
      window.location.hash = state;
      console.log('[WorkspaceNavigation] Hash AFTER setting:', window.location.hash);
      
      // Global restoration mechanism - use requestAnimationFrame for after render
      lastSetHash = state;
      if (hashRestoreTimeout) clearTimeout(hashRestoreTimeout);
      requestAnimationFrame(() => {
        setTimeout(restoreHashIfCleared, 0);
      });
    }
  }, [activeTabId, workspaceSlug]);

  const clearTabState = useCallback((tabId: string) => {
    if (tabId === activeTabId) {
      window.location.hash = '';
    } else {
      const key = `workspace-${workspaceSlug}-tab-${tabId}`;
      sessionStorage.removeItem(key);
    }
  }, [activeTabId, workspaceSlug]);

  return (
    <WorkspaceNavigationContext.Provider value={{ getTabState, setTabState, clearTabState }}>
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation() {
  console.log('[useWorkspaceNavigation] Hook called');
  const context = useContext(WorkspaceNavigationContext);
  if (!context) {
    console.error('[useWorkspaceNavigation] No context found!');
    throw new Error('useWorkspaceNavigation must be used within WorkspaceNavigationProvider');
  }
  console.log('[useWorkspaceNavigation] Context found, returning functions');
  return context;
}
