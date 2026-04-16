import type { AppConfig } from '@stallion-ai/contracts/config';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import { createLLMProvider } from '../providers/connection-factories.js';
import { safeListModels } from '../providers/model-catalog.js';
import type { ILLMProvider } from '../providers/model-provider-types.js';
import { providerOps } from '../telemetry/metrics.js';

export class ProviderService {
  constructor(
    private storageAdapter: IStorageAdapter,
    private getAppConfig: () => Promise<AppConfig>,
  ) {}

  listProviderConnections(): ProviderConnectionConfig[] {
    return this.storageAdapter.listProviderConnections();
  }

  saveProviderConnection(config: ProviderConnectionConfig): void {
    this.storageAdapter.saveProviderConnection(config);
    providerOps.add(1, { op: 'register', type: config.type });
  }

  deleteProviderConnection(id: string): void {
    const existing = this.storageAdapter
      .listProviderConnections()
      .find((c) => c.id === id);
    this.storageAdapter.deleteProviderConnection(id);
    providerOps.add(1, { op: 'remove', type: existing?.type ?? 'unknown' });
  }

  async checkHealth(
    provider: ILLMProvider,
    _providerType: string,
  ): Promise<boolean> {
    const healthy = (await provider.healthCheck?.()) ?? false;
    providerOps.add(1, {
      op: 'health',
      status: healthy ? 'healthy' : 'unhealthy',
    });
    return healthy;
  }

  async resolveProvider(opts: {
    conversationProviderId?: string;
    conversationModel?: string;
    projectSlug?: string;
  }): Promise<{ providerId: string; model: string }> {
    if (opts.conversationProviderId && opts.conversationModel) {
      return {
        providerId: opts.conversationProviderId,
        model: opts.conversationModel,
      };
    }

    if (opts.projectSlug) {
      try {
        const project = await this.storageAdapter.getProject(opts.projectSlug);
        if (project.defaultProviderId && project.defaultModel) {
          const providerId = project.defaultProviderId;
          return {
            providerId,
            model: await this.resolveModelForProvider(
              providerId,
              project.defaultModel,
            ),
          };
        }
      } catch (e) {
        console.debug(
          'Failed to get project provider config:',
          opts.projectSlug,
          e,
        );
      }
    }

    const appConfig = await this.getAppConfig();
    const configuredProviders = this.storageAdapter
      .listProviderConnections()
      .filter(
        (connection) =>
          connection.enabled && connection.capabilities.includes('llm'),
      );
    const fallbackProviderId =
      appConfig.defaultLLMProvider ??
      configuredProviders[0]?.id ??
      'ollama-default';
    return {
      providerId: fallbackProviderId,
      model: await this.resolveModelForProvider(
        fallbackProviderId,
        appConfig.defaultModel,
      ),
    };
  }

  private async resolveModelForProvider(
    providerId: string,
    preferredModel?: string,
  ): Promise<string> {
    const providerConnection = this.storageAdapter
      .listProviderConnections()
      .find((connection) => connection.id === providerId);

    if (!providerConnection) {
      return preferredModel || '';
    }

    const configuredModel =
      typeof providerConnection.config?.defaultModel === 'string'
        ? providerConnection.config.defaultModel.trim()
        : '';
    if (configuredModel) {
      return configuredModel;
    }

    if (providerConnection.type === 'bedrock') {
      return preferredModel || '';
    }

    const provider = createLLMProvider(providerConnection);
    if (!provider) {
      return preferredModel || '';
    }

    const models = await safeListModels(provider);
    if (models.length === 0) {
      throw new Error(
        `No models available for provider '${providerConnection.name || providerId}'`,
      );
    }

    if (preferredModel && models.some((model) => model.id === preferredModel)) {
      return preferredModel;
    }

    return models[0]!.id;
  }
}
