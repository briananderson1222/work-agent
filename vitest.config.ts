import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [
      'tests/**',
      'node_modules/**',
      'packages/**/node_modules/**',
      'examples/**/node_modules/**',
      'vendor/**',
      'packages/connect/src/__tests__/qr-round-trip.test.ts',
      '.omx/**',
      '.stallion-ai/**',
      '.work-agent/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src-server/**/*.ts'],
      exclude: ['**/__tests__/**', '**/__test-utils__/**', '**/*.d.ts'],
      thresholds: {
        statements: 30,
        branches: 65,
        functions: 50,
        lines: 30,
      },
    },
  },
});
