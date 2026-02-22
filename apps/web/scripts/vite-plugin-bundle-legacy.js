/**
 * HEYS v2 — Vite Plugin: Bundle Legacy JS
 *
 * Запускает scripts/bundle-legacy.js после завершения `vite build`.
 * В dev-режиме (serve) не запускается — HMR работает без изменений.
 *
 * Подключение в vite.config.ts:
 *   import bundleLegacy from './scripts/vite-plugin-bundle-legacy.js';
 *   plugins: [ ..., bundleLegacy() ]
 *
 * @version 1.0.0
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @returns {import('vite').Plugin}
 */
export default function bundleLegacy() {
    return {
        name: 'heys-bundle-legacy',

        // Запускаем только в production build, не в dev/serve
        apply: 'build',

        closeBundle() {
            const bundlerPath = path.join(__dirname, 'bundle-legacy.js');

            console.info('[HEYS.bundle] ✅ Post-build: starting legacy JS bundling...');

            try {
                execFileSync(process.execPath, [bundlerPath], {
                    stdio: 'inherit',
                    cwd: path.join(__dirname, '..'),
                });
                console.info('[HEYS.bundle] ✅ Legacy bundling complete.');
            } catch (err) {
                // Не падаем — бандлинг опциональный, само приложение будет работать
                console.error('[HEYS.bundle] ❌ Legacy bundling failed:', err.message);
                console.error('[HEYS.bundle] ❌ Production build will use unbundled scripts.');
            }
        },
    };
}
