import type {
  ACPConnectionConfig,
  ACPStatusValue,
} from '@stallion-ai/contracts/acp';

interface ACPModeLike {
  id: string;
  name?: string;
  description?: string;
}

interface ACPConfigOption {
  category?: string;
  currentValue?: string;
  options?: Array<{ name?: string; value?: string }>;
}

export function hasACPConnectionAgent(
  modes: ACPModeLike[],
  prefix: string,
  slug: string,
): boolean {
  return modes.some((mode) => `${prefix}-${mode.id}` === slug);
}

export function getACPCurrentModelName(
  configOptions: ACPConfigOption[],
  detectedModel: string | null,
): string | null {
  const modelOption = configOptions.find(
    (option) => option.category === 'model',
  );
  if (!modelOption) {
    return detectedModel;
  }

  const current = modelOption.options?.find(
    (option) => option.value === modelOption.currentValue,
  );
  return current?.name || modelOption.currentValue || null;
}

export function getACPConnectionVirtualAgents({
  modes,
  prefix,
  config,
  configOptions,
  promptCapabilities,
  currentModelName,
}: {
  modes: ACPModeLike[];
  prefix: string;
  config: ACPConnectionConfig;
  configOptions: ACPConfigOption[];
  promptCapabilities: { image?: boolean };
  currentModelName: string | null;
}): any[] {
  const modelConfig = configOptions.find(
    (option) => option.category === 'model',
  );
  const modelOptions =
    modelConfig?.options?.map((option) => ({
      id: option.value,
      name: option.name || option.value,
      originalId: option.value,
    })) || null;

  return modes.map((mode) => ({
    slug: `${prefix}-${mode.id}`,
    name: mode.name || mode.id,
    description: mode.description || `${config.name} ${mode.id} mode`,
    model: currentModelName || config.name,
    icon: config.icon || '🔌',
    source: 'acp' as const,
    connectionName: config.name,
    planUrl: (config as any).planUrl,
    planLabel: (config as any).planLabel,
    updatedAt: new Date().toISOString(),
    supportsAttachments: promptCapabilities.image || false,
    modelOptions,
  }));
}

export function getACPConnectionStatusView({
  status,
  modes,
  sessionId,
  mcpServers,
  configOptions,
  currentModel,
  interactive,
}: {
  status:
    | ACPStatusValue
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'error';
  modes: ACPModeLike[];
  sessionId: string | null;
  mcpServers: string[];
  configOptions: ACPConfigOption[];
  currentModel: string | null;
  interactive?: { args: string[] };
}): {
  status:
    | ACPStatusValue
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'error';
  modes: string[];
  sessionId: string | null;
  mcpServers: string[];
  configOptions: ACPConfigOption[];
  currentModel: string | null;
  interactive?: { args: string[] };
} {
  return {
    status,
    modes: modes.map((mode) => mode.id),
    sessionId,
    mcpServers,
    configOptions,
    currentModel,
    interactive,
  };
}
