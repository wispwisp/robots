import { defineConfig } from '@playwright/test';

// Headless Chromium only (see CLAUDE.md); tests run against the production build.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0, // one retry on CI, so a timing-sensitive test (perf) can't block the deploy alone
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
