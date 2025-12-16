import { createContext, useContext, ReactNode } from 'react';
import { useModelCapabilitiesQuery } from '@stallion-ai/sdk';

export type ModelCapability = {
  modelId: string;
  modelName: string;
  provider: string;
  inputModalities: string[];
  outputModalities: string[];
  supportsStreaming?: boolean;
  supportsImages?: boolean;
  supportsVideo?: boolean;
  supportsAudio?: boolean;
  lifecycleStatus?: string;
};

const ModelCapabilitiesContext = createContext<{} | undefined>(undefined);

export function ModelCapabilitiesProvider({ children }: { children: ReactNode }) {
  return (
    <ModelCapabilitiesContext.Provider value={{}}>
      {children}
    </ModelCapabilitiesContext.Provider>
  );
}

export function useModelCapabilities(): ModelCapability[] {
  const context = useContext(ModelCapabilitiesContext);
  if (!context) throw new Error('useModelCapabilities must be used within ModelCapabilitiesProvider');

  const { data = [] } = useModelCapabilitiesQuery();
  return data;
}

export function useModelSupportsAttachments(modelId: string | undefined): boolean {
  const capabilities = useModelCapabilities();
  
  if (!modelId) return false;
  
  const capability = capabilities.find(c => c.modelId === modelId);
  return capability?.supportsImages || false;
}
