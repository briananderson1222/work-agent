import { createContext, type ReactNode, useContext, useState } from 'react';

interface ApiBaseContextType {
  apiBase: string;
  setApiBase: (url: string) => void;
  resetToDefault: () => void;
  isCustom: boolean;
}

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE || 'http://localhost:3141';
const STORAGE_KEY = 'project-stallion-api-base';

const ApiBaseContext = createContext<ApiBaseContextType | undefined>(undefined);

export function ApiBaseProvider({ children }: { children: ReactNode }) {
  const [apiBase, setApiBaseState] = useState<string>(() => {
    // Load from localStorage on initialization
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored || DEFAULT_API_BASE;
  });

  const setApiBase = (url: string) => {
    const normalizedUrl = url.trim() || DEFAULT_API_BASE;
    setApiBaseState(normalizedUrl);

    if (normalizedUrl === DEFAULT_API_BASE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, normalizedUrl);
    }
  };

  const resetToDefault = () => {
    setApiBase(DEFAULT_API_BASE);
  };

  const isCustom = apiBase !== DEFAULT_API_BASE;

  return (
    <ApiBaseContext.Provider
      value={{ apiBase, setApiBase, resetToDefault, isCustom }}
    >
      {children}
    </ApiBaseContext.Provider>
  );
}

export function useApiBase() {
  const context = useContext(ApiBaseContext);
  if (context === undefined) {
    throw new Error('useApiBase must be used within an ApiBaseProvider');
  }
  return context;
}
