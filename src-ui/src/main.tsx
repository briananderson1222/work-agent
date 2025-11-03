import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AppDataProvider } from './contexts/AppDataContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3141';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppDataProvider apiBase={API_BASE}>
      <App />
    </AppDataProvider>
  </React.StrictMode>
);
