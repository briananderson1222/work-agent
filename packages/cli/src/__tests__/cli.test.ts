import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('runCli', () => {
  test('dispatches registry install through registry resolution before install', async () => {
    const install = vi.fn().mockResolvedValue({
      pluginName: 'actual-plugin-name',
      version: '1.0.0',
    });
    const recordRegistryInstall = vi.fn();
    const resolveRegistryPluginSource = vi
      .fn()
      .mockResolvedValue('/tmp/demo-layout');

    vi.doMock('../commands/build.js', () => ({ build: vi.fn() }));
    vi.doMock('../commands/config.js', () => ({
      configGet: vi.fn(),
      configSet: vi.fn(),
    }));
    vi.doMock('../commands/export.js', () => ({ exportConfig: vi.fn() }));
    vi.doMock('../commands/init.js', () => ({
      createPlugin: vi.fn(),
      init: vi.fn(),
    }));
    vi.doMock('../commands/import.js', () => ({ importConfig: vi.fn() }));
    vi.doMock('../commands/install-registry.js', () => ({
      recordRegistryInstall,
      resolveRegistryPluginSource,
    }));
    vi.doMock('../commands/install.js', () => ({
      info: vi.fn(),
      install,
      list: vi.fn(),
      preview: vi.fn(),
      registry: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    }));
    vi.doMock('../commands/lifecycle.js', () => ({
      clean: vi.fn(),
      doctor: vi.fn(),
      link: vi.fn(),
      shortcut: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      upgrade: vi.fn(),
    }));
    vi.doMock('../dev/server.js', () => ({
      startDevServer: vi.fn(),
    }));

    const { runCli } = await import('../cli.js');
    await runCli(['registry', 'install', 'demo-layout']);

    expect(resolveRegistryPluginSource).toHaveBeenCalledWith('demo-layout');
    expect(install).toHaveBeenCalledWith('/tmp/demo-layout', []);
    expect(recordRegistryInstall).toHaveBeenCalledWith(
      'demo-layout',
      'actual-plugin-name',
    );
  });

  test('dispatches create-plugin with the selected template', async () => {
    const createPlugin = vi.fn();

    vi.doMock('../commands/build.js', () => ({ build: vi.fn() }));
    vi.doMock('../commands/config.js', () => ({
      configGet: vi.fn(),
      configSet: vi.fn(),
    }));
    vi.doMock('../commands/export.js', () => ({ exportConfig: vi.fn() }));
    vi.doMock('../commands/init.js', () => ({
      createPlugin,
      init: vi.fn(),
    }));
    vi.doMock('../commands/import.js', () => ({ importConfig: vi.fn() }));
    vi.doMock('../commands/install-registry.js', () => ({
      recordRegistryInstall: vi.fn(),
      resolveRegistryPluginSource: vi.fn(),
    }));
    vi.doMock('../commands/install.js', () => ({
      info: vi.fn(),
      install: vi.fn(),
      list: vi.fn(),
      preview: vi.fn(),
      registry: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    }));
    vi.doMock('../commands/lifecycle.js', () => ({
      clean: vi.fn(),
      doctor: vi.fn(),
      link: vi.fn(),
      shortcut: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      upgrade: vi.fn(),
    }));
    vi.doMock('../dev/server.js', () => ({
      startDevServer: vi.fn(),
    }));

    const { runCli } = await import('../cli.js');
    await runCli(['create-plugin', 'provider-kit', '--template=provider']);

    expect(createPlugin).toHaveBeenCalledWith('provider-kit', {
      template: 'provider',
    });
  });

  test('dispatches portability export and import commands', async () => {
    const exportConfig = vi.fn();
    const importConfig = vi.fn();

    vi.doMock('../commands/build.js', () => ({ build: vi.fn() }));
    vi.doMock('../commands/config.js', () => ({
      configGet: vi.fn(),
      configSet: vi.fn(),
    }));
    vi.doMock('../commands/init.js', () => ({
      createPlugin: vi.fn(),
      init: vi.fn(),
    }));
    vi.doMock('../commands/install-registry.js', () => ({
      recordRegistryInstall: vi.fn(),
      resolveRegistryPluginSource: vi.fn(),
    }));
    vi.doMock('../commands/install.js', () => ({
      info: vi.fn(),
      install: vi.fn(),
      list: vi.fn(),
      preview: vi.fn(),
      registry: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    }));
    vi.doMock('../commands/lifecycle.js', () => ({
      clean: vi.fn(),
      doctor: vi.fn(),
      link: vi.fn(),
      shortcut: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      upgrade: vi.fn(),
    }));
    vi.doMock('../commands/export.js', () => ({ exportConfig }));
    vi.doMock('../commands/import.js', () => ({ importConfig }));
    vi.doMock('../dev/server.js', () => ({
      startDevServer: vi.fn(),
    }));

    const { runCli } = await import('../cli.js');
    await runCli(['export', '--format=agents-md', '--output=/tmp/AGENTS.md']);
    await runCli(['import', '/tmp/AGENTS.md']);

    expect(exportConfig).toHaveBeenCalledWith({
      format: 'agents-md',
      output: '/tmp/AGENTS.md',
    });
    expect(importConfig).toHaveBeenCalledWith('/tmp/AGENTS.md');
  });
});
