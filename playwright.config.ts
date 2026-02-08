import { defineConfig, devices } from '@playwright/test';

const isLiveTest = process.env.TEST_URL?.includes('vercel') || process.env.LIVE_TEST === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for multiplayer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for multiplayer tests
  reporter: [['html'], ['list']],
  timeout: 60000, // 60 second default timeout

  use: {
    baseURL: process.env.TEST_URL || 'https://lost-worlds-web.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-safari',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iphone-14',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],

  // Only run local dev server if not testing against live URL
  ...(isLiveTest ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  }),
});
