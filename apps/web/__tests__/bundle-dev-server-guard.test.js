import { describe, expect, it } from 'vitest';

import {
    formatDevServerHoldMessage,
    isLocalWebDevListening,
} from '../../../scripts/lib/bundle-dev-server-guard.mjs';

describe('bundle-dev-server-guard', () => {
    it('formatDevServerHoldMessage names port and bypass env', () => {
        const msg = formatDevServerHoldMessage('[test]');
        expect(msg).toContain('localhost:3001');
        expect(msg).toContain('HEYS_BUNDLE_DEV_SERVER_OK=1');
        expect(msg).toContain('pnpm dev:local');
    });

    it('isLocalWebDevListening returns false when nothing listens on probe port', async () => {
        const port = Number(process.env.HEYS_WEB_DEV_PORT || 30999);
        const listening = await isLocalWebDevListening(port);
        expect(listening).toBe(false);
    });
});
