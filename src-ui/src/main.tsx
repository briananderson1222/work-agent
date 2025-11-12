import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AppDataProvider } from './contexts/AppDataContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { WorkspacesProvider } from './contexts/WorkspacesContext';
import { AgentsProvider } from './contexts/AgentsContext';
import { WorkflowsProvider } from './contexts/WorkflowsContext';
import { ConversationsProvider } from './contexts/ConversationsContext';
import { StatsProvider } from './contexts/StatsContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppDataProvider apiBase={API_BASE}>
      <ConfigProvider>
        <WorkspacesProvider>
          <AgentsProvider>
            <WorkflowsProvider>
              <ConversationsProvider>
                <StatsProvider>
                  <App />
                </StatsProvider>
              </ConversationsProvider>
            </WorkflowsProvider>
          </AgentsProvider>
        </WorkspacesProvider>
      </ConfigProvider>
    </AppDataProvider>
  </React.StrictMode>
);
