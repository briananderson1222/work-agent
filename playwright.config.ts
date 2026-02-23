import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
