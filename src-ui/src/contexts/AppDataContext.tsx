import { useInvalidateQuery, useModelsQuery } from '@work-agent/sdk';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { log } from '@/utils/logger';

interface Model {
  id: string;
  name: string;
  originalId: string;
}

const AppDataContext = createContext<{} | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  return (
    <AppDataContext.Provider value={{}}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context)
    throw new Error('useAppData must be used within AppDataProvider');

  const { data, isLoading, error } = useModelsQuery();
  const invalidate = useInvalidateQuery();

  const models = useMemo(() => {
    if (!data) return [];

    const processedModels = data
      .filter((m: any) => m.outputModalities.includes('TEXT'))
      .map((m: any) => {
        const needsPrefix =
          m.inferenceTypesSupported?.length === 1 &&
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
        if (suffix && suffix !== '0' && Number.isNaN(Number(suffix))) {
          m.name = `${m.name} (${suffix})`;
        }
      }
    });

    processedModels.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return processedModels;
  }, [data]);

  if (error) log.api('Failed to load models:', error);

  return {
    models,
    isLoadingModels: isLoading,
    refreshModels: () => invalidate(['models']),
  };
}
