import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import type { DockMode } from '../types';

type NavigationState = {
  // Path-based routing
  pathname: string;

  // Query params
  selectedAgent: string | null;
  selectedLayout: string | null;
  selectedProject: string | null;
  selectedProjectLayout: string | null;
  activeConversation: string | null;
  activeChat: string | null;
  activeTab: string | null;

  // UI state from URL
  isDockOpen: boolean;
  isDockMaximized: boolean;
  dockMode: DockMode;
  fontSize: number | null;
};

const LAST_PROJECT_KEY = 'lastProject';
const LAST_PROJECT_LAYOUT_KEY = 'lastProjectLayout';

class NavigationStore {
  private state: NavigationState;
  private listeners = new Set<() => void>();
  private isNavigating = false;
  /** Persisted project+layout — for '/' route resolution */
  lastProject: string | null;
  lastProjectLayout: string | null;
  /** In-memory dock mode set by layout preferences — not written to URL */
  dockModeOverride: DockMode | null = null;

  constructor() {
    this.lastProject =
      typeof window !== 'undefined'
        ? localStorage.getItem(LAST_PROJECT_KEY)
        : null;
    this.lastProjectLayout =
      typeof window !== 'undefined'
        ? localStorage.getItem(LAST_PROJECT_LAYOUT_KEY)
        : null;
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
      ...(this.state.selectedLayout && {
        layout: this.state.selectedLayout,
      }),
      ...(this.state.activeConversation && {
        conversation: this.state.activeConversation,
      }),
      ...(this.state.activeChat && { chat: this.state.activeChat }),
      ...(this.state.activeTab && { tab: this.state.activeTab }),
      ...(this.state.isDockOpen && { dock: 'open' }),
      ...(this.state.isDockMaximized && { maximize: 'true' }),
      ...(this.state.fontSize && { fontSize: this.state.fontSize.toString() }),
    }).toString();

    const currentUrl = new URL(window.location.href);

    // Compare URLs without hash
    if (
      oldUrl.pathname !== currentUrl.pathname ||
      oldUrl.search !== currentUrl.search
    ) {
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
        selectedLayout: null,
        selectedProject: null,
        selectedProjectLayout: null,
        activeConversation: null,
        activeChat: null,
        activeTab: null,
        isDockOpen: false,
        isDockMaximized: false,
        dockMode: 'bottom' as DockMode,
        fontSize: null,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    // Extract agent from path or query
    let selectedAgent = params.get('agent');
    const agentMatch = pathname.match(/^\/agents?\/([^/]+)/);
    if (agentMatch) selectedAgent = agentMatch[1];

    // Extract current layout slug and tab from path/query
    let selectedLayout = params.get('layout');
    let activeTab = params.get('tab'); // Fallback to query param for backward compatibility

    // Extract project and layout from path
    let selectedProject: string | null = null;
    let selectedProjectLayout: string | null = null;
    const projectMatch = pathname.match(
      /^\/projects\/([^/]+)(?:\/layouts\/([^/]+)(?:\/([^/]+))?)?/,
    );
    if (projectMatch) {
      selectedProject = projectMatch[1];
      if (projectMatch[2]) {
        selectedProjectLayout = projectMatch[2];
        selectedLayout = projectMatch[2];
      }
      if (projectMatch[3]) activeTab = projectMatch[3];
    }

    return {
      pathname,
      selectedAgent,
      selectedLayout,
      selectedProject,
      selectedProjectLayout,
      activeConversation: params.get('conversation'),
      activeChat: params.get('chat'),
      activeTab,
      isDockOpen: params.get('dock') === 'open',
      isDockMaximized: params.get('maximize') === 'true',
      dockMode:
        (params.get('dockMode') as DockMode) ||
        this.dockModeOverride ||
        'bottom',
      fontSize: params.get('fontSize')
        ? parseInt(params.get('fontSize')!, 10)
        : null,
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
    this.listeners.forEach((listener) => listener());
  };

  // Navigation methods
  navigate(pathname: string, params?: Record<string, string | null>) {
    if (this.isNavigating) return;
    this.isNavigating = true;

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
    this.isNavigating = false;
  }

  updateParams(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    const prev = url.search;
    const currentHash = url.hash; // Preserve the hash

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });

    // Bail out if nothing changed to avoid infinite re-render loops
    if (url.search === prev) return;

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

  setLayoutTab(layoutSlug: string, tabId: string | null) {
    const { selectedProject } = this.state;
    if (!selectedProject) {
      this.navigate('/');
      return;
    }
    const base = `/projects/${selectedProject}/layouts/${layoutSlug}`;
    this.navigate(tabId ? `${base}/${tabId}` : base);
  }

  setProject(slug: string) {
    this.navigate(`/projects/${slug}`);
  }

  setLayout(projectSlug: string, layoutSlug: string) {
    this.lastProject = projectSlug;
    this.lastProjectLayout = layoutSlug;
    try {
      localStorage.setItem(LAST_PROJECT_KEY, projectSlug);
      localStorage.setItem(LAST_PROJECT_LAYOUT_KEY, layoutSlug);
    } catch {}
    this.navigate(`/projects/${projectSlug}/layouts/${layoutSlug}`);
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

  setDockMode(mode: DockMode) {
    this.dockModeOverride = null;
    this.updateParams({ dockMode: mode === 'bottom' ? null : mode });
  }

  /** Update dock mode in-memory only — no URL param written. Used for layout preferences. */
  setDockModeQuiet(mode: DockMode) {
    this.dockModeOverride = mode;
    this.state = { ...this.state, dockMode: mode };
    this.notify();
  }
}

