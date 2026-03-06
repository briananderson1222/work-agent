import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/android/**',
      use: { browserName: 'chromium' },
    },
    {
      name: 'android',
      testDir: './tests/android',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
    },
  ],
});
