import { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';

type ModelCapability = {
  modelId: string;
  modelName: string;
  provider: string;
  inputModalities: string[];
  outputModalities: string[];
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
};

class ModelCapabilitiesStore {
  private capabilities: ModelCapability[] = [];
  private listeners = new Set<() => void>();
  private loading = false;
  private error: string | null = null;
  private cachedSnapshot = { capabilities: this.capabilities, loading: this.loading, error: this.error };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.cachedSnapshot;
  };

  private notify = () => {
    this.cachedSnapshot = { capabilities: [...this.capabilities], loading: this.loading, error: this.error };
    this.listeners.forEach(listener => listener());
  };

  async fetch(apiBase: string) {
    if (this.loading || this.capabilities.length > 0) return;
    
    this.loading = true;
    this.notify();

    try {
      const response = await fetch(`${apiBase}/api/models/capabilities`);
      const data = await response.json();
      
      if (data.data) {
        this.capabilities = data.data;
        this.error = null;
      } else {
        this.error = 'Failed to load model capabilities';
      }
    } catch (error: any) {
      this.error = error.message;
      console.error('Failed to fetch model capabilities:', error);
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  getCapabilities(modelId: string): ModelCapability | null {
    return this.capabilities.find(c => c.modelId === modelId) || null;
  }
}

export const modelCapabilitiesStore = new ModelCapabilitiesStore();

const ModelCapabilitiesContext = createContext<typeof modelCapabilitiesStore | undefined>(undefined);

export function ModelCapabilitiesProvider({ children, apiBase }: { children: ReactNode; apiBase: string }) {
  // Fetch on mount
  if (apiBase) {
    modelCapabilitiesStore.fetch(apiBase);
  }

  return (
    <ModelCapabilitiesContext.Provider value={modelCapabilitiesStore}>
      {children}
    </ModelCapabilitiesContext.Provider>
  );
}

export function useModelCapabilities() {
  const store = useContext(ModelCapabilitiesContext);
  if (!store) {
    throw new Error('useModelCapabilities must be used within ModelCapabilitiesProvider');
  }

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
}

export function useModelSupportsAttachments(modelId: string | undefined): boolean {
  const { capabilities } = useModelCapabilities();
  if (!modelId) return false;
  
  const capability = capabilities.find(c => c.modelId === modelId);
  return capability?.supportsImages || capability?.supportsVideo || capability?.supportsAudio || false;
}
