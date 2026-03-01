import * as ReactQuery from '@tanstack/react-query';
import * as SDK from '@stallion-ai/sdk';
import debug from 'debug';
import DOMPurify from 'dompurify';
import React, * as ReactAll from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ReactDOM from 'react-dom/client';
import * as zod from 'zod';
import { UserDetailModal } from './components/UserDetailModal';

// Expose shared modules globally for dynamically loaded plugin bundles
(window as any).__work_agent_shared = {
  react: ReactAll,
  'react/jsx-runtime': jsxRuntime,
  'react/jsx-dev-runtime': jsxRuntime,
  '@stallion-ai/sdk': SDK,
  '@tanstack/react-query': ReactQuery,
  dompurify: Object.assign((dirty: string, cfg?: any) => DOMPurify.sanitize(dirty, cfg), {
    ...DOMPurify,
    default: DOMPurify,
    __esModule: true,
  }),
  debug: Object.assign(debug, { default: debug, __esModule: true }),
  zod: zod,
  '@stallion-ai/components': { UserDetailModal },
};

import App from './App';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { _setApiBase } from '@stallion-ai/sdk';
import { NotificationContainer } from './components/NotificationContainer';
import { OnboardingGate } from './components/OnboardingGate';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { ApiBaseProvider } from './contexts/ApiBaseContext';
import { AuthProvider } from './contexts/AuthContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { MessageContextContext } from './contexts/MessageContextContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { PreviewProvider } from './contexts/PreviewContext';
import { StreamingProvider } from './contexts/StreamingContext';
import { ToastProvider } from './contexts/ToastContext';
import { VoiceProviderContext } from './contexts/VoiceProviderContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { PermissionManager } from './core/PermissionManager';
import { pluginRegistry } from './core/PluginRegistry';
// Register default voice + context providers
import './providers/voice/index';
import './providers/context/index';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Prevent StrictMode double-fetch — if data is in cache, don't refetch on mount
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
pluginRegistry.setApiBase(API_BASE);
pluginRegistry.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApiBaseProvider>
          <AuthProvider>
            <OnboardingGate>
              <PermissionManager>
                <NavigationProvider>
                  <KeyboardShortcutsProvider>
                    <ToastProvider>
                      <WorkspacesProvider>
                        <WorkflowsProvider>
                          <ConversationsProvider>
                            <ActiveChatsProvider>
                              <VoiceProviderContext>
                                <MessageContextContext>
                                  <StreamingProvider>
                                    <AnalyticsProvider>
                                      <PreviewProvider>
                                        <App />
                                        <NotificationContainer />
                                      </PreviewProvider>
                                    </AnalyticsProvider>
                                  </StreamingProvider>
                                </MessageContextContext>
                              </VoiceProviderContext>
                            </ActiveChatsProvider>
                          </ConversationsProvider>
                        </WorkflowsProvider>
                      </WorkspacesProvider>
                    </ToastProvider>
                  </KeyboardShortcutsProvider>
                </NavigationProvider>
              </PermissionManager>
            </OnboardingGate>
          </AuthProvider>
        </ApiBaseProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
