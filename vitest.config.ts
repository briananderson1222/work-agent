import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: ['tests/**', 'node_modules/**', 'packages/**/node_modules/**', 'examples/**/node_modules/**', 'packages/connect/src/__tests__/qr-round-trip.test.ts', '.stallion-ai/**', '.work-agent/**'],
  },
});
