import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

export default defineConfig({
    testDir: './TESTS/e2e',
    testMatch: ['curator-switch-pollution.spec.ts'],
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop-chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    webServer: {
        command: 'pnpm dev:web',
        url: process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 120 * 1000,
    },
});
