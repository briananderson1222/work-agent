import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
