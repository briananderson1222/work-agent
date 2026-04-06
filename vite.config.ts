import { execSync } from 'node:child_process';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_HASH__: JSON.stringify(gitHash) },
  root: './src-ui',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src-ui/src'),
      '@shared': path.resolve(__dirname, './src-shared'),
      '@stallion-ai/sdk': path.resolve(
        __dirname,
        './packages/sdk/src/index.ts',
      ),
      '@stallion-ai/connect': path.resolve(
        __dirname,
        './packages/connect/src/index.ts',
      ),
      '@stallion-ai/contracts/orchestration': path.resolve(
        __dirname,
        './packages/contracts/src/orchestration.ts',
      ),
      '@stallion-ai/contracts/provider': path.resolve(
        __dirname,
        './packages/contracts/src/provider.ts',
      ),
      '@stallion-ai/contracts/runtime-events': path.resolve(
        __dirname,
        './packages/contracts/src/runtime-events.ts',
      ),
    },
  },
  build: {
    outDir: '../dist-ui',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});
