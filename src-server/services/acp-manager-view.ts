import {
  type ACPConnectionConfig,
  ACPStatus,
  type ACPStatusValue,
} from '@stallion-ai/contracts/acp';

interface ACPModeLike {
  id: string;
  name?: string;
  description?: string;
}

interface ACPProbeLike {
  getModes(): ACPModeLike[];
  getConfigOptions(): Array<{
    category?: string;
    currentValue?: string;
    options?: Array<{ name?: string; value?: string }>;
  }>;
  getCapabilities(): { image?: boolean } | undefined;
  isAvailable(): boolean;
  lastProbeAt: number;
}

export function getACPManagerVirtualAgents(
  probes: Map<string, ACPProbeLike>,
  configs: Map<string, ACPConnectionConfig>,
): any[] {
  return Array.from(probes.entries()).flatMap(([id, probe]) => {
    const config = configs.get(id);
    const configOptions = probe.getConfigOptions();
    const modelConfig = configOptions.find(
      (option) => option.category === 'model',
    );
    const modelOptions =
      modelConfig?.options?.map((option) => ({
        id: option.value ?? option,
        name: option.name ?? option,
        originalId: option.value ?? option,
      })) || null;
    const capabilities = probe.getCapabilities();

    return probe.getModes().map((mode) => ({
      slug: `${id}-${mode.id}`,
      name: mode.name || mode.id,
      description: mode.description || `${config?.name || id} ${mode.id} mode`,
      model: modelConfig?.currentValue || config?.name || id,
      icon: config?.icon || '🔌',
      source: 'acp' as const,
      connectionId: id,
      connectionName: config?.name || id,
      connectionIcon: config?.icon,
      updatedAt: new Date().toISOString(),
      supportsAttachments: capabilities?.image || false,
      modelOptions,
    }));
  });
}

export function getACPManagerStatus(
  probes: Map<string, ACPProbeLike>,
  configs: Map<string, ACPConnectionConfig>,
  activeSessions: number,
): {
  connections: Array<{
    id: string;
    name: string;
    icon?: string;
    status: ACPStatusValue;
    modes: string[];
    sessionId: null;
    mcpServers: string[];
    configOptions: any[];
    currentModel: string | null;
  }>;
  activeSessions: number;
} {
  return {
    connections: Array.from(probes.entries()).map(([id, probe]) => {
      const config = configs.get(id);
      const configOptions = probe.getConfigOptions();
      const modelConfig = configOptions.find(
        (option) => option.category === 'model',
      );

      return {
        id,
        name: config?.name || id,
        icon: config?.icon,
        status: probe.isAvailable()
          ? ACPStatus.AVAILABLE
          : probe.lastProbeAt > 0
            ? ACPStatus.UNAVAILABLE
            : ACPStatus.PROBING,
        modes: probe.getModes().map((mode) => mode.id),
        sessionId: null,
        mcpServers: [],
        configOptions,
        currentModel: modelConfig?.currentValue || null,
      };
    }),
    activeSessions,
  };
}

export function findACPConfigIdForSlug(
  probes: Map<string, ACPProbeLike>,
  slug: string,
): string | undefined {
  for (const [id, probe] of probes) {
    if (probe.getModes().some((mode) => `${id}-${mode.id}` === slug)) {
      return id;
    }
  }

  return undefined;
}
