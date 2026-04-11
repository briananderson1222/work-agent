import type { DockMode } from '../types';

export type NavigationState = {
  pathname: string;
  selectedAgent: string | null;
  selectedLayout: string | null;
  selectedProject: string | null;
  selectedProjectLayout: string | null;
  activeConversation: string | null;
  activeChat: string | null;
  activeTab: string | null;
  isDockOpen: boolean;
  isDockMaximized: boolean;
  dockMode: DockMode;
  fontSize: number | null;
};

const LAST_PROJECT_KEY = 'lastProject';
const LAST_PROJECT_LAYOUT_KEY = 'lastProjectLayout';

function getDefaultNavigationState(): NavigationState {
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
    dockMode: 'bottom',
    fontSize: null,
  };
}

export class NavigationStore {
  private state: NavigationState;
  private listeners = new Set<() => void>();
  private isNavigating = false;
  lastProject: string | null;
  lastProjectLayout: string | null;
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

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.handlePopState);
    }
  }

  private handlePopState = () => {
    const newState = this.parseUrl();

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
    if (
      oldUrl.pathname !== currentUrl.pathname ||
      oldUrl.search !== currentUrl.search
    ) {
      this.state = newState;
      this.notify();
      return;
    }

    this.state = newState;
  };

  private parseUrl(): NavigationState {
    if (typeof window === 'undefined') {
      return getDefaultNavigationState();
    }

    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    let selectedAgent = params.get('agent');
    const agentMatch = pathname.match(/^\/agents?\/([^/]+)/);
    if (agentMatch) selectedAgent = agentMatch[1];

    let selectedLayout = params.get('layout');
    let activeTab = params.get('tab');

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

  getSnapshot = () => this.state;

  private notify = () => {
    this.listeners.forEach((listener) => listener());
  };

  navigate(pathname: string, params?: Record<string, string | null>) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    const url = new URL(window.location.href);
    const currentHash = url.hash;
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

    url.hash = currentHash;
    window.history.pushState({}, '', url.toString());
    this.state = this.parseUrl();
    this.notify();
    window.dispatchEvent(new PopStateEvent('popstate'));
    this.isNavigating = false;
  }

  updateParams(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    const prev = url.search;
    const currentHash = url.hash;

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });

    if (url.search === prev) return;

    url.hash = currentHash;
    window.history.replaceState({}, '', url.toString());
    this.state = this.parseUrl();
    this.notify();
  }

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

  setDockModeQuiet(mode: DockMode) {
    this.dockModeOverride = mode;
    this.state = { ...this.state, dockMode: mode };
    this.notify();
  }
}

export const navigationStore = new NavigationStore();
