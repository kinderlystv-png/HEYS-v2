import fs from 'node:fs';
import path from 'node:path';

import jsQR from 'jsqr';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const ORIGIN = 'http://localhost:3001';
const PROD_ORIGIN = 'https://app.heyslab.ru';
const QR_CELL_PX = 4;
const QR_QUIET_MODULES = 4;
const QR_MARGIN_PX = QR_CELL_PX * QR_QUIET_MODULES;

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

async function readQrGifPixels(dataUri) {
    const base64 = dataUri.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const meta = await sharp(buffer).metadata();
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    return { width: meta.width, height: meta.height, pixels: data, channels: info.channels };
}

function measureQuietMargins(pixels, width, height, channels) {
    const lum = (x, y) => pixels[(y * width + x) * channels];
    const rowHasDark = (y) => {
        for (let x = 0; x < width; x += 1) {
            if (lum(x, y) < 200) return true;
        }
        return false;
    };
    const colHasDark = (x) => {
        for (let y = 0; y < height; y += 1) {
            if (lum(x, y) < 200) return true;
        }
        return false;
    };

    let top = 0;
    while (top < height && !rowHasDark(top)) top += 1;
    let bottom = 0;
    while (bottom < height && !rowHasDark(height - 1 - bottom)) bottom += 1;
    let left = 0;
    while (left < width && !colHasDark(left)) left += 1;
    let right = 0;
    while (right < width && !colHasDark(width - 1 - right)) right += 1;

    return { top, right, bottom, left };
}

function qrModuleCount(origin) {
    const qr = window.HEYS.Gates._qrcodeFactory(0, 'M');
    qr.addData(origin);
    qr.make();
    return qr.getModuleCount();
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

    it('renders module-aligned GIF with a 4-module quiet zone', async () => {
        loadGatesScript();

        const moduleCount = qrModuleCount(ORIGIN);
        expect(moduleCount).toBe(25);

        const dataUri = window.HEYS.Gates.buildDesktopGateQrSrc(ORIGIN);
        const expectedPx = moduleCount * QR_CELL_PX + 2 * QR_MARGIN_PX;
        const { width, height, pixels, channels } = await readQrGifPixels(dataUri);

        expect(width).toBe(expectedPx);
        expect(height).toBe(expectedPx);
        expect(width % QR_CELL_PX).toBe(0);

        const margins = measureQuietMargins(pixels, width, height, channels);
        expect(margins).toEqual({
            top: QR_MARGIN_PX,
            right: QR_MARGIN_PX,
            bottom: QR_MARGIN_PX,
            left: QR_MARGIN_PX,
        });
        expect(QR_MARGIN_PX / QR_CELL_PX).toBe(QR_QUIET_MODULES);
    });

    it('prod origin stays 25 modules with scheme', () => {
        loadGatesScript();
        expect(qrModuleCount(PROD_ORIGIN)).toBe(25);
        expect(qrModuleCount('app.heyslab.ru')).toBe(21);
    });

    it('DesktopGateScreen keeps origin usage and local qr src wiring', () => {
        const gates = fs.readFileSync(path.join(WEB_DIR, 'heys_app_gates_v1.js'), 'utf8');
        expect(gates).toContain('window.location.origin');
        expect(gates).toContain('HEYS.Gates.buildDesktopGateQrSrc(currentUrl)');
        expect(gates).toContain('src: qrSrc');
        expect(gates).not.toContain('api.qrserver.com');
    });
});
