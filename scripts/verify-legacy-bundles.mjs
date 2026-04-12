#!/usr/bin/env node
/**
 * verify-legacy-bundles.mjs — consistency check for legacy hashed bundles.
 *
 * Validates:
 * - apps/web/bundle-manifest.json ↔ apps/web/public/bundle-manifest.json
 * - Each manifest entry: file exists under public/, hash matches filename
 * - index.html: boot defer scripts + preloads + POST_BOOT_BUNDLES match manifest
 *
 * Run: pnpm verify:legacy-bundles
 * Optional: --fix-hint (default true) append rebuild commands on failure
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGACY_BUNDLES } from './legacy-bundle-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const PUB_DIR = resolve(WEB_DIR, 'public');
const MANIFEST_WEB = resolve(WEB_DIR, 'bundle-manifest.json');
const MANIFEST_PUBLIC = resolve(PUB_DIR, 'bundle-manifest.json');
const INDEX_HTML = resolve(WEB_DIR, 'index.html');

const BUNDLE_NAMES = Object.keys(LEGACY_BUNDLES);
const BOOT_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('boot-'));
const POSTBOOT_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('postboot-'));

const SHOW_FIX_HINT = !process.argv.includes('--no-fix-hint');

function readJson(path) {
    if (!existsSync(path)) {
        return { error: `missing file: ${path}` };
    }
    try {
        return { ok: true, data: JSON.parse(readFileSync(path, 'utf8')) };
    } catch (e) {
        return { error: `invalid JSON: ${path} (${e.message})` };
    }
}

function stableStringify(obj) {
    return `${JSON.stringify(obj, null, 2)}\n`;
}

function extractBootDeferScripts(html) {
    const re = /<script\s+defer\s+src="(boot-[^"]+\.bundle\.[a-f0-9]{12}\.js)"/g;
    return [...html.matchAll(re)].map(m => m[1]);
}

function extractBootPreloads(html) {
    const re = /<link\s+rel="preload"\s+href="(boot-[^"]+\.bundle\.[a-f0-9]{12}\.js)"\s+as="script"/g;
    return [...html.matchAll(re)].map(m => m[1]);
}

function extractPostBootBundles(html) {
    const m = html.match(/var\s+POST_BOOT_BUNDLES\s*=\s*\[([\s\S]*?)\];/);
    if (!m) return { error: 'POST_BOOT_BUNDLES array not found in index.html' };
    const inner = m[1];
    const files = [...inner.matchAll(/'((?:postboot-|boot-)[^']+\.bundle\.[a-f0-9]{12}\.js)'/g)].map(x => x[1]);
    if (files.length === 0) return { error: 'POST_BOOT_BUNDLES has no bundle string literals' };
    return { ok: true, files };
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function printFixHint() {
    if (!SHOW_FIX_HINT) return;
    console.error('');
    console.error('[verify-legacy-bundles] Fix: run a full legacy rebuild (updates manifest, public/, index.html, sw):');
    console.error('  pnpm --filter @heys/web run predev && pnpm bundle:legacy');
    console.error('Or selective rebuild when only some sources changed:');
    console.error('  pnpm bundle:legacy:auto --files=apps/web/heys_example.js');
    console.error('See: docs/AI_KEY_FILES.md (bundle-legacy.mjs, bundle-manifest.json)');
}

function main() {
    const errors = [];

    const webM = readJson(MANIFEST_WEB);
    if (webM.error) errors.push(webM.error);

    const pubM = readJson(MANIFEST_PUBLIC);
    if (pubM.error) errors.push(pubM.error);

    let manifest = webM.ok ? webM.data : null;

    if (webM.ok && pubM.ok) {
        const a = stableStringify(webM.data);
        const b = stableStringify(pubM.data);
        if (a !== b) {
            errors.push(
                'apps/web/bundle-manifest.json and apps/web/public/bundle-manifest.json differ (SW reads public copy). Run bundle:legacy.',
            );
        }
    }

    if (manifest) {
        for (const name of BUNDLE_NAMES) {
            const entry = manifest[name];
            if (!entry || typeof entry.file !== 'string' || typeof entry.hash !== 'string') {
                errors.push(`manifest missing or invalid entry for bundle "${name}"`);
                continue;
            }
            const { file, hash } = entry;
            if (!/^[a-f0-9]{12}$/.test(hash)) {
                errors.push(`bundle "${name}": invalid hash format "${hash}"`);
            }
            const expectedFile = `${name}.bundle.${hash}.js`;
            if (file !== expectedFile) {
                errors.push(`bundle "${name}": file "${file}" expected to be "${expectedFile}"`);
            }
            const pubPath = resolve(PUB_DIR, file);
            if (!existsSync(pubPath)) {
                errors.push(`missing public asset: apps/web/public/${file} (manifest lists it)`);
            }
        }

        const extraKeys = Object.keys(manifest).filter(k => !BUNDLE_NAMES.includes(k));
        for (const k of extraKeys) {
            errors.push(`manifest has unknown bundle key "${k}" (not in legacy-bundle-config.mjs)`);
        }
    }

    if (!existsSync(INDEX_HTML)) {
        errors.push(`missing ${INDEX_HTML}`);
    } else if (manifest) {
        const html = readFileSync(INDEX_HTML, 'utf8');

        const expectedBoot = BOOT_NAMES.map(n => manifest[n]?.file).filter(Boolean);
        const deferBoot = extractBootDeferScripts(html);
        if (!arraysEqual(deferBoot, expectedBoot)) {
            errors.push(
                `index.html boot <script defer> order/names mismatch.\n  expected: ${JSON.stringify(expectedBoot)}\n  actual:   ${JSON.stringify(deferBoot)}`,
            );
        }

        const preloadBoot = extractBootPreloads(html);
        if (!arraysEqual(preloadBoot, expectedBoot)) {
            errors.push(
                `index.html boot <link rel="preload"> mismatch.\n  expected: ${JSON.stringify(expectedBoot)}\n  actual:   ${JSON.stringify(preloadBoot)}`,
            );
        }

        const expectedPost = POSTBOOT_NAMES.map(n => manifest[n]?.file).filter(Boolean);
        const pb = extractPostBootBundles(html);
        if (pb.error) {
            errors.push(pb.error);
        } else if (!arraysEqual(pb.files, expectedPost)) {
            errors.push(
                `index.html POST_BOOT_BUNDLES mismatch.\n  expected: ${JSON.stringify(expectedPost)}\n  actual:   ${JSON.stringify(pb.files)}`,
            );
        }
    }

    if (errors.length > 0) {
        console.error('[verify-legacy-bundles] ❌ Failed:');
        for (const e of errors) console.error(`  - ${e}`);
        printFixHint();
        process.exit(1);
    }

    console.info('[verify-legacy-bundles] ✅ manifest, public assets, and index.html are in sync.');
    process.exit(0);
}

main();
