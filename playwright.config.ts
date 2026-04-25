import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.ts',
  timeout: 60000,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
});
