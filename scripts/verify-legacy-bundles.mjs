#!/usr/bin/env node
/**
 * verify-legacy-bundles.mjs — consistency check for legacy hashed bundles.
 *
 * Validates:
 * - apps/web/bundle-manifest.json ↔ apps/web/public/bundle-manifest.json
 * - Each manifest entry: file exists under public/, hash matches filename
 * - index.html: boot defer scripts + preloads match manifest
 * - index.html POST_BOOT_BUNDLES contains only EAGER postboot bundles
 *   (lazy chunks load via facade + lazy-manifest.json, not from POST_BOOT_BUNDLES)
 * - lazy-manifest.json hashes match bundle-manifest.json for lazy chunks
 *
 * Run: pnpm verify:legacy-bundles
 * Optional: --fix-hint (default true) append rebuild commands on failure
 */

import { createHash } from 'node:crypto';
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
const POSTBOOT_EAGER_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('postboot-') && n.endsWith('-eager'));
const POSTBOOT_LAZY_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('postboot-') && n.endsWith('-lazy'));
const LAZY_MANIFEST = resolve(PUB_DIR, 'lazy-manifest.json');

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

function readWebFile(relPath) {
    const clean = relPath.split('?')[0];
    return readFileSync(resolve(WEB_DIR, clean), 'utf8');
}

function buildSourceFingerprint(files) {
    const hash = createHash('sha256');
    for (const relPath of files) {
        const cleanPath = relPath.split('?')[0];
        const src = readWebFile(relPath);
        hash.update(cleanPath);
        hash.update('\0');
        hash.update(src);
        hash.update('\0');
    }
    return hash.digest('hex').slice(0, 12);
}

function parseBundleSources(bundleContent) {
    const marker = /\/\* ===== ([^*]+?) ===== \*\//g;
    const hits = [...bundleContent.matchAll(marker)];
    if (hits.length === 0) return { order: [], byFile: {} };

    const byFile = {};
    const order = [];
    for (let i = 0; i < hits.length; i++) {
        const relPath = hits[i][1];
        const start = hits[i].index + hits[i][0].length;
        const end = i + 1 < hits.length ? hits[i + 1].index : bundleContent.length;
        const body = bundleContent.slice(start, end).replace(/^\s*\n/, '').replace(/\n$/, '');
        byFile[relPath] = body;
        order.push(relPath);
    }
    return { order, byFile };
}

function collectChangedInputs(name, files, builtByFile, builtOrder) {
    const cleanFiles = files.map(rel => rel.split('?')[0]);
    const changed = [];
    const missingInBundle = [];
    const orderMismatch = !arraysEqual(cleanFiles, builtOrder);

    for (const relPath of cleanFiles) {
        const built = builtByFile[relPath];
        if (built === undefined) {
            missingInBundle.push(relPath);
            continue;
        }
        const current = readWebFile(relPath);
        if (current !== built) changed.push(relPath);
    }

    const extras = builtOrder.filter(relPath => !cleanFiles.includes(relPath));
    if (missingInBundle.length) changed.push(...missingInBundle.map(p => `${p} (missing in bundle)`));
    if (extras.length) changed.push(...extras.map(p => `${p} (extra in bundle)`));
    if (orderMismatch) changed.push(`${name}: bundle source order differs from legacy-bundle-config.mjs`);

    return Array.from(new Set(changed));
}

