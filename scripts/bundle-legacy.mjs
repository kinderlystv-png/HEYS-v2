#!/usr/bin/env node
/**
 * bundle-legacy.mjs — HEYS Legacy Bundle Builder
 *
 * Конкатенирует legacy JS-скрипты в 8 бандлов с content-hash.
 * Выход: apps/web/public/*.bundle.{hash}.js + apps/web/bundle-manifest.json
 *
 * Запуск:
 *   node scripts/bundle-legacy.mjs             — собрать все бандлы
 *   node scripts/bundle-legacy.mjs --dry-run   — показать без записи
 *   node scripts/bundle-legacy.mjs --bundle=boot-core — один бандл
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { LEGACY_BUNDLES } from './legacy-bundle-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');
const PUB_DIR = resolve(WEB_DIR, 'public');
const MANIFEST = resolve(WEB_DIR, 'bundle-manifest.json');

const INDEX_HTML = resolve(WEB_DIR, 'index.html');

const DRY_RUN = process.argv.includes('--dry-run');
const SELECTED_BUNDLES = (() => {
    const raw = (process.argv.find(a => a.startsWith('--bundle=')) ?? '').slice(9);
    if (!raw) return [];
    return raw.split(',').map(item => item.trim()).filter(Boolean);
})();

// ─── Bundle definitions ────────────────────────────────────────────────────
// Порядок файлов строго соответствует index.html.
// Аудит 2026-02-25: DEFER ORDER: PERFECT MATCH (151/151),
//                   POSTBOOT CONTENT: PERFECT MATCH (93/93).
// Пути — относительно apps/web/. Query-строки (?v=…) в именах не нужны —
// стрипаются автоматически при чтении файла с диска.

const BUNDLES = LEGACY_BUNDLES;

// ─── Helpers ───────────────────────────────────────────────────────────────

function contentHash(str) {
    return createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1_048_576).toFixed(2)}MB`;
}

function readWebFile(relPath) {
    const clean = relPath.split('?')[0];
    const full = resolve(WEB_DIR, clean);
    if (!existsSync(full)) throw new Error(`Not found: ${full}`);
    return readFileSync(full, 'utf8');
}

function readExistingManifest() {
    if (!existsSync(MANIFEST)) return {};
    try {
        return JSON.parse(readFileSync(MANIFEST, 'utf8'));
    } catch {
        return {};
    }
}

// ─── Build one bundle ──────────────────────────────────────────────────────

function buildBundle(name, files) {
    const parts = [];
    const missing = [];

    for (const f of files) {
        try {
            const src = readWebFile(f);
            parts.push(`\n/* ===== ${f} ===== */\n${src}`);
        } catch {
            missing.push(f);
        }
    }

    if (missing.length) {
        console.error(`\n  Missing files:\n${missing.map(f => `    ${f}`).join('\n')}`);
        throw new Error(`${name}: ${missing.length} file(s) missing`);
    }

    const content = parts.join('\n');
    const hash = contentHash(content);
    const outName = `${name}.bundle.${hash}.js`;
    const outPath = resolve(PUB_DIR, outName);
    const size = Buffer.byteLength(content, 'utf8');

    if (!DRY_RUN) {
        writeFileSync(outPath, content, 'utf8');

        // 🛡️ Syntax validation — catch broken bundles before deploy
        try {
            execSync(`node --check "${outPath}"`, { stdio: 'pipe' });
        } catch (err) {
            const stderr = err.stderr ? err.stderr.toString() : '';
            // Count parens to give actionable hint
            let opens = 0, closes = 0;
            for (const ch of content) {
                if (ch === '(') opens++;
                if (ch === ')') closes++;
            }
            console.error(`\n[bundle-legacy] ❌ SYNTAX ERROR in ${outName}!`);
            console.error(`  Paren balance: ( = ${opens}, ) = ${closes}, diff = ${opens - closes}`);
            if (stderr) console.error(`  Node says: ${stderr.split('\n')[0]}`);
            // Find which source file is probably broken
            const errorLine = stderr.match(/:([0-9]+)/);
            if (errorLine) {
                const lineNum = parseInt(errorLine[1], 10);
                const lines = content.split('\n');
                for (let i = lineNum - 1; i >= 0; i--) {
                    if (lines[i] && lines[i].includes('===== heys_')) {
                        console.error(`  Likely broken source: ${lines[i].replace(/[\/\* =]+/g, '').trim()}`);
                        break;
                    }
                }
            }
            throw new Error(`${name}: bundle has syntax errors — fix source files before deploying`);
        }
    }

    return { name, file: outName, hash, fileCount: files.length, size };
}

// ─── Clean stale bundles ───────────────────────────────────────────────────

function cleanOldBundles(selectedNames) {
    if (!existsSync(PUB_DIR)) return;
    const pattern = /^(boot|postboot)-[\w-]+\.bundle\.[a-f0-9]{12}\.js(\.gz)?$/;
    const old = readdirSync(PUB_DIR).filter(f => {
        if (!pattern.test(f)) return false;
        if (selectedNames?.length) return selectedNames.some(name => f.startsWith(name + '.bundle.'));
        return true;
    });
    if (old.length === 0) return;
    console.info(`\n[bundle-legacy] 🧹 Removing ${old.length} stale bundle(s):`);
    for (const f of old) {
        unlinkSync(resolve(PUB_DIR, f));
        console.info(`  removed: ${f}`);
    }
}

// ─── Sync index.html ───────────────────────────────────────────────────────

/**
 * Обновляет ссылки на постбут-бандлы в index.html.
 * Заменяет старые хэши в POST_BOOT_BUNDLES на новые из manifest.
 * Также обновляет ссылки на boot-*.bundle.*.js в <script defer src="...">
 * @param {Record<string, {file: string}>} manifest
 */
function syncIndexHtml(manifest) {
    if (!existsSync(INDEX_HTML)) {
        console.warn('[bundle-legacy] ⚠️  index.html not found, skipping sync');
        return;
    }

    let html = readFileSync(INDEX_HTML, 'utf8');
    let changed = 0;

    for (const [name, entry] of Object.entries(manifest)) {
        // Заменяем любые вхождения bundle-имени этого типа (старый хэш → новый)
        const pattern = new RegExp(
            name.replace(/[-]/g, '[-]') + '\\.bundle\\.[a-f0-9]{12}\\.js',
            'g',
        );
        const updated = html.replace(pattern, (old) => {
            if (old !== entry.file) {
                changed++;
                console.info(`  index.html: ${old} → ${entry.file}`);
            }
            return entry.file;
        });
        html = updated;
    }

    if (changed > 0) {
        writeFileSync(INDEX_HTML, html, 'utf8');
        console.info(`[bundle-legacy] 📝 index.html updated (${changed} hash(es) replaced)`);
    } else {
        console.info('[bundle-legacy] 📝 index.html already up-to-date');
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.info('[bundle-legacy] 🚀 HEYS Legacy Bundle Builder');
    console.info(`  web dir : ${WEB_DIR}`);
    console.info(`  output  : ${PUB_DIR}`);
    if (DRY_RUN) console.info('  mode    : DRY RUN (no files written)');
    if (SELECTED_BUNDLES.length) console.info(`  filter  : ${SELECTED_BUNDLES.join(', ')}`);

    if (!DRY_RUN) {
        mkdirSync(PUB_DIR, { recursive: true });
        cleanOldBundles(SELECTED_BUNDLES);
    }

    const entries = Object.entries(BUNDLES);
    const toRun = SELECTED_BUNDLES.length ? entries.filter(([n]) => SELECTED_BUNDLES.includes(n)) : entries;

    if (toRun.length === 0) {
        console.error(`[bundle-legacy] ❌ Unknown bundle filter "${SELECTED_BUNDLES.join(', ')}". Available: ${Object.keys(BUNDLES).join(', ')}`);
        process.exit(1);
    }

    const manifest = SELECTED_BUNDLES.length ? readExistingManifest() : {};
    const builtEntries = {};
    const t0 = Date.now();

    for (const [name, files] of toRun) {
        process.stdout.write(`  📦 ${name.padEnd(22)} (${String(files.length).padStart(3)} files) ... `);
        const r = buildBundle(name, files);   // throws on missing files → exits
        const entry = {
            file: r.file,
            hash: r.hash,
            fileCount: r.fileCount,
            size: r.size,
            builtAt: new Date().toISOString(),
        };
        builtEntries[r.name] = entry;
        manifest[r.name] = entry;
        console.info(`✅ ${r.file}  ${fmtSize(r.size)}`);
    }

    if (!DRY_RUN) {
        writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
        console.info(`\n[bundle-legacy] 📋 Manifest → ${MANIFEST}`);

        // Копируем манифест в public/ — SW читает /bundle-manifest.json при install
        // для proactive precache boot-бандлов (без этого файла SW не видит бандлы)
        const PUBLIC_MANIFEST = resolve(PUB_DIR, 'bundle-manifest.json');
        writeFileSync(PUBLIC_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
        console.info(`[bundle-legacy] 📋 Manifest → ${PUBLIC_MANIFEST} (SW copy)`);

        // Обновляем CACHE_VERSION в sw.js — новое значение → браузер видит изменение SW
        // → переустанавливает SW → precache загружает свежие boot-бандлы
        const SW_PATH = resolve(PUB_DIR, 'sw.js');
        if (existsSync(SW_PATH)) {
            const swContent = readFileSync(SW_PATH, 'utf8');
            const newVersion = `heys-${Date.now()}`;
            const updated = swContent.replace(
                /const CACHE_VERSION = 'heys-\d+';/,
                `const CACHE_VERSION = '${newVersion}';`,
            );
            if (updated !== swContent) {
                writeFileSync(SW_PATH, updated, 'utf8');
                console.info(`[bundle-legacy] 🔄 sw.js CACHE_VERSION → ${newVersion}`);
            } else {
                console.warn('[bundle-legacy] ⚠️ sw.js CACHE_VERSION pattern not found — проверь вручную');
            }
        }

        syncIndexHtml(builtEntries);
    }

    // ── Step: Pre-compress bundles with gzip ─────────────────────────────
    // Yandex Object Storage не сжимает автоматически.
    // Создаём .gz рядом с .js → CI загружает .gz с Content-Encoding: gzip.
    // Браузер распаковывает прозрачно; SW кэширует уже распакованный response.
    if (!DRY_RUN) {
        console.info('\n[bundle-legacy] 🗜️  Pre-compressing bundles (gzip -9)...');
        let totalRaw = 0;
        let totalGz = 0;

        for (const entry of Object.values(builtEntries)) {
            const jsPath = resolve(PUB_DIR, entry.file);
            const raw = readFileSync(jsPath);
            const gz = gzipSync(raw, { level: 9 });
            writeFileSync(jsPath + '.gz', gz);
            totalRaw += raw.length;
            totalGz += gz.length;
            const pct = (100 - (gz.length / raw.length) * 100).toFixed(0);
            console.info(`  ${entry.file}: ${fmtSize(raw.length)} → ${fmtSize(gz.length)} (${pct}% saved)`);
        }

        // Also compress react-bundle.js (blocking script, ~139KB → ~45KB)
        const reactPath = resolve(WEB_DIR, 'react-bundle.js');
        if (existsSync(reactPath)) {
            const raw = readFileSync(reactPath);
            const gz = gzipSync(raw, { level: 9 });
            writeFileSync(resolve(PUB_DIR, 'react-bundle.js.gz'), gz);
            totalRaw += raw.length;
            totalGz += gz.length;
            const pct = (100 - (gz.length / raw.length) * 100).toFixed(0);
            console.info(`  react-bundle.js: ${fmtSize(raw.length)} → ${fmtSize(gz.length)} (${pct}% saved)`);
        }

        console.info(`[bundle-legacy] 🗜️  Total: ${fmtSize(totalRaw)} → ${fmtSize(totalGz)} (${(100 - (totalGz / totalRaw) * 100).toFixed(0)}% saved)`);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalSize = Object.values(builtEntries).reduce((s, v) => s + v.size, 0);
    console.info(`[bundle-legacy] ✅ Done in ${elapsed}s  total ${fmtSize(totalSize)}`);
}

main().catch(err => {
    console.error('\n[bundle-legacy] ❌ Fatal:', err.message);
    process.exit(1);
});
