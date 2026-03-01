import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // All provider tests run in jsdom (they depend on window / navigator)
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
  },
  resolve: {
    // Allow imports from @stallion-ai/sdk to resolve to the built dist
    conditions: ['import', 'module', 'browser', 'default'],
  },
});
