import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getActiveRuntimeProjectSlug,
  initializeRuntimeUsageAggregator,
  prepareRuntimeStartup,
  seedRuntimeDefaultProviderConnection,
  shouldRegisterRuntimeDefaultSkillRegistry,
} from '../runtime-startup.js';

describe('getActiveRuntimeProjectSlug', () => {
  test('returns the first configured project slug', () => {
    expect(
      getActiveRuntimeProjectSlug({
        listProjects: () => [{ slug: 'project-a' }, { slug: 'project-b' }],
      } as any),
    ).toBe('project-a');
  });
});

describe('shouldRegisterRuntimeDefaultSkillRegistry', () => {
  test('honors app config and plugin overrides', () => {
    expect(shouldRegisterRuntimeDefaultSkillRegistry(false, {})).toBe(true);
    expect(shouldRegisterRuntimeDefaultSkillRegistry(true, {})).toBe(false);
    expect(
      shouldRegisterRuntimeDefaultSkillRegistry(false, {
        'aws-internal': {
          settings: { disableDefaultSkillRegistries: true },
        },
      }),
    ).toBe(false);
  });
});

describe('initializeRuntimeUsageAggregator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs an immediate rescan and schedules a recurring rescan', async () => {
    const timers: NodeJS.Timeout[] = [];
    const logger = { info: vi.fn(), debug: vi.fn() };
    const fullRescan = vi.fn(async () => {});
    const usageAggregator = { fullRescan } as any;

    const result = initializeRuntimeUsageAggregator(
      '/tmp/project',
      timers,
      logger,
      () => usageAggregator,
    );

    expect(result).toBe(usageAggregator);
    expect(fullRescan).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fullRescan).toHaveBeenCalledTimes(2);
  });
});

describe('seedRuntimeDefaultProviderConnection', () => {
  test('seeds bedrock when no providers exist and credentials are available', async () => {
    const storageAdapter = {
      listProviderConnections: vi.fn(() => []),
      saveProviderConnection: vi.fn(),
    };
    const logger = { info: vi.fn(), debug: vi.fn() };

    await seedRuntimeDefaultProviderConnection({
      storageAdapter: storageAdapter as any,
      appConfig: { region: 'us-west-2' },
      logger,
      checkBedrockCredentials: async () => true,
    });

    expect(storageAdapter.saveProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bedrock',
        config: { region: 'us-west-2' },
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Seeded default Bedrock provider connection',
    );
  });
});

describe('prepareRuntimeStartup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('discovers skills, optionally registers the default skill registry, and returns usage aggregation', async () => {
    const timers: NodeJS.Timeout[] = [];
    const storageAdapter = {
      listProjects: vi.fn(() => [{ slug: 'project-a' }]),
      listProviderConnections: vi.fn(() => [{ id: 'existing' }]),
      saveProviderConnection: vi.fn(),
    };
    const configLoader = {
      loadPluginOverrides: vi.fn(async () => ({})),
    };
    const skillService = {
      discoverSkills: vi.fn(async () => {}),
    };
    const logger = { info: vi.fn(), debug: vi.fn() };
    const provider = { id: 'default-skill-provider' };
    const registerSkillRegistryProvider = vi.fn();
    const runStartupMigrations = vi.fn(async () => {});
    const fullRescan = vi.fn(async () => {});
    const usageAggregator = { fullRescan } as any;

    const result = await prepareRuntimeStartup({
      projectHomeDir: '/tmp/project',
      appConfig: { region: 'us-west-2' },
      storageAdapter: storageAdapter as any,
      configLoader,
      skillService,
      logger,
      timers,
      createUsageAggregator: () => usageAggregator,
      runStartupMigrations,
      createDefaultSkillRegistryProvider: async () => provider,
      registerSkillRegistryProvider,
    });

    expect(skillService.discoverSkills).toHaveBeenCalledWith(
      '/tmp/project',
      'project-a',
    );
    expect(registerSkillRegistryProvider).toHaveBeenCalledWith(provider);
    expect(runStartupMigrations).toHaveBeenCalledWith('/tmp/project');
    expect(result).toBe(usageAggregator);
    expect(timers).toHaveLength(1);
  });
});
