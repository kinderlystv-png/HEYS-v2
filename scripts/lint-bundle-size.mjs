#!/usr/bin/env node
/**
 * lint-bundle-size.mjs
 *
 * Bundle size guard (P0-D, 2026-05-22). Сравнивает текущие размеры boot-*
 * бандлов с baseline в apps/web/__perf_baselines__/boot-split-baselines.json
 * (раздел p0d_post_optimization). FAIL если рост >+5% хотя бы по одному
 * бандлу.
 *
 * Используется в .husky/pre-push. Override: добавить [bundle-size-ok] в
 * commit message — push продолжится с warning.
 *
 * Modes:
 *   node scripts/lint-bundle-size.mjs                 — check (default)
 *   node scripts/lint-bundle-size.mjs --update-baseline — пересохранить
 *     текущие размеры как новый p0d_post_optimization (используй после
 *     оправданного роста, с пометкой [bundle-size-ok])
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BASELINE_PATH = resolve(ROOT, 'apps/web/__perf_baselines__/boot-split-baselines.json');
const MANIFEST_PATH = resolve(ROOT, 'apps/web/public/bundle-manifest.json');
const TRACKED_BUNDLES = ['boot-init', 'boot-core', 'boot-calc', 'boot-day', 'boot-app'];
const UPDATE_MODE = process.argv.includes('--update-baseline');

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1_048_576).toFixed(2)}MB`;
}

function loadJSON(path) {
    if (!existsSync(path)) {
        console.error(`[bundle-size-guard] ❌ Файл не найден: ${path}`);
        process.exit(1);
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

function getCommitMessage() {
    try {
        return execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function getCurrentSizes(manifest) {
    const sizes = {};
    for (const name of TRACKED_BUNDLES) {
        const entry = manifest[name];
        if (!entry || typeof entry.size !== 'number') {
            console.error(`[bundle-size-guard] ❌ В manifest нет записи для "${name}". Запусти pnpm bundle:legacy.`);
            process.exit(1);
        }
        sizes[name] = entry.size;
    }
    return sizes;
}

function updateBaseline(baseline, currentSizes) {
    const post = baseline.p0d_post_optimization || {};
    post._captured = new Date().toISOString().slice(0, 10) + ' (baseline updated via --update-baseline)';
    post.boot_bundles_uncompressed = { ...currentSizes };
    post.boot_total_uncompressed = Object.values(currentSizes).reduce((sum, n) => sum + n, 0);
    baseline.p0d_post_optimization = post;
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    console.info('[bundle-size-guard] ✅ Baseline обновлён:');
    for (const [name, size] of Object.entries(currentSizes)) {
        console.info(`  ${name.padEnd(12)} ${fmtSize(size)}`);
    }
    console.info(`  total       ${fmtSize(post.boot_total_uncompressed)}`);
}

function main() {
    const baseline = loadJSON(BASELINE_PATH);
    const manifest = loadJSON(MANIFEST_PATH);
    const current = getCurrentSizes(manifest);

    if (UPDATE_MODE) {
        updateBaseline(baseline, current);
        return;
    }

    const post = baseline.p0d_post_optimization;
    if (!post || !post.boot_bundles_uncompressed) {
        console.error('[bundle-size-guard] ❌ В baseline нет раздела p0d_post_optimization.boot_bundles_uncompressed');
        process.exit(1);
    }

    const thresholdPct = baseline.p0d_size_guard_threshold_percent || 5;
    const baselineSizes = post.boot_bundles_uncompressed;
    const violations = [];
    const report = [];

    for (const name of TRACKED_BUNDLES) {
        const baseSize = baselineSizes[name];
        const curSize = current[name];
        if (typeof baseSize !== 'number') {
            console.warn(`[bundle-size-guard] ⚠️  В baseline нет "${name}" — пропускаю`);
            continue;
        }
        const deltaPct = ((curSize - baseSize) / baseSize) * 100;
        const sign = deltaPct >= 0 ? '+' : '';
        report.push(`  ${name.padEnd(12)} ${fmtSize(curSize)}  (baseline ${fmtSize(baseSize)}, ${sign}${deltaPct.toFixed(1)}%)`);
        if (deltaPct > thresholdPct) {
            violations.push({ name, baseSize, curSize, deltaPct });
        }
    }

    console.info('[bundle-size-guard] 📦 Проверка размеров critical-path бандлов:');
    for (const line of report) console.info(line);

    if (violations.length === 0) {
        console.info(`[bundle-size-guard] ✅ Все бандлы в пределах +${thresholdPct}% от baseline`);
        return;
    }

    const commitMsg = getCommitMessage();
    if (commitMsg.includes('[bundle-size-ok]')) {
        console.warn(`\n[bundle-size-guard] ⚠️  Превышение +${thresholdPct}% обнаружено, но [bundle-size-ok] в commit message — пропускаю.`);
        for (const v of violations) {
            console.warn(`  ${v.name}: ${fmtSize(v.curSize)} (was ${fmtSize(v.baseSize)}, +${v.deltaPct.toFixed(1)}%)`);
        }
        console.warn('  💡 После merge запусти: node scripts/lint-bundle-size.mjs --update-baseline');
        return;
    }

    console.error(`\n[bundle-size-guard] ❌ Критическая ошибка: ${violations.length} бандл(ов) выросло >+${thresholdPct}% от baseline:`);
    for (const v of violations) {
        console.error(`  ${v.name}: ${fmtSize(v.curSize)} (was ${fmtSize(v.baseSize)}, +${v.deltaPct.toFixed(1)}%)`);
    }
    console.error('\n💡 Что делать:');
    console.error('  • Если рост случайный (например, импорт большой либы) — найди и убери лишнее.');
    console.error('  • Если рост оправдан (новая фича, ленивая загрузка невозможна):');
    console.error('    1. Добавь в commit message: [bundle-size-ok]');
    console.error('    2. После merge: node scripts/lint-bundle-size.mjs --update-baseline');
    console.error('    3. Закоммить обновлённый apps/web/__perf_baselines__/boot-split-baselines.json');
    process.exit(1);
}

main();
