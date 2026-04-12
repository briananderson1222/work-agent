import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import { build as esbuild } from 'esbuild';
import { readPluginManifest } from './parsers.js';

const sharedDirectory = dirname(fileURLToPath(import.meta.url));

/** Modules provided by the host app at runtime via window.__stallion_ai_shared */
export const SHARED_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@stallion-ai/sdk',
  '@stallion-ai/components',
  '@tanstack/react-query',
  'dompurify',
  'debug',
  'zod',
];

/** esbuild filter regex matching all shared externals */
export const SHARED_EXTERNALS_REGEX =
  /^react$|^react\/|^@stallion-ai\/sdk$|^@stallion-ai\/components$|^@tanstack\/react-query$|^dompurify$|^debug$|^zod$/;

/** Runtime require() shim — maps externals to window.__stallion_ai_shared at runtime */
export const RUNTIME_SHIM = [
  'var __shared = (typeof window !== "undefined" && window.__stallion_ai_shared) || {};',
  'var require = globalThis.require = function(m) {',
  '  if (__shared[m]) return __shared[m];',
  '  if (m === "react" || m === "react/jsx-runtime" || m === "react/jsx-dev-runtime") return __shared["react"];',
  '  console.warn("[Plugin] Unknown shared module:", m);',
  '  return {};',
  '};',
].join('\n');

/** Registration footer — exposes plugin exports on window.__stallion_ai_plugins */
export function registrationFooter(pluginName: string): string {
  return `window.__stallion_ai_plugins = window.__stallion_ai_plugins || {}; window.__stallion_ai_plugins[${JSON.stringify(pluginName)}] = __plugin;`;
}

export interface BuildResult {
  built: boolean;
  bundlePath?: string;
  cssPath?: string;
}

/**
 * Build a plugin. Workspace plugins (with entrypoint) use esbuild JS API directly.
 * Provider-only plugins fall back to build.mjs / build.sh / npm run build.
 */
export async function buildPlugin(
  pluginDir: string,
  mode: 'production' | 'dev' = 'production',
): Promise<BuildResult> {
  const manifest = readPluginManifest(pluginDir);
  if (!manifest.entrypoint) {
    return buildCustomPlugin(pluginDir);
  }
  return buildLayoutPlugin(
    pluginDir,
    { ...manifest, entrypoint: manifest.entrypoint },
    mode,
  );
}

async function buildLayoutPlugin(
  pluginDir: string,
  manifest: PluginManifest & { entrypoint: string },
  mode: 'production' | 'dev',
): Promise<BuildResult> {
  const isDev = mode === 'dev';
  const outfile = join(pluginDir, 'dist', `bundle${isDev ? '-dev' : ''}.js`);

  ensurePluginDeps(pluginDir);
  mkdirSync(join(pluginDir, 'dist'), { recursive: true });

  await esbuild({
    entryPoints: [join(pluginDir, manifest.entrypoint)],
    bundle: true,
    format: 'iife',
    globalName: '__plugin',
    outfile,
    jsx: 'automatic',
    sourcemap: isDev ? 'inline' : false,
    banner: { js: RUNTIME_SHIM },
    footer: { js: registrationFooter(manifest.name) },
    define: {
      'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    },
    plugins: [
      {
        name: 'externalize-shared',
        setup(build) {
          build.onResolve({ filter: SHARED_EXTERNALS_REGEX }, (args) => ({
            path: args.path,
            namespace: 'shared-external',
          }));
          build.onLoad(
            { filter: /.*/, namespace: 'shared-external' },
            (args) => ({
              contents: `var _m = globalThis.require('${args.path}'); module.exports = _m; module.exports.__esModule = true; if (!module.exports.default) module.exports.default = _m;`,
              loader: 'js',
            }),
          );
        },
      },
    ],
    logLevel: 'info',
  });

  const cssPath = outfile.replace(/\.js$/, '.css');
  return {
    built: true,
    bundlePath: outfile,
    cssPath: existsSync(cssPath) ? cssPath : undefined,
  };
}

function buildCustomPlugin(pluginDir: string): BuildResult {
  const manifest = readPluginManifest(pluginDir);
  if (!manifest.build) return { built: false };

  ensurePluginDeps(pluginDir);
  execSync(manifest.build, {
    cwd: pluginDir,
    timeout: 30000,
    stdio: 'inherit',
  });
  return { built: true };
}

/** Install plugin npm deps and symlink @stallion-ai/shared */
function ensurePluginDeps(pluginDir: string): void {
  if (!existsSync(join(pluginDir, 'package.json'))) return;

  execSync('npm install --legacy-peer-deps --ignore-scripts', {
    cwd: pluginDir,
    timeout: 60000,
    stdio: 'pipe',
  });

  const sharedLink = join(pluginDir, 'node_modules', '@stallion-ai', 'shared');
  if (!existsSync(sharedLink)) {
    mkdirSync(join(pluginDir, 'node_modules', '@stallion-ai'), {
      recursive: true,
    });
    try {
      unlinkSync(sharedLink);
    } catch {}
    const devRoot = resolve(sharedDirectory, '..');
    const sharedRoot = existsSync(join(devRoot, 'src', 'index.ts'))
      ? devRoot
      : resolve(sharedDirectory, '..', 'packages', 'shared');
    symlinkSync(sharedRoot, sharedLink);
  }

  const sdkLink = join(pluginDir, 'node_modules', '@stallion-ai', 'sdk');
  if (!existsSync(sdkLink)) {
    const devRoot = resolve(sharedDirectory, '..');
    const sdkRoot = existsSync(join(devRoot, '..', 'sdk', 'src', 'index.ts'))
      ? resolve(devRoot, '..', 'sdk')
      : null;
    if (sdkRoot) {
      try {
        unlinkSync(sdkLink);
      } catch {}
      symlinkSync(sdkRoot, sdkLink);
    }
  }
}
