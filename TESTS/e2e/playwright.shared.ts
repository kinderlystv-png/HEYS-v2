import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

const baseURL = process.env.HEYS_E2E_BASE_URL || 'http://localhost:3001';
const apiURL = process.env.HEYS_E2E_API_URL || 'http://localhost:4001';

export const e2eBaseURL = baseURL;
export const e2eApiURL = apiURL;

type SharedOptions = {
    testMatch: string[];
    timeout?: number;
    project?: 'mobile' | 'desktop';
    trace?: PlaywrightTestConfig['use']['trace'];
};

export function defineHeysE2eConfig({
    testMatch,
    timeout = 120_000,
    project = 'mobile',
    trace = 'on-first-retry',
}: SharedOptions): PlaywrightTestConfig {
    const device = project === 'desktop' ? devices['Desktop Chrome'] : devices['Pixel 5'];

    return defineConfig({
        testDir: './TESTS/e2e',
        testMatch,
        fullyParallel: false,
        retries: process.env.CI ? 2 : 0,
        workers: 1,
        timeout,
        reporter: [['list'], ['html', { open: 'never' }]],
        use: {
            baseURL,
            trace,
            screenshot: 'only-on-failure',
            video: 'retain-on-failure',
            ...(project === 'mobile'
                ? {
                      viewport: { width: 393, height: 851 },
                      isMobile: true,
                      hasTouch: true,
                  }
                : {}),
        },
        projects: [
            {
                name: project === 'desktop' ? 'desktop-chromium' : 'mobile-chromium',
                use: { ...device },
            },
        ],
        webServer: {
            command: 'pnpm dev:local',
            url: baseURL,
            reuseExistingServer: true,
            timeout: 180_000,
        },
    });
}
