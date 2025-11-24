import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ModelsProvider } from './contexts/ModelsContext';
import { ModelCapabilitiesProvider } from './contexts/ModelCapabilitiesContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { AgentsProvider } from './contexts/AgentsContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { StatsProvider } from './contexts/StatsContext';
import { AnalyticsProvider } from './contexts/AnalyticsContext';
import { ApiBaseProvider } from './contexts/ApiBaseContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationContainer } from './components/NotificationContainer';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { pluginRegistry } from './core/PluginRegistry';

// Debug: Track all hash changes globally with more detail
let lastHash = window.location.hash;
window.addEventListener('hashchange', () => {
  const newHash = window.location.hash;
  if (newHash === '' && lastHash !== '') {
  }
  lastHash = newHash;
});

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

// SDK Provider for plugins (simplified version)
const SDKProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

// Initialize plugins before rendering
pluginRegistry.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ApiBaseProvider>
        <ConfigProvider>
          <NavigationProvider>
            <KeyboardShortcutsProvider>
              <ToastProvider>
                <ModelsProvider>
                  <ModelCapabilitiesProvider apiBase={API_BASE}>
                    <WorkspacesProvider>
                    <AgentsProvider>
                      <WorkflowsProvider>
                        <ConversationsProvider>
                          <ActiveChatsProvider>
                            <StatsProvider>
                              <AnalyticsProvider>
                                <SDKProvider>
                                  <App />
                                  <NotificationContainer />
                                </SDKProvider>
                              </AnalyticsProvider>
                            </StatsProvider>
                          </ActiveChatsProvider>
                        </ConversationsProvider>
                      </WorkflowsProvider>
                    </AgentsProvider>
                  </WorkspacesProvider>
                  </ModelCapabilitiesProvider>
                </ModelsProvider>
              </ToastProvider>
            </KeyboardShortcutsProvider>
          </NavigationProvider>
        </ConfigProvider>
      </ApiBaseProvider>
    </React.StrictMode>
  );
});
