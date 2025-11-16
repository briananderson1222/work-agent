import { createContext, ReactNode } from 'react';

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
  children: ReactNode;
}

export function WorkspaceProvider({ sdk, children }: WorkspaceProviderProps) {
  return (
    <SDKProvider value={sdk}>
      {children}
    </SDKProvider>
  );
}
