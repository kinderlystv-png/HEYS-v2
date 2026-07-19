import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export default defineConfig({
    testDir: './TESTS/e2e',
    testMatch: /morning-checkin-isolated\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 420_000,
    expect: { timeout: 30_000 },
    reporter: [['list']],
    use: {
        baseURL: process.env.HEYS_E2E_BASE_URL || 'http://127.0.0.1:3001',
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
        serviceWorkers: 'allow',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
    },
    webServer: [
        {
            command: 'cross-env PORT=4001 API_PORT=4001 DATABASE_NAME=projectB NODE_ENV=development node packages/core/src/server.js',
            url: 'http://127.0.0.1:4001/health',
            reuseExistingServer: true,
            timeout: 120_000,
        },
        {
            command: 'pnpm dev:web',
            url: 'http://127.0.0.1:3001',
            reuseExistingServer: true,
            timeout: 120_000,
        },
    ],
});
