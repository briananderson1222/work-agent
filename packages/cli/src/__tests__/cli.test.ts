import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  delete process.env.STALLION_AI_DIR;
  vi.resetModules();
  vi.restoreAllMocks();
});

async function loadCliWithLifecycleMocks() {
  const lifecycle = {
    clean: vi.fn(),
    doctor: vi.fn(),
    link: vi.fn(),
    shortcut: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    upgrade: vi.fn(),
  };

  vi.doMock('../commands/build.js', () => ({ build: vi.fn() }));
  vi.doMock('../commands/config.js', () => ({
    configGet: vi.fn(),
    configSet: vi.fn(),
  }));
  vi.doMock('../commands/export.js', () => ({ exportConfig: vi.fn() }));
  vi.doMock('../commands/import.js', () => ({ importConfig: vi.fn() }));
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
  vi.doMock('../commands/lifecycle.js', () => lifecycle);
  vi.doMock('../dev/server.js', () => ({
    startDevServer: vi.fn(),
  }));

  const { runCli } = await import('../cli.js');
  return { lifecycle, runCli };
}

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
    await runCli(['plugin', 'create', 'provider-kit', '--template=provider']);

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

  test('passes an explicit base through clean-before-start lifecycle calls', async () => {
    const { lifecycle, runCli } = await loadCliWithLifecycleMocks();

    await runCli([
      'start',
      '--clean',
      '--force',
      '--base=/tmp/stallion-home',
      '--instance=smoke-a',
      '--port=3242',
      '--ui-port=5274',
    ]);

    expect(lifecycle.clean).toHaveBeenCalledWith({
      actionLabel: 'start --clean',
      allowDefaultHomeClean: false,
      force: true,
      homeSource: '--base',
      instanceName: 'smoke-a',
      projectHome: '/tmp/stallion-home',
      serverPort: 3242,
      uiPort: 5274,
    });
    expect(lifecycle.start).toHaveBeenCalledWith({
      baseDir: '/tmp/stallion-home',
      build: false,
      features: undefined,
      homeSource: '--base',
      instanceName: 'smoke-a',
      logFile: undefined,
      serverPort: 3242,
      uiPort: 5274,
    });
  });

  test('reuses one generated temp home for clean-before-start flows', async () => {
    const { lifecycle, runCli } = await loadCliWithLifecycleMocks();

    await runCli([
      'start',
      '--clean',
      '--force',
      '--temp-home',
      '--instance=smoke-b',
      '--port=3243',
      '--ui-port=5275',
    ]);

    const cleanArgs = lifecycle.clean.mock.calls[0]?.[0];
    const startArgs = lifecycle.start.mock.calls[0]?.[0];

    expect(cleanArgs).toMatchObject({
      actionLabel: 'start --clean',
      allowDefaultHomeClean: false,
      force: true,
      homeSource: '--temp-home',
      instanceName: 'smoke-b',
      serverPort: 3243,
      uiPort: 5275,
    });
    expect(startArgs).toMatchObject({
      build: false,
      homeSource: '--temp-home',
      instanceName: 'smoke-b',
      serverPort: 3243,
      uiPort: 5275,
    });
    expect(cleanArgs.projectHome).toBe(startArgs.baseDir);
    expect(cleanArgs.projectHome).toMatch(/stallion-dev-home-/);
  });

  test('uses the resolved home selector when stopping with an env home override', async () => {
    process.env.STALLION_AI_DIR = '/tmp/env-home';
    const { lifecycle, runCli } = await loadCliWithLifecycleMocks();

    await runCli(['stop']);

    expect(lifecycle.stop).toHaveBeenCalledWith({
      baseDir: '/tmp/env-home',
      instanceName: undefined,
      serverPort: undefined,
      uiPort: undefined,
    });
  });

  test('does not inject the resolved default home when stopping a named instance', async () => {
    process.env.STALLION_AI_DIR = '/tmp/env-home';
    const { lifecycle, runCli } = await loadCliWithLifecycleMocks();

    await runCli(['stop', '--instance=smoke-a']);

    expect(lifecycle.stop).toHaveBeenCalledWith({
      baseDir: undefined,
      instanceName: 'smoke-a',
      serverPort: undefined,
      uiPort: undefined,
    });
  });

  test('awaits guarded clean before install when --clean is requested', async () => {
    const { lifecycle } = await loadCliWithLifecycleMocks();
    const install = vi.fn().mockResolvedValue({
      pluginName: 'demo-plugin',
      version: '1.0.0',
    });

    vi.doMock('../commands/install.js', () => ({
      info: vi.fn(),
      install,
      list: vi.fn(),
      preview: vi.fn(),
      registry: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    }));

    vi.resetModules();
    const { runCli: reloadedRunCli } = await import('../cli.js');

    await reloadedRunCli([
      'plugin',
      'install',
      './examples/demo-layout',
      '--clean',
      '--force',
      '--allow-default-home-clean',
    ]);

    expect(lifecycle.clean).toHaveBeenCalledWith({
      actionLabel: 'plugin install --clean',
      allowDefaultHomeClean: true,
      force: true,
      homeSource: 'default',
      instanceName: undefined,
      projectHome: expect.any(String),
      serverPort: 3141,
      uiPort: 3000,
    });
    expect(install).toHaveBeenCalledWith('./examples/demo-layout', []);
  });

  test('dispatches core resource commands through the shared core command handler', async () => {
    const runCoreCommand = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../commands/build.js', () => ({ build: vi.fn() }));
    vi.doMock('../commands/config.js', () => ({
      configGet: vi.fn(),
      configSet: vi.fn(),
    }));
    vi.doMock('../commands/export.js', () => ({ exportConfig: vi.fn() }));
    vi.doMock('../commands/import.js', () => ({ importConfig: vi.fn() }));
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
    vi.doMock('../commands/core.js', () => ({
      runCoreCommand,
    }));
    vi.doMock('../dev/server.js', () => ({
      startDevServer: vi.fn(),
    }));

    const { runCli } = await import('../cli.js');
    await runCli(['agents', 'list', '--json']);
    await runCli(['chat', 'default', 'hello']);

    expect(runCoreCommand).toHaveBeenNthCalledWith(1, 'agents', [
      'list',
      '--json',
    ]);
    expect(runCoreCommand).toHaveBeenNthCalledWith(2, 'chat', [
      'default',
      'hello',
    ]);
  });
});
