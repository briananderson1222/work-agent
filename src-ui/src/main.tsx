import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ModelsProvider } from './contexts/ModelsContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { AgentsProvider } from './contexts/AgentsContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { ActiveChatsProvider } from './contexts/ActiveChatsContext';
import { StatsProvider } from './contexts/StatsContext';
import { ToastProvider, ToastContainer } from './contexts/ToastContext';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';

// Debug: Track all hash changes globally with more detail
let lastHash = window.location.hash;
window.addEventListener('hashchange', () => {
  const newHash = window.location.hash;
  console.log('[GLOBAL] Hash changed from:', lastHash, 'to:', newHash);
  if (newHash === '' && lastHash !== '') {
    console.log('[GLOBAL] ⚠️  HASH WAS CLEARED!');
    console.trace('[GLOBAL] Hash clearing stack trace');
  }
  lastHash = newHash;
});

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

// SDK Provider for plugins (simplified version)
const SDKProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <NavigationProvider>
        <KeyboardShortcutsProvider>
          <ToastProvider>
            <ModelsProvider>
              <WorkspacesProvider>
                <AgentsProvider>
                  <WorkflowsProvider>
                    <ConversationsProvider>
                      <ActiveChatsProvider>
                        <StatsProvider>
                          <SDKProvider>
                            <App />
                            <ToastContainer />
                          </SDKProvider>
                        </StatsProvider>
                      </ActiveChatsProvider>
                    </ConversationsProvider>
                  </WorkflowsProvider>
                </AgentsProvider>
              </WorkspacesProvider>
            </ModelsProvider>
          </ToastProvider>
        </KeyboardShortcutsProvider>
      </NavigationProvider>
    </ConfigProvider>
  </React.StrictMode>
);