export const navigationStore = new NavigationStore();

const NavigationContext = createContext<{
  navigate: (pathname: string, params?: Record<string, string | null>) => void;
  updateParams: (params: Record<string, string | null>) => void;
  setAgent: (slug: string | null) => void;
  setLayoutTab: (layoutSlug: string, tabId: string | null) => void;
  setProject: (slug: string) => void;
  setLayout: (projectSlug: string, layoutSlug: string) => void;
  setConversation: (id: string | null) => void;
  setActiveChat: (id: string | null) => void;
  setDockState: (open: boolean, maximized?: boolean) => void;
  setDockMode: (mode: DockMode) => void;
  setDockModeQuiet: (mode: DockMode) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useCallback(
    (pathname: string, params?: Record<string, string | null>) => {
      navigationStore.navigate(pathname, params);
    },
    [],
  );

  const updateParams = useCallback((params: Record<string, string | null>) => {
    navigationStore.updateParams(params);
  }, []);

  const setAgent = useCallback((slug: string | null) => {
    navigationStore.setAgent(slug);
  }, []);

  const setLayoutTab = useCallback(
    (layoutSlug: string, tabId: string | null) => {
      navigationStore.setLayoutTab(layoutSlug, tabId);
    },
    [],
  );

  const setProject = useCallback((slug: string) => {
    navigationStore.setProject(slug);
  }, []);

  const setLayout = useCallback((projectSlug: string, layoutSlug: string) => {
    navigationStore.setLayout(projectSlug, layoutSlug);
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

  const setDockMode = useCallback((mode: DockMode) => {
    navigationStore.setDockMode(mode);
  }, []);

  const setDockModeQuiet = useCallback((mode: DockMode) => {
    navigationStore.setDockModeQuiet(mode);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        navigate,
        updateParams,
        setAgent,
        setLayoutTab,
        setProject,
        setLayout,
        setConversation,
        setActiveChat,
        setDockState,
        setDockMode,
        setDockModeQuiet,
      }}
    >
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
    navigationStore.getSnapshot,
  );

  return {
    ...state,
    lastProject: navigationStore.lastProject,
    lastProjectLayout: navigationStore.lastProjectLayout,
    ...context,
  };
}
