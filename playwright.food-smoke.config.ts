import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

export default defineConfig({
    testDir: './TESTS/e2e',
    testMatch: ['food-flow-v4-smoke.spec.ts'],
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001',
        trace: 'off',
        screenshot: 'only-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'mobile-chromium',
            use: { ...devices['Pixel 5'] },
        },
    ],
});
