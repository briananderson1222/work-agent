import type { AppConfig, ProviderConnectionConfig } from '@stallion-ai/shared';
import type { IStorageAdapter } from '../domain/storage-adapter.js';

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
  }

  deleteProviderConnection(id: string): void {
    this.storageAdapter.deleteProviderConnection(id);
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
