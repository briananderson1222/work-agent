import * as SDK from '@stallion-ai/sdk';
import * as ReactQuery from '@tanstack/react-query';
import debug from 'debug';
import DOMPurify from 'dompurify';
import React, * as ReactAll from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ReactDOM from 'react-dom/client';
import * as zod from 'zod';
import { UserDetailModal } from './components/UserDetailModal';

// Expose shared modules globally for dynamically loaded plugin bundles
(window as any).__stallion_ai_shared = {
  react: ReactAll,
  'react/jsx-runtime': jsxRuntime,
  'react/jsx-dev-runtime': jsxRuntime,
  '@stallion-ai/sdk': SDK,
  '@tanstack/react-query': ReactQuery,
  dompurify: Object.assign(
    (dirty: string, cfg?: any) => DOMPurify.sanitize(dirty, cfg),
    {
      ...DOMPurify,
      default: DOMPurify,
      __esModule: true,
    },
  ),
  debug: Object.assign(debug, { default: debug, __esModule: true }),
  zod: zod,
  '@stallion-ai/components': { UserDetailModal },
};

import App from './App';
import './index.css';
import { _setApiBase } from '@stallion-ai/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationContainer } from './components/NotificationContainer';
import { OnboardingGate } from './components/OnboardingGate';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { ApiBaseProvider } from './contexts/ApiBaseContext';
import { AuthProvider } from './contexts/AuthContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { LayoutsProvider } from './contexts/LayoutsContext';
import { MessageContextContext } from './contexts/MessageContextContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { PreviewProvider } from './contexts/PreviewContext';
import { StreamingProvider } from './contexts/StreamingContext';
import { SyntaxHighlighterProvider } from './contexts/SyntaxHighlighterContext';
import { ToastProvider } from './contexts/ToastContext';
import { VoiceProviderContext } from './contexts/VoiceProviderContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
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

const API_BASE = (() => {
  // Prefer injected base from CLI --base flag
  const injected = (window as Window & { __API_BASE__?: string }).__API_BASE__;
  if (injected) return injected;
  // Prefer the active connection URL from the connect system (stored in localStorage)
  try {
    const raw = localStorage.getItem('stallion-connect-connections');
    const activeId = localStorage.getItem(
      'stallion-connect-connections-active',
    );
    if (raw) {
      const connections = JSON.parse(raw);
      const active = activeId
        ? (connections.find((c: any) => c.id === activeId) ?? connections[0])
        : connections[0];
      if (active?.url) return active.url;
    }
  } catch {}
  return import.meta.env.VITE_API_BASE || window.location.origin;
})();

// Expose for non-React code paths (ActiveChatsContext, ConfigContext) that check window.__API_BASE__
(window as any).__API_BASE__ = API_BASE;

// Set API base for SDK before rendering
_setApiBase(API_BASE);

// Restore accent color from localStorage
const _accent = localStorage.getItem('stallion-accent-color');
if (_accent)
  document.documentElement.style.setProperty('--accent-primary', _accent);

// Initialize plugins before rendering
pluginRegistry.setApiBase(API_BASE);
pluginRegistry.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApiBaseProvider>
          <SyntaxHighlighterProvider>
            <AuthProvider>
              <OnboardingGate>
                <PermissionManager>
                  <NavigationProvider>
                    <KeyboardShortcutsProvider>
                      <ToastProvider>
                        <LayoutsProvider>
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
                        </LayoutsProvider>
                      </ToastProvider>
                    </KeyboardShortcutsProvider>
                  </NavigationProvider>
                </PermissionManager>
              </OnboardingGate>
            </AuthProvider>
          </SyntaxHighlighterProvider>
        </ApiBaseProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
