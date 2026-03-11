import type { AppConfig, ProviderConnectionConfig } from '@stallion-ai/shared';
import type { IStorageAdapter } from '../domain/storage-adapter.js';
import type { ILLMProvider } from '../providers/types.js';
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
    const existing = this.storageAdapter.listProviderConnections().find(c => c.id === id);
    this.storageAdapter.deleteProviderConnection(id);
    providerOps.add(1, { op: 'remove', type: existing?.type ?? 'unknown' });
  }

  async checkHealth(provider: ILLMProvider, providerType: string): Promise<boolean> {
    const healthy = await provider.healthCheck?.() ?? false;
    providerOps.add(1, { op: 'health', status: healthy ? 'healthy' : 'unhealthy' });
    return healthy;
  }

  async resolveProvider(opts: {
    conversationProviderId?: string;
    conversationModel?: string;
    projectSlug?: string;
  }): Promise<{ providerId: string; model: string }> {
    if (opts.conversationProviderId && opts.conversationModel) {
      return { providerId: opts.conversationProviderId, model: opts.conversationModel };
    }

    if (opts.projectSlug) {
      try {
        const project = await this.storageAdapter.getProject(opts.projectSlug);
        if (project.defaultProviderId && project.defaultModel) {
          return { providerId: project.defaultProviderId, model: project.defaultModel };
        }
      } catch {}
    }

    const appConfig = await this.getAppConfig();
    return {
      providerId: appConfig.defaultLLMProvider ?? 'bedrock',
      model: appConfig.defaultModel,
    };
  }
}
