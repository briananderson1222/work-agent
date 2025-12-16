import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useModelsQuery } from '@stallion-ai/sdk';
import { log } from '@/utils/logger';

interface Model {
  id: string;
  name: string;
  originalId: string;
  isInferenceProfile?: boolean;
  profileType?: string;
}

const ModelsContext = createContext<{} | undefined>(undefined);

export function ModelsProvider({ children }: { children: ReactNode }) {
  return (
    <ModelsContext.Provider value={{}}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels(): Model[] {
  const context = useContext(ModelsContext);
  if (!context) throw new Error('useModels must be used within ModelsProvider');

  const { data, error } = useModelsQuery();

  const models = useMemo(() => {
    if (!data) return [];
    
    const processedModels = data
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
        const parts = m.originalId.split(':');
        const suffix = parts[parts.length - 1];
        if (suffix && suffix !== '0' && isNaN(Number(suffix))) {
          m.name = `${m.name} (${suffix})`;
        }
      }
    });
    
    processedModels.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return processedModels;
  }, [data]);

  if (error) log.api('Failed to load models:', error);

  return models;
}
