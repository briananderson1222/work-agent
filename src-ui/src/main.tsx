import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { _setApiBase } from '@stallion-ai/sdk';
import { ModelsProvider } from './contexts/ModelsContext';
import { ModelCapabilitiesProvider } from './contexts/ModelCapabilitiesContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { AgentsProvider } from './contexts/AgentsContext';
import { AgentToolsProvider } from './contexts/AgentToolsContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { StreamingProvider } from './contexts/StreamingContext';
import { StatsProvider } from './contexts/StatsContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { ApiBaseProvider } from './contexts/ApiBaseContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationContainer } from './components/NotificationContainer';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { pluginRegistry } from './core/PluginRegistry';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Debug: Track all hash changes globally with more detail
let lastHash = window.location.hash;
window.addEventListener('hashchange', () => {
  const newHash = window.location.hash;
  if (newHash === '' && lastHash !== '') {
  }
  lastHash = newHash;
});

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

// Set API base for SDK before rendering
_setApiBase(API_BASE);

// SDK Provider for plugins (simplified version)
const SDKProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

// Initialize plugins before rendering
pluginRegistry.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApiBaseProvider>
          <ConfigProvider>
            <NavigationProvider>
              <KeyboardShortcutsProvider>
                <ToastProvider>
                  <ModelsProvider>
                    <ModelCapabilitiesProvider apiBase={API_BASE}>
                      <WorkspacesProvider>
                      <AgentsProvider>
                        <AgentToolsProvider>
                          <WorkflowsProvider>
                            <ConversationsProvider>
                              <ActiveChatsProvider>
                                <StreamingProvider>
                                  <StatsProvider>
                                    <AnalyticsProvider>
                                      <SDKProvider>
                                        <App />
                                        <NotificationContainer />
                                      </SDKProvider>
                                    </AnalyticsProvider>
                                  </StatsProvider>
                                </StreamingProvider>
                              </ActiveChatsProvider>
                            </ConversationsProvider>
                        </WorkflowsProvider>
                      </AgentToolsProvider>
                    </AgentsProvider>
                  </WorkspacesProvider>
                  </ModelCapabilitiesProvider>
                </ModelsProvider>
              </ToastProvider>
            </KeyboardShortcutsProvider>
          </NavigationProvider>
        </ConfigProvider>
      </ApiBaseProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
});
