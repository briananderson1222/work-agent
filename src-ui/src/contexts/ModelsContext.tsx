import { createContext, useContext, useCallback, ReactNode, useSyncExternalStore } from 'react';
import { log } from '@/utils/logger';

interface Model {
  id: string;
  name: string;
  originalId: string;
  isInferenceProfile?: boolean;
  profileType?: string;
}

class ModelsStore {
  private models: Model[] = [];
  private listeners = new Set<() => void>();
  private fetching = new Map<string, Promise<void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => {
    return this.models;
  };

  private notify = () => {
    this.listeners.forEach(listener => listener());
  };

  async fetch(apiBase: string) {
    const existing = this.fetching.get(apiBase);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/bedrock/models`);
        const data = await response.json();
        
        if (data.success) {
          const processedModels = data.data
            .filter((m: any) => m.outputModalities.includes('TEXT'))
            .map((m: any) => ({
              id: m.modelId,
              name: m.modelName || m.modelId,
              originalId: m.modelId,
              isInferenceProfile: m.isInferenceProfile || false,
              profileType: m.profileType
            }));
          
          // Add suffix to duplicate names
          const nameCounts = new Map<string, number>();
          processedModels.forEach((m: any) => {
            nameCounts.set(m.name, (nameCounts.get(m.name) || 0) + 1);
          });
          
          processedModels.forEach((m: any) => {
            if (nameCounts.get(m.name)! > 1) {
              if (m.isInferenceProfile) {
                m.name = `${m.name} (Cross-Region)`;
              } else {
                const parts = m.originalId.split(':');
                const suffix = parts[parts.length - 1];
                if (suffix && suffix !== '0' && isNaN(Number(suffix))) {
                  m.name = `${m.name} (${suffix})`;
                }
              }
            }
          });
          
          this.models = processedModels;
          this.notify();
        }
      } catch (error) {
        log.api('Failed to load models:', error);
      } finally {
        this.fetching.delete(apiBase);
      }
    })();

    this.fetching.set(apiBase, promise);
    return promise;
  }
}

export const modelsStore = new ModelsStore();

const ModelsContext = createContext<{
  fetchModels: (apiBase: string) => Promise<void>;
} | undefined>(undefined);

export function ModelsProvider({ children }: { children: ReactNode }) {
  const fetchModels = useCallback((apiBase: string) => {
    return modelsStore.fetch(apiBase);
  }, []);

  return (
    <ModelsContext.Provider value={{ fetchModels }}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels(apiBase: string) {
  const context = useContext(ModelsContext);
  if (!context) {
    throw new Error('useModels must be used within ModelsProvider');
  }

  const models = useSyncExternalStore(
    modelsStore.subscribe,
    modelsStore.getSnapshot
  );

  // Auto-fetch on mount
  if (models.length === 0) {
    context.fetchModels(apiBase);
  }

  return models;
}
