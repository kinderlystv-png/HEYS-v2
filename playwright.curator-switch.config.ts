import { defineHeysE2eConfig } from './TESTS/e2e/playwright.shared';

export default defineHeysE2eConfig({
    testMatch: ['curator-switch-pollution.spec.ts'],
    timeout: 180_000,
    project: 'desktop',
});
