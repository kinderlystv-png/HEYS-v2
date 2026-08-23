import { defineHeysE2eConfig } from './TESTS/e2e/playwright.shared';

export default defineHeysE2eConfig({
    testMatch: ['pin-auth.spec.ts'],
    project: 'mobile',
});
