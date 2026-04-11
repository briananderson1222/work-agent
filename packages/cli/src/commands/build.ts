import { readFileSync } from 'node:fs';
import { buildPlugin } from '@stallion-ai/shared/build';
import { readPluginManifest } from '@stallion-ai/shared/parsers';
import { CWD } from './helpers.js';

export async function build(
  mode: 'production' | 'dev' = 'production',
): Promise<void> {
  const manifest = readPluginManifest(CWD);
  console.log(
    `📦 Building ${manifest.displayName || manifest.name}${mode === 'dev' ? ' (dev)' : ''}...`,
  );
  const result = await buildPlugin(CWD, mode);
  if (result.built && result.bundlePath) {
    const size = readFileSync(result.bundlePath).length;
    const cssSize = result.cssPath ? readFileSync(result.cssPath).length : 0;
    console.log(
      `✅ ${result.bundlePath.replace(`${CWD}/`, '')} (${(size / 1024).toFixed(1)}KB)${cssSize ? ` + css (${(cssSize / 1024).toFixed(1)}KB)` : ''}`,
    );
  }
}
