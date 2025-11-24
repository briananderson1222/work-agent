import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { log } from '@/utils/logger';

interface Model {
  id: string;
  name: string;
  originalId: string;
}

interface AppDataContextType {
  models: Model[];
  isLoadingModels: boolean;
  refreshModels: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children, apiBase }: { children: ReactNode; apiBase: string }) {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  const loadModels = async () => {
    try {
      setIsLoadingModels(true);
      const response = await fetch(`${apiBase}/bedrock/models`);
      const data = await response.json();
      
      if (data.success) {
        const processedModels = data.data
          .filter((m: any) => m.outputModalities.includes('TEXT'))
          .map((m: any) => {
            const needsPrefix = m.inferenceTypesSupported?.length === 1 && 
                                m.inferenceTypesSupported[0] === 'INFERENCE_PROFILE';
            return {
              id: needsPrefix ? `us.${m.modelId}` : m.modelId,
              name: m.modelName || m.modelId,
              originalId: m.modelId,
            };
          });
        
        // Add suffix to duplicate names
        const nameCounts = new Map<string, number>();
        processedModels.forEach((m: any) => {
          nameCounts.set(m.name, (nameCounts.get(m.name) || 0) + 1);
        });
        
        processedModels.forEach((m: any) => {
          if (nameCounts.get(m.name)! > 1) {
            const parts = m.originalId.split(':');
            const suffix = parts[parts.length - 1];
            if (suffix && suffix !== '0' && isNaN(Number(suffix))) {
              m.name = `${m.name} (${suffix})`;
            }
          }
        });
        
        processedModels.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setModels(processedModels);
      }
    } catch (error) {
      log.api('Failed to load models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, [apiBase]);

  return (
    <AppDataContext.Provider value={{ models, isLoadingModels, refreshModels: loadModels }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
}
