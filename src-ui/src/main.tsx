import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { _setApiBase } from '@stallion-ai/sdk';
import { NavigationProvider } from './contexts/NavigationContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { StreamingProvider } from './contexts/StreamingContext';
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

// Initialize plugins before rendering
pluginRegistry.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApiBaseProvider>
          <NavigationProvider>
            <KeyboardShortcutsProvider>
              <ToastProvider>
                <WorkspacesProvider>
                  <WorkflowsProvider>
                    <ConversationsProvider>
                      <ActiveChatsProvider>
                        <StreamingProvider>
                          <AnalyticsProvider>
                            <App />
                            <NotificationContainer />
                          </AnalyticsProvider>
                        </StreamingProvider>
                      </ActiveChatsProvider>
                    </ConversationsProvider>
                  </WorkflowsProvider>
                </WorkspacesProvider>
              </ToastProvider>
            </KeyboardShortcutsProvider>
          </NavigationProvider>
        </ApiBaseProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
});
