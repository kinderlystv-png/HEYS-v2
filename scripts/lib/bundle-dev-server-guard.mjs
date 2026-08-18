#!/usr/bin/env node
/**
 * Windows + Vite: lazy bundles stay open while localhost:3001 serves them.
 * bundle-legacy then hits EPERM on overwrite. Guard runs before rebuild hooks.
 */
import net from 'node:net';

const DEFAULT_PORT = Number(process.env.HEYS_WEB_DEV_PORT || 3001);
const DEFAULT_HOST = process.env.HEYS_WEB_DEV_HOST || '127.0.0.1';
const PROBE_MS = Number(process.env.HEYS_WEB_DEV_PROBE_MS || 400);

export function isLocalWebDevListening(port = DEFAULT_PORT, host = DEFAULT_HOST, timeoutMs = PROBE_MS) {
    return new Promise((resolve) => {
        const socket = net.connect({ port, host });
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(timeoutMs);
        socket.on('connect', () => finish(true));
        socket.on('timeout', () => finish(false));
        socket.on('error', () => finish(false));
    });
}

export function formatDevServerHoldMessage(prefix = '[bundle-guard]') {
    return [
        `${prefix} localhost:${DEFAULT_PORT} отвечает (pnpm dev:local / Vite).`,
        `${prefix}   Dev-сервер держит lazy-бандлы открытыми → на Windows bundle-legacy падает с EPERM.`,
        `${prefix}   Останови dev-сервер (Ctrl+C в терминале с pnpm dev:local) и повтори commit.`,
        `${prefix}   Сознательный обход: HEYS_BUNDLE_DEV_SERVER_OK=1`,
    ].join('\n');
}

/**
 * @param {{ fail?: boolean, log?: (msg: string) => void }} [options]
 * @returns {Promise<boolean>} true when dev server is listening
 */
export async function assertLocalWebDevNotHoldingBundles(options = {}) {
    const { fail = true, log = (msg) => console.info(msg) } = options;
    if (process.env.HEYS_BUNDLE_DEV_SERVER_OK === '1') return false;

    const listening = await isLocalWebDevListening();
    if (!listening) return false;

    const message = formatDevServerHoldMessage(fail ? '[bundle-guard]' : '[bundle-legacy] ⚠️');
    if (fail) {
        console.error(message);
        process.exit(1);
    }
    log(message);
    return true;
}
