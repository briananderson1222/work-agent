import { randomUUID } from 'node:crypto';
import { UsageAggregator } from '../analytics/usage-aggregator.js';

interface RuntimeStartupLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

interface RuntimeStartupStorageAdapter {
  listProjects(): Array<{ slug: string }>;
  listProviderConnections(): any[];
  saveProviderConnection(connection: any): void;
}

interface RuntimeStartupConfigLoader {
  loadPluginOverrides(): Promise<Record<string, any>>;
}

interface RuntimeStartupSkillService {
  discoverSkills(projectHomeDir: string, projectSlug?: string): Promise<void>;
}

interface RuntimeStartupContext {
  projectHomeDir: string;
  appConfig: {
    disableDefaultSkillRegistries?: boolean;
    region: string;
  };
  storageAdapter: RuntimeStartupStorageAdapter;
  configLoader: RuntimeStartupConfigLoader;
  skillService: RuntimeStartupSkillService;
  logger: RuntimeStartupLogger;
  timers: NodeJS.Timeout[];
  createUsageAggregator?: (projectHomeDir: string) => UsageAggregator;
  setIntervalImpl?: typeof setInterval;
  runStartupMigrations?: (projectHomeDir: string) => Promise<void>;
  checkBedrockCredentials?: () => Promise<boolean>;
  registerSkillRegistryProvider?: (provider: any) => void;
  createDefaultSkillRegistryProvider?: () => Promise<any>;
}

export function getActiveRuntimeProjectSlug(
  storageAdapter: Pick<RuntimeStartupStorageAdapter, 'listProjects'>,
): string | undefined {
  return storageAdapter.listProjects()[0]?.slug;
}

export function shouldRegisterRuntimeDefaultSkillRegistry(
  disableDefaultSkillRegistries: boolean | undefined,
  pluginOverrides: Record<string, any>,
): boolean {
  const pluginDisabled =
    pluginOverrides['aws-internal']?.settings?.disableDefaultSkillRegistries;
  return !disableDefaultSkillRegistries && !pluginDisabled;
}

export function initializeRuntimeUsageAggregator(
  projectHomeDir: string,
  timers: NodeJS.Timeout[],
  logger: RuntimeStartupLogger,
  createUsageAggregator: (projectHomeDir: string) => UsageAggregator = (
    homeDir,
  ) => new UsageAggregator(homeDir),
  setIntervalImpl: typeof setInterval = setInterval,
): UsageAggregator {
  const usageAggregator = createUsageAggregator(projectHomeDir);
  logger.debug('Usage aggregator initialized');
  usageAggregator.fullRescan().catch(() => {});
  timers.push(
    setIntervalImpl(() => {
      usageAggregator.fullRescan().catch(() => {});
    }, 30 * 60 * 1000),
  );
  return usageAggregator;
}

export async function seedRuntimeDefaultProviderConnection(
  context: Pick<
    RuntimeStartupContext,
    'storageAdapter' | 'appConfig' | 'logger'
  > & {
    checkBedrockCredentials?: () => Promise<boolean>;
  },
): Promise<void> {
  if (context.storageAdapter.listProviderConnections().length > 0) {
    return;
  }

  try {
    const hasCreds = await (context.checkBedrockCredentials?.() ?? false);
    if (!hasCreds) {
      return;
    }

    context.storageAdapter.saveProviderConnection({
      id: randomUUID(),
      type: 'bedrock',
      name: 'Amazon Bedrock',
      config: { region: context.appConfig.region },
      enabled: true,
      capabilities: ['llm'],
    });
    context.logger.info('Seeded default Bedrock provider connection');
  } catch (error) {
    context.logger.debug('Failed to check Bedrock credentials for seeding', {
      error,
    });
  }
}

export async function prepareRuntimeStartup(
  context: RuntimeStartupContext,
): Promise<UsageAggregator> {
  const activeProject = getActiveRuntimeProjectSlug(context.storageAdapter);
  const overrides = await context.configLoader.loadPluginOverrides();

  if (
    shouldRegisterRuntimeDefaultSkillRegistry(
      context.appConfig.disableDefaultSkillRegistries,
      overrides,
    )
  ) {
    const provider = await context.createDefaultSkillRegistryProvider?.();
    if (provider) {
      context.registerSkillRegistryProvider?.(provider);
    }
  }

  await context.skillService.discoverSkills(
    context.projectHomeDir,
    activeProject,
  );

  const usageAggregator = initializeRuntimeUsageAggregator(
    context.projectHomeDir,
    context.timers,
    context.logger,
    context.createUsageAggregator,
    context.setIntervalImpl,
  );

  await context.runStartupMigrations?.(context.projectHomeDir);
  await seedRuntimeDefaultProviderConnection(context);

  return usageAggregator;
}
