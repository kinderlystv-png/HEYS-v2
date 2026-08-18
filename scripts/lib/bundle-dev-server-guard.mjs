#!/usr/bin/env node
/**
 * Vite on :3001 can lock lazy bundle files on Windows (EPERM on overwrite).
 * bundle-legacy skips unchanged locked files and writes new hashes to new paths.
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
        `${prefix} localhost:${DEFAULT_PORT} отвечает — часть lazy-бандлов может быть заблокирована.`,
        `${prefix}   Rebuild продолжится: неизменённые файлы пропускаются, новые хэши — в новые пути.`,
        `${prefix}   После коммита с новым lazy-бандлом: hard reload на :3001.`,
    ].join('\n');
}

/**
 * @param {{ fail?: boolean, log?: (msg: string) => void }} [options]
 * @returns {Promise<boolean>} true when dev server is listening
 */
export async function assertLocalWebDevNotHoldingBundles(options = {}) {
    const { fail = false, log = (msg) => console.warn(msg) } = options;
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
