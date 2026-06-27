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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGACY_BUNDLES } from './legacy-bundle-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const INDEX_HTML = resolve(WEB_DIR, 'index.html');

// --ref=HEAD (used by pre-push): verify the COMMITTED state being pushed, not
// the working tree. In a shared/parallel checkout the working tree may carry
// another agent's uncommitted bundle-source WIP — reading it would falsely flag
// our self-consistent HEAD as "stale" and block the push. So for files that are
// dirty in the working tree we read their content from <ref> instead of disk.
// Clean files are byte-identical on disk and at <ref>, so we read those from
// disk (fast — no per-file git fork). Default (no --ref) reads the working tree
// as before (integration pass / CI run on a clean checkout).
const VERIFY_REF = (process.argv.find(a => a.startsWith('--ref=')) ?? '').slice('--ref='.length)
    || process.env.HEYS_VERIFY_REF
    || '';

let _dirtySetCache = null;
function getDirtySet() {
    if (_dirtySetCache) return _dirtySetCache;
    _dirtySetCache = new Set();
    if (!VERIFY_REF) return _dirtySetCache;
    try {
        const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
            cwd: ROOT, encoding: 'utf8',
        });
        for (const line of out.split('\n')) {
            const p = line.slice(3).trim().replace(/^"|"$/g, '');
            if (p) _dirtySetCache.add(p);
        }
    } catch {
        /* if git status fails, fall back to disk reads (empty dirty set) */
    }
    return _dirtySetCache;
}

// Read a repo-relative file. In ref mode, dirty files come from <ref> (committed
// state), clean files from disk. Throws on missing (caller may catch).
function readRepoFile(repoRel) {
    const clean = repoRel.split('?')[0];
    if (VERIFY_REF && getDirtySet().has(clean)) {
        return execFileSync('git', ['show', `${VERIFY_REF}:${clean}`], { cwd: ROOT, encoding: 'utf8' });
    }
    return readFileSync(resolve(ROOT, clean), 'utf8');
}

function repoFileExists(repoRel) {
    const clean = repoRel.split('?')[0];
    if (VERIFY_REF && getDirtySet().has(clean)) {
        try {
            execFileSync('git', ['cat-file', '-e', `${VERIFY_REF}:${clean}`], { cwd: ROOT, stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
    return existsSync(resolve(ROOT, clean));
}

const BUNDLE_NAMES = Object.keys(LEGACY_BUNDLES);
const BOOT_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('boot-'));
const POSTBOOT_NAMES = BUNDLE_NAMES.filter(n => n.startsWith('postboot-'));

const SHOW_FIX_HINT = !process.argv.includes('--no-fix-hint');

function readJsonRepo(repoRel) {
    if (!repoFileExists(repoRel)) {
        return { error: `missing file: ${repoRel}` };
    }
    try {
        return { ok: true, data: JSON.parse(readRepoFile(repoRel)) };
    } catch (e) {
        return { error: `invalid JSON: ${repoRel} (${e.message})` };
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
    return readRepoFile(`apps/web/${clean}`);
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
    console.error('[verify-legacy-bundles] Fix: prefer a selective rebuild when exact sources are known:');
    console.error('  pnpm bundle:legacy:auto --files=apps/web/heys_example.js');
    console.error('For integration/release scope only, run the full legacy rebuild:');
    console.error('  pnpm --filter @heys/web run predev && pnpm bundle:legacy');
    console.error('See: docs/AI_KEY_FILES.md (bundle-legacy.mjs, bundle-manifest.json)');
}

function main() {
    const errors = [];
    const warnings = [];

    const webM = readJsonRepo('apps/web/bundle-manifest.json');
    if (webM.error) errors.push(webM.error);

    const pubM = readJsonRepo('apps/web/public/bundle-manifest.json');
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
            if (!repoFileExists(`apps/web/public/${file}`)) {
                errors.push(`missing public asset: apps/web/public/${file} (manifest lists it)`);
                continue;
            }

            if (hasValidSourceFingerprint) {
                try {
                    const currentFingerprint = buildSourceFingerprint(LEGACY_BUNDLES[name]);
                    if (entry.sourceFingerprint !== currentFingerprint) {
                        const bundleContent = readRepoFile(`apps/web/public/${file}`);
                        const parsed = parseBundleSources(bundleContent);
                        const changedInputs = collectChangedInputs(name, LEGACY_BUNDLES[name], parsed.byFile, parsed.order);
                        const selectiveCmd = makeSelectiveRebuildCmd(changedInputs);
                        const changedPrintable = changedInputs.length
                            ? changedInputs.join(', ')
                            : 'unable to detect exact files (use integration/release rebuild)';
                        const fixHint = selectiveCmd
                            ? `\n  Fix: ${selectiveCmd}`
                            : '\n  Fix: integration/release scope only: pnpm --filter @heys/web run predev && pnpm bundle:legacy';
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

    if (!repoFileExists('apps/web/index.html')) {
        errors.push(`missing ${INDEX_HTML}`);
    } else if (manifest) {
        const html = readRepoFile('apps/web/index.html');

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

    if (warnings.length > 0) {
        console.warn('[verify-legacy-bundles] ⚠ Warnings:');
        for (const w of warnings) console.warn(`  - ${w}`);
    }

    console.info('[verify-legacy-bundles] ✅ manifest, public assets, and index.html are in sync.');
    process.exit(0);
}

main();
