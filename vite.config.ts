import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

const gitHash = (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); } catch { return 'dev'; } })();

export default defineConfig({
  plugins: [react()],
  define: { '__BUILD_HASH__': JSON.stringify(gitHash) },
  root: './src-ui',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src-ui/src'),
    },
  },
  build: {
    outDir: '../dist-ui',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});
