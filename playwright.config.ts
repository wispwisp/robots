import { defineConfig } from '@playwright/test';

// Headless Chromium only (see CLAUDE.md); tests run against the production build.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://localhost:4173',
    viewport: { width: 1366, height: 768 }, // the target school laptop
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
