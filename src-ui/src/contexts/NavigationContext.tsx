import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';
import type { DockMode } from '../types';
import { navigationStore } from './navigation-store';

export { navigationStore } from './navigation-store';

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
