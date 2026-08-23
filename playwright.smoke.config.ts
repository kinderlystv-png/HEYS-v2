import { defineHeysE2eConfig } from './TESTS/e2e/playwright.shared';

export default defineHeysE2eConfig({
    testMatch: [
        'curator-login-smoke.spec.ts',
        'pin-auth.spec.ts',
        'products-client-scope-smoke.spec.ts',
        'products-heardfromcloud-smoke.spec.ts',
    ],
    timeout: 180_000,
    project: 'mobile',
});
