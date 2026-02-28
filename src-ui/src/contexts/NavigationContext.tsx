import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore, useEffect } from 'react';

type NavigationState = {
  // Path-based routing
  pathname: string;
  
  // Query params
  selectedAgent: string | null;
  selectedWorkspace: string | null;
  activeConversation: string | null;
  activeChat: string | null;
  activeTab: string | null;
  
  // UI state from URL
  isDockOpen: boolean;
  isDockMaximized: boolean;
  fontSize: number | null;
};

class NavigationStore {
  private state: NavigationState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = this.parseUrl();
    
    // Listen for browser navigation
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.handlePopState);
    }
  }

  private handlePopState = () => {
    const newState = this.parseUrl();
    
    // Only notify if non-hash parts of the URL changed
    const oldUrl = new URL(window.location.href);
    oldUrl.pathname = this.state.pathname;
    oldUrl.search = new URLSearchParams({
      ...(this.state.selectedAgent && { agent: this.state.selectedAgent }),
      ...(this.state.selectedWorkspace && { workspace: this.state.selectedWorkspace }),
      ...(this.state.activeConversation && { conversation: this.state.activeConversation }),
      ...(this.state.activeChat && { chat: this.state.activeChat }),
      ...(this.state.activeTab && { tab: this.state.activeTab }),
      ...(this.state.isDockOpen && { dock: 'open' }),
      ...(this.state.isDockMaximized && { maximize: 'true' }),
      ...(this.state.fontSize && { fontSize: this.state.fontSize.toString() }),
    }).toString();
    
    const currentUrl = new URL(window.location.href);
    
    // Compare URLs without hash
    if (oldUrl.pathname !== currentUrl.pathname || oldUrl.search !== currentUrl.search) {
      this.state = newState;
      this.notify();
    } else {
      // Hash-only change - update state silently without notifying
      this.state = newState;
    }
  };

  private parseUrl(): NavigationState {
    if (typeof window === 'undefined') {
      return {
        pathname: '/',
        selectedAgent: null,
        selectedWorkspace: null,
        activeConversation: null,
        activeChat: null,
        activeTab: null,
        isDockOpen: false,
        isDockMaximized: false,
        fontSize: null,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    
    // Extract agent from path or query
    let selectedAgent = params.get('agent');
    const agentMatch = pathname.match(/^\/agents?\/([^/]+)/);
    if (agentMatch) selectedAgent = agentMatch[1];
    
    // Extract workspace and tab from path or query
    let selectedWorkspace = params.get('workspace');
    let activeTab = params.get('tab'); // Fallback to query param for backward compatibility
    
    const workspaceMatch = pathname.match(/^\/workspaces?\/([^/]+)(?:\/([^/]+))?/);
    if (workspaceMatch) {
      selectedWorkspace = workspaceMatch[1];
      if (workspaceMatch[2]) {
        activeTab = workspaceMatch[2]; // Tab from path takes precedence
      }
    }

    return {
      pathname,
      selectedAgent,
      selectedWorkspace,
      activeConversation: params.get('conversation'),
      activeChat: params.get('chat'),
      activeTab,
      isDockOpen: params.get('dock') === 'open',
      isDockMaximized: params.get('maximize') === 'true',
      fontSize: params.get('fontSize') ? parseInt(params.get('fontSize')!, 10) : null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.state;
  };

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  // Navigation methods
  navigate(pathname: string, params?: Record<string, string | null>) {
    const url = new URL(window.location.href);
    const currentHash = url.hash; // Preserve the hash
    url.pathname = pathname;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, value);
        }
      });
    }
    
    url.hash = currentHash; // Restore the hash
    window.history.pushState({}, '', url.toString());
    this.state = this.parseUrl();
    this.notify();
    // Dispatch popstate so App-level route listener picks up the change
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  updateParams(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    const currentHash = url.hash; // Preserve the hash
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    
    url.hash = currentHash; // Restore the hash
    window.history.replaceState({}, '', url.toString());
    this.state = this.parseUrl();
    this.notify();
  }

  // Convenience methods
  setAgent(slug: string | null) {
    if (slug) {
      this.navigate(`/agents/${slug}`);
    } else {
      this.navigate('/');
    }
  }

  setWorkspace(slug: string | null) {
    if (slug) {
      this.navigate(`/workspaces/${slug}`);
    } else {
      this.navigate('/');
    }
  }

  setWorkspaceTab(workspaceSlug: string, tabId: string | null) {
    if (tabId) {
      this.navigate(`/workspaces/${workspaceSlug}/${tabId}`);
    } else {
      this.navigate(`/workspaces/${workspaceSlug}`);
    }
  }

  setConversation(id: string | null) {
    this.updateParams({ conversation: id });
  }

  setActiveChat(id: string | null) {
    this.updateParams({ chat: id });
  }

  setActiveTab(tabId: string | null) {
    this.updateParams({ tab: tabId });
  }

  setDockState(open: boolean, maximized?: boolean) {
    const params: Record<string, string | null> = {
      dock: open ? 'open' : null,
    };
    if (maximized !== undefined) {
      params.maximize = maximized ? 'true' : null;
    }
    this.updateParams(params);
  }
}

export const navigationStore = new NavigationStore();

const NavigationContext = createContext<{
  navigate: (pathname: string, params?: Record<string, string | null>) => void;
  updateParams: (params: Record<string, string | null>) => void;
  setAgent: (slug: string | null) => void;
  setWorkspace: (slug: string | null) => void;
  setWorkspaceTab: (workspaceSlug: string, tabId: string | null) => void;
  setConversation: (id: string | null) => void;
  setActiveChat: (id: string | null) => void;
  setDockState: (open: boolean, maximized?: boolean) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useCallback((pathname: string, params?: Record<string, string | null>) => {
    navigationStore.navigate(pathname, params);
  }, []);

  const updateParams = useCallback((params: Record<string, string | null>) => {
    navigationStore.updateParams(params);
  }, []);

  const setAgent = useCallback((slug: string | null) => {
    navigationStore.setAgent(slug);
  }, []);

  const setWorkspace = useCallback((slug: string | null) => {
    navigationStore.setWorkspace(slug);
  }, []);

  const setWorkspaceTab = useCallback((workspaceSlug: string, tabId: string | null) => {
    navigationStore.setWorkspaceTab(workspaceSlug, tabId);
  }, []);

  const setConversation = useCallback((id: string | null) => {
    navigationStore.setConversation(id);
  }, []);

  const setActiveChat = useCallback((id: string | null) => {
    navigationStore.setActiveChat(id);
  }, []);

  const setDockState = useCallback((open: boolean, maximized?: boolean) => {
    navigationStore.setDockState(open, maximized);
  }, []);

  return (
    <NavigationContext.Provider value={{
      navigate,
      updateParams,
      setAgent,
      setWorkspace,
      setWorkspaceTab,
      setConversation,
      setActiveChat,
      setDockState,
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }

  const state = useSyncExternalStore(
    navigationStore.subscribe,
    navigationStore.getSnapshot
  );

  return {
    ...state,
    ...context,
  };
}
