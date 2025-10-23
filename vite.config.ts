import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './src-ui',
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
