import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Requires a local LiveKit development server on 127.0.0.1:7880.
export default defineConfig({
  ...base,
  testMatch: '**/voice.spec.ts',
  use: {
    ...base.use,
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    ...(base.webServer as object),
    command: 'npm run build && node tests/ui-server.mjs',
    url: 'http://127.0.0.1:3011/api/health',
    env: { RAEEN_TEST_VOICE: '1' },
  },
});