function makeSelectiveRebuildCmd(changedInputs) {
    if (changedInputs.length === 0) return null;
    const paths = changedInputs
        .map(item => item.split(' (')[0])
        .filter(Boolean)
        .filter(item => !item.includes(': bundle source order differs'))
        .map(item => (item.startsWith('apps/web/') ? item : `apps/web/${item}`));
    if (paths.length === 0) return null;
    return `pnpm bundle:legacy:auto --files=${Array.from(new Set(paths)).join(',')}`;
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
    const warnings = [];

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
            const hasValidSourceFingerprint =
                typeof entry.sourceFingerprint === 'string' && /^[a-f0-9]{12}$/.test(entry.sourceFingerprint);
            if (!hasValidSourceFingerprint) {
                warnings.push(
                    `bundle "${name}": sourceFingerprint is missing/invalid. Rebuild legacy bundles to activate stale-source detection.`,
                );
            }
            const expectedFile = `${name}.bundle.${hash}.js`;
            if (file !== expectedFile) {
                errors.push(`bundle "${name}": file "${file}" expected to be "${expectedFile}"`);
            }
            const pubPath = resolve(PUB_DIR, file);
            if (!existsSync(pubPath)) {
                errors.push(`missing public asset: apps/web/public/${file} (manifest lists it)`);
                continue;
            }

            if (hasValidSourceFingerprint) {
                try {
                    const currentFingerprint = buildSourceFingerprint(LEGACY_BUNDLES[name]);
                    if (entry.sourceFingerprint !== currentFingerprint) {
                        const bundleContent = readFileSync(pubPath, 'utf8');
                        const parsed = parseBundleSources(bundleContent);
                        const changedInputs = collectChangedInputs(name, LEGACY_BUNDLES[name], parsed.byFile, parsed.order);
                        const selectiveCmd = makeSelectiveRebuildCmd(changedInputs);
                        const changedPrintable = changedInputs.length
                            ? changedInputs.join(', ')
                            : 'unable to detect exact files (run full rebuild)';
                        const fixHint = selectiveCmd
                            ? `\n  Fix: ${selectiveCmd}`
                            : '\n  Fix: pnpm --filter @heys/web run predev && pnpm bundle:legacy';
                        errors.push(
                            `bundle "${name}": source_fingerprint mismatch.\n  manifest: ${entry.sourceFingerprint}\n  current:  ${currentFingerprint}\n  Changed inputs: ${changedPrintable}${fixHint}`,
                        );
                    }
                } catch (e) {
                    errors.push(`bundle "${name}": cannot compute source fingerprint (${e.message})`);
                }
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

        // POST_BOOT_BUNDLES в index.html содержит ТОЛЬКО eager-стаб бандлы.
        // Lazy чанки (postboot-*-lazy) грузятся через facade (heys_game_facade,
        // heys_postboot3_facade, pi_facade) через lazy-manifest.json.
        const expectedPostEager = POSTBOOT_EAGER_NAMES.map(n => manifest[n]?.file).filter(Boolean);
        const pb = extractPostBootBundles(html);
        if (pb.error) {
            errors.push(pb.error);
        } else if (!arraysEqual(pb.files, expectedPostEager)) {
            errors.push(
                `index.html POST_BOOT_BUNDLES eager bundles mismatch.\n  expected: ${JSON.stringify(expectedPostEager)}\n  actual:   ${JSON.stringify(pb.files)}`,
            );
        }

        // Lazy бандлы проверяем через lazy-manifest.json (читается facade'ми
        // в рантайме). Хеши должны совпадать с bundle-manifest.json.
        const lazyM = readJson(LAZY_MANIFEST);
        if (lazyM.error) {
            errors.push(`lazy-manifest.json: ${lazyM.error}`);
        } else {
            for (const name of POSTBOOT_LAZY_NAMES) {
                const expected = manifest[name];
                const actual = lazyM.data[name];
                if (!expected) continue; // already reported above
                if (!actual) {
                    errors.push(`lazy-manifest.json missing entry for "${name}"`);
                    continue;
                }
                if (actual.file !== expected.file) {
                    errors.push(
                        `lazy-manifest.json "${name}" file mismatch.\n  bundle-manifest: ${expected.file}\n  lazy-manifest:   ${actual.file}`,
                    );
                }
            }
            // Extra keys in lazy-manifest (e.g. stale lazy bundle from older
            // build) are a soft mismatch.
            const lazyExtras = Object.keys(lazyM.data).filter(
                k => !POSTBOOT_LAZY_NAMES.includes(k),
            );
            for (const k of lazyExtras) {
                errors.push(`lazy-manifest.json has unknown bundle key "${k}"`);
            }
        }
    }

    if (errors.length > 0) {
        console.error('[verify-legacy-bundles] ❌ Failed:');
        for (const e of errors) console.error(`  - ${e}`);
        printFixHint();
        process.exit(1);
    }

    if (warnings.length > 0) {
        console.warn('[verify-legacy-bundles] ⚠ Warnings:');
        for (const w of warnings) console.warn(`  - ${w}`);
    }

    console.info('[verify-legacy-bundles] ✅ manifest, public assets, and index.html are in sync.');
    process.exit(0);
}

main();
