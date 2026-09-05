import fs from 'node:fs';
import path from 'node:path';

import jsQR from 'jsqr';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const ORIGIN = 'http://localhost:3001';

function loadGatesScript() {
    const code = fs.readFileSync(path.join(WEB_DIR, 'heys_app_gates_v1.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', code)(window, document);
}

async function decodeQrPayload(dataUri) {
    const base64 = dataUri.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    return code?.data ?? null;
}

beforeEach(() => {
    window.HEYS = {};
});

describe('DesktopGateScreen local QR', () => {
    it('does not call external qrserver in product gates or CSP', () => {
        const gates = fs.readFileSync(path.join(WEB_DIR, 'heys_app_gates_v1.js'), 'utf8');
        const html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
        expect(gates).not.toMatch(/qrserver/i);
        expect(html).not.toMatch(/qrserver/i);
    });

    it('encodes only window.location.origin into a data: GIF QR', async () => {
        loadGatesScript();
        expect(typeof window.HEYS.Gates.buildDesktopGateQrSrc).toBe('function');

        const dataUri = window.HEYS.Gates.buildDesktopGateQrSrc(ORIGIN);
        expect(dataUri.startsWith('data:image/gif;base64,')).toBe(true);

        const payload = await decodeQrPayload(dataUri);
        expect(payload).toBe(ORIGIN);
    });

    it('DesktopGateScreen keeps origin usage and local qr src wiring', () => {
        const gates = fs.readFileSync(path.join(WEB_DIR, 'heys_app_gates_v1.js'), 'utf8');
        expect(gates).toContain('window.location.origin');
        expect(gates).toContain('HEYS.Gates.buildDesktopGateQrSrc(currentUrl)');
        expect(gates).toContain('src: qrSrc');
        expect(gates).not.toContain('api.qrserver.com');
    });
});
