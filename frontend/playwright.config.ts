import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end runs against the running dev stack (chain, backend and this
 * app on :5173, with the sample data loaded: see the root README). One
 * worker: the stories share that data, and sign-ins are rate limited.
 * `npm run e2e:speed` times the production build instead: it builds the app
 * and serves it on :4173 (reusing a preview already running).
 */
const speed = !!process.env.E2E_SPEED;
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL:
      process.env.E2E_BASE_URL ??
      (speed ? 'http://localhost:4173' : 'http://localhost:5173'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(speed && {
    webServer: {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
    },
  }),
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
