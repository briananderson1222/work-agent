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

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

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
                          <App />
                          <ToastContainer />
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
