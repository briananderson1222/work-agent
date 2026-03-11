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

export function useModelCapabilities(): ModelCapability[] {
  const { data = [] } = useModelCapabilitiesQuery();
  return data;
}

export function useModelSupportsAttachments(
  modelId: string | undefined,
): boolean {
  const capabilities = useModelCapabilities();

  if (!modelId) return false;

  // Model IDs may have cross-region inference prefixes (e.g. "us.anthropic.claude-...")
  // that don't appear in the capabilities list. Match by suffix.
  const capability = capabilities.find(
    (c) => c.modelId === modelId || modelId.endsWith(c.modelId) || c.modelId.endsWith(modelId),
  );
  return (
    capability?.supportsImages ||
    capability?.supportsVideo ||
    capability?.supportsAudio ||
    false
  );
}
