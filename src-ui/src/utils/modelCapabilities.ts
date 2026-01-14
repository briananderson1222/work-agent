// Model capability detection based on VoltAgent documentation
// https://voltagent.dev/docs/agents/multi-modal/

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsFiles: boolean;
  supportedImageFormats?: string[];
  supportedFileFormats?: string[];
}

const VISION_MODELS = [
  // OpenAI
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-vision',
  // Anthropic
  'claude-3-7-sonnet',
  'claude-3-5-sonnet',
  'claude-3-opus',
  'claude-3-haiku',
  'claude-3-sonnet',
  // Google
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro-vision',
];

export function getModelCapabilities(modelId?: string): ModelCapabilities {
  if (!modelId) {
    return { supportsVision: false, supportsFiles: false };
  }

  const normalizedId = modelId.toLowerCase();
  const supportsVision = VISION_MODELS.some(model => 
    normalizedId.includes(model.toLowerCase())
  );

  return {
    supportsVision,
    supportsFiles: supportsVision, // Most vision models also support files
    supportedImageFormats: supportsVision ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] : [],
    supportedFileFormats: supportsVision ? ['application/pdf', 'text/plain', 'text/csv'] : [],
  };
}

export function canAcceptImages(modelId?: string): boolean {
  return getModelCapabilities(modelId).supportsVision;
}

export function canAcceptFiles(modelId?: string): boolean {
  return getModelCapabilities(modelId).supportsFiles;
}
