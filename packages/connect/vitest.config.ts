import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      // files with @vitest-environment jsdom at top use jsdom
      ['src/__tests__/useConnections.test.tsx', 'jsdom'],
      ['src/__tests__/useConnectionStatus.test.tsx', 'jsdom'],
    ],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    // QR round-trip needs canvas — skip if node-canvas isn't installed
    exclude: ['src/__tests__/qr-round-trip.test.ts'],
  },
});
