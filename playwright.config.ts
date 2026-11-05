import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['**/raeen.spec.ts', '**/workspace.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3011',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: 'npm run build && node tests/ui-server.mjs',
    url: 'http://127.0.0.1:3011/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
