import { useModelCapabilitiesQuery } from '@work-agent/sdk';

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

export function useModelCapabilities(): ModelCapability[] {
  const { data = [] } = useModelCapabilitiesQuery();
  return data;
}

export function useModelSupportsAttachments(modelId: string | undefined): boolean {
  const capabilities = useModelCapabilities();
  
  if (!modelId) return false;
  
  const capability = capabilities.find(c => c.modelId === modelId);
  return capability?.supportsImages || capability?.supportsVideo || capability?.supportsAudio || false;
}
