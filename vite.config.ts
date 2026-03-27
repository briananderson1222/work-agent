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
