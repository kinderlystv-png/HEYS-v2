import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HEYS Analytics Dashboard Visual Testing
 */
export default defineConfig({
  testDir: './src/__tests__',
  testMatch: '**/*.visual.test.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. */
  reporter: [
    ['html', { outputFolder: 'test-results/visual-report' }],
    ['junit', { outputFile: 'test-results/visual-results.xml' }]
  ],
  
  /* Global test timeout */
  timeout: 30000,
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 10000,
    // Visual comparison settings
    toHaveScreenshot: {
      threshold: 0.2,
      animations: 'disabled'
    },
    toMatchSnapshot: {
      threshold: 0.2
    }
  },
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL for tests */
    baseURL: 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    /* Mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    
    /* Tablet viewports */
    {
      name: 'Tablet',
      use: { 
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 768 }
      },
    }
  ],

  /* Visual comparison configuration */
  expect: {
    // Visual comparison settings
    toHaveScreenshot: {
      // Threshold for pixel difference
      threshold: 0.2,
      // Animation handling
      animations: 'disabled',
      // CSS media feature
      media: 'screen'
    },
    toMatchSnapshot: {
      threshold: 0.2,
      animations: 'disabled'
    }
  },

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
  
  /* Test output directories */
  outputDir: 'test-results/visual-artifacts',
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./src/__tests__/global-setup.ts'),
  globalTeardown: require.resolve('./src/__tests__/global-teardown.ts'),
});
