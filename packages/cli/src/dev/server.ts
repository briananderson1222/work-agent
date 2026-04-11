import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlugin } from '@stallion-ai/shared/build';
import {
  CWD,
  lookupDepInRegistries,
  PLUGINS_DIR,
  readManifest,
} from '../commands/helpers.js';
import { install } from '../commands/install.js';
import { ensureDevAssetBundles } from './bundles.js';
import { createDevHttpServer } from './http.js';
import { setupDevMcpManager } from './mcp.js';
import { regenerateDevHTML } from './registry.js';
import { watchConfigChanges, watchSourceChanges } from './watchers.js';

export interface DevFlags {
  mcp?: boolean;
  toolsDir?: string;
}

export async function startDevServer(
  port: number,
  flags: DevFlags = {},
): Promise<void> {
  await buildPlugin(CWD, 'dev');

  const manifest = readManifest();

  // Resolve dependencies (install if missing, same as `stallion install`)
  if (manifest.dependencies?.length) {
    for (const dep of manifest.dependencies) {
      if (existsSync(join(PLUGINS_DIR, dep.id, 'plugin.json'))) continue;
      const depSource = dep.source || lookupDepInRegistries(dep.id);
      if (depSource) {
        console.log(`📦 Installing dependency: ${dep.id}...`);
        try {
          install(depSource, []);
        } catch (e: any) {
          console.warn(`  ⚠ Dep ${dep.id} failed: ${e.message}`);
        }
      }
    }
  }

  const name = manifest.displayName || manifest.name;
  const { bundleJs, bundleCss, bundleCssFallback, reactBundle, sdkBundle } =
    ensureDevAssetBundles(CWD);

  const layoutPath = manifest.layout?.source
    ? join(CWD, manifest.layout.source)
    : null;
  let { html, layout } = regenerateDevHTML({
    cwd: CWD,
    manifest,
    layoutPath,
    pluginsDir: PLUGINS_DIR,
  });

  // ── MCP setup ──
  let mcpManager = null;
  const useMCP = flags.mcp !== false;
  const toolsDir = flags.toolsDir || join(CWD, 'integrations');

  if (useMCP && manifest.agents?.length) {
    (async () => {
      try {
        mcpManager = await setupDevMcpManager({
          cwd: CWD,
          toolsDir,
        });
      } catch (err: any) {
        console.warn(`   ⚠ MCP setup failed: ${err.message}`);
      }
    })();
  }

  // ── Hot reload ──
  const { reloadClients, server } = createDevHttpServer({
    cwd: CWD,
    pluginsDir: PLUGINS_DIR,
    bundleJs,
    bundleCss,
    bundleCssFallback,
    reactBundle,
    sdkBundle,
    getHtml: () => html,
    getMcpManager: () => mcpManager,
  });

  watchSourceChanges({
    cwd: CWD,
    onRebuild: async (filename) => {
      try {
        console.log(`\n♻️  ${filename} changed — rebuilding...`);
        await buildPlugin(CWD, 'dev');
        for (const res of reloadClients) {
          res.write('data: reload\n\n');
        }
      } catch (err: any) {
        console.error(`   Build failed: ${err.message}`);
      }
    },
  });

  const configDirs = watchConfigChanges({
    cwd: CWD,
    manifest,
    layoutPath,
    onReload: (label) => {
      try {
        console.log(`\n♻️  ${label} changed — regenerating config...`);
        ({ html, layout } = regenerateDevHTML({
          cwd: CWD,
          manifest,
          layoutPath,
          pluginsDir: PLUGINS_DIR,
        }));
        for (const res of reloadClients) {
          res.write('data: reload\n\n');
        }
      } catch (err: any) {
        console.error(`   Config reload failed: ${err.message}`);
      }
    },
  });

  server.listen(port, () => {
    const tabs = layout?.tabs || [];
    console.log(`\n🔧 Plugin dev server running at http://localhost:${port}`);
    console.log(`   Plugin: ${name}`);
    console.log(`   Tabs: ${tabs.map((t) => t.label).join(', ') || 'none'}`);
    console.log(
      useMCP && manifest.agents?.length
        ? '   MCP: connecting...'
        : '   MCP: off',
    );
    if (configDirs.length > 0) {
      console.log(
        `   Watching: src/ + ${configDirs.map((d) => d.replace(`${CWD}/`, '')).join(', ')}`,
      );
    }
    console.log('');
  });

  const cleanup = async () => {
    if (mcpManager) await mcpManager.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
