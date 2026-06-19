import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './TESTS/e2e',
    testMatch: ['write-context-wake-smoke.spec.ts'],
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001',
        trace: 'off',
        screenshot: 'only-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'mobile-chromium',
            use: {
                ...devices['Pixel 5'],
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
