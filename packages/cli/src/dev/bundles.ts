import { execSync } from 'node:child_process';
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DevBundlePaths {
  bundleJs: string;
  bundleCss: string;
  bundleCssFallback: string;
  reactBundle: string;
  sdkBundle: string;
}

export function resolveDevBundlePaths(cwd: string): DevBundlePaths {
  return {
    bundleJs: join(cwd, 'dist/bundle-dev.js'),
    bundleCss: join(cwd, 'dist/bundle-dev.css'),
    bundleCssFallback: join(cwd, 'dist/bundle.css'),
    reactBundle: join(cwd, 'dist/.react-dev.js'),
    sdkBundle: join(cwd, 'dist/.sdk-dev.js'),
  };
}

function resolveEsbuildBin(cwd: string) {
  if (existsSync(join(cwd, 'node_modules/.bin/esbuild'))) {
    return join(cwd, 'node_modules/.bin/esbuild');
  }
  if (existsSync(join(cwd, '../../node_modules/.bin/esbuild'))) {
    return join(cwd, '../../node_modules/.bin/esbuild');
  }
  return 'esbuild';
}

export function ensureDevAssetBundles(cwd: string) {
  const paths = resolveDevBundlePaths(cwd);
  const pkgMtime = existsSync(join(cwd, 'package.json'))
    ? statSync(join(cwd, 'package.json')).mtimeMs
    : 0;
  const bundleMtime = existsSync(paths.reactBundle)
    ? statSync(paths.reactBundle).mtimeMs
    : 0;
  const esbuildBin = resolveEsbuildBin(cwd);

  if (!existsSync(paths.reactBundle) || pkgMtime > bundleMtime) {
    const reactEntry = join(cwd, 'dist/.react-entry.mjs');
    writeFileSync(
      reactEntry,
      [
        `import React from 'react';`,
        `import ReactDOM from 'react-dom';`,
        `import * as C from 'react-dom/client';`,
        `import * as JSX from 'react/jsx-runtime';`,
        `import * as JSXD from 'react/jsx-dev-runtime';`,
        `import * as RQ from '@tanstack/react-query';`,
        `import * as Zod from 'zod';`,
        `window.React = React;`,
        `window.ReactDOM = {...ReactDOM, ...C};`,
        `window.__jsx = JSX;`,
        `window.__jsxDev = JSXD;`,
        `window.__stallion_ai_rq = RQ;`,
        `window.__stallion_ai_zod = Zod;`,
      ].join('\n'),
    );
    try {
      execSync(
        `${esbuildBin} ${reactEntry} --bundle --format=iife --outfile=${paths.reactBundle} --loader:.tsx=tsx --jsx=automatic --define:process.env.NODE_ENV=\\"development\\"`,
        { stdio: 'pipe', cwd },
      );
    } catch (error: any) {
      console.warn('  ⚠ Could not build react bundle:', error.message);
    } finally {
      try {
        rmSync(reactEntry);
      } catch {}
    }
  }

  if (!existsSync(paths.sdkBundle) || pkgMtime > bundleMtime) {
    const sdkEntry = join(cwd, 'dist/.sdk-entry.mjs');
    writeFileSync(
      sdkEntry,
      `import { SDKProvider, LayoutHeader, AuthStatusBadge, ActionButton } from '@stallion-ai/sdk';\nwindow.__stallion_sdk = { SDKProvider, LayoutHeader, AuthStatusBadge, ActionButton };\n`,
    );
    try {
      execSync(
        `${esbuildBin} ${sdkEntry} --bundle --format=iife --outfile=${paths.sdkBundle} --loader:.tsx=tsx --jsx=automatic --external:react --external:react-dom --external:react/jsx-runtime --define:process.env.NODE_ENV=\\"development\\" --global-name=__sdkTmp`,
        { stdio: 'pipe', cwd },
      );
    } catch (error: any) {
      console.warn('  ⚠ Could not build SDK bundle:', error.message);
    } finally {
      try {
        rmSync(sdkEntry);
      } catch {}
    }
  }

  return paths;
}
