#!/usr/bin/env node

// 2026-06-01: trigger full deploy after Fast-Path gap. Между c26dad88
// (последний full build на проде) и 47028c01 (HEAD) пять code-bearing
// коммитов попали в один push → workflow упал на whats-new validate →
// чинящий chore(release) push был классифицирован как release-only и
// загрузил только JSON. Этот комментарий — code-bearing diff чтобы
// classifier пустил Full Deploy путь.

import { execSync } from 'node:child_process';
import path from 'node:path';

import {
    LEGACY_BUNDLES,
    LEGACY_FULL_REBUILD_TRIGGERS,
    LEGACY_GENERATORS,
    LEGACY_GENERATOR_ORDER,
    isGeneratedFile,
} from './legacy-bundle-config.mjs';
import { getZoneForFile } from './agent-zones.mjs';

const ROOT_DIR = process.cwd();
const WEB_DIR = path.join(ROOT_DIR, 'apps/web');
const VALID_MODES = new Set(['default', 'agent-check', 'integration']);

function getMode() {
    const raw = (process.argv.find(arg => arg.startsWith('--mode=')) ?? '').slice('--mode='.length) || 'default';
    if (!VALID_MODES.has(raw)) {
        throw new Error(`[legacy-sync] Unknown --mode="${raw}". Use: default, agent-check, integration.`);
    }
    return raw;
}

function getCliFilesOverride() {
    const raw = (process.argv.find(arg => arg.startsWith('--files=')) ?? '').slice('--files='.length);
    if (!raw) return null;
    return raw.split(',').map(item => item.trim()).filter(Boolean);
}

function run(command, options = {}) {
    console.info(`[legacy-sync] $ ${command}`);
    execSync(command, {
        stdio: 'inherit',
        cwd: process.cwd(),
        ...options,
    });
}

function getStagedFiles() {
    const cliFiles = getCliFilesOverride();
    if (cliFiles) return cliFiles;

    const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
        encoding: 'utf8',
        cwd: ROOT_DIR,
    });
    return output
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function stripWebPrefix(filePath) {
    return filePath.startsWith('apps/web/') ? filePath.slice('apps/web/'.length) : null;
}

// 2026-05-29: explicit set из LEGACY_GENERATORS.output — single source of truth.
// Раньше использовался regex /^apps\/web\/heys_.*bundle.*\.js$/ который false-positive'ил
// hand-written source файлы с "bundle" в имени (heys_day_core_bundle_v1.js — это IIFE
// модуль входящий в boot-calc, НЕ generated). Из-за этого правки в source skipped
// rebuild → требовался manual pnpm bundle:legacy (см. c5fbc14a, манук-rebuild).
const LEGACY_GENERATED_OUTPUTS = new Set(
    Object.values(LEGACY_GENERATORS).map(g => g.output)
);

function isLegacyGeneratedFile(filePath) {
    return (
        filePath.startsWith('apps/web/public/') ||
        filePath === 'apps/web/bundle-manifest.json' ||
        filePath === 'apps/web/index.html' ||
        LEGACY_GENERATED_OUTPUTS.has(filePath)
    );
}

function isGeneratedStatusFile(filePath) {
    return isGeneratedFile(filePath);
}

function getDirtyGeneratedFiles() {
    // NB: do NOT `.trim()` — git status --porcelain uses leading whitespace as
    // status (e.g. " M file" = worktree-only modified, no index change). Trim
    // would silently drop the leading space and `.slice(3)` would chop the
    // first 1-2 chars of the filename, hiding the file from the dirty check.
    // This bug let foreign worktree edits to hybrid files like apps/web/index.html
    // slip through and get captured by the hook's later `git add -A` (incident
    // 2026-06-08: SEC-005 work pulled into chore(fingers): block_catalog commit
    // because index.html had unstaged manual edits the hook didn't detect).
    const output = execSync('git status --porcelain --untracked-files=all', {
        encoding: 'utf8',
        cwd: ROOT_DIR,
    });
    return output
        .split('\n')
        .filter((line) => line.length >= 3)
        .map((line) => line.slice(3).replace(/^"|"$/g, ''))
        .filter(isGeneratedStatusFile);
}

// Auto-stash foreign-dirty generated files (improvement B + C).
//
// Когда integration-rebuild сталкивается с dirty generated:
//   - Если они в зоне ПАРАЛЛЕЛЬНОГО агента (через agent-zones manifest) и
//     НЕ относятся к нашему staged source → stash их с marker'ом, продолжаем,
//     `.husky/post-commit` сделает pop.
//   - Если это наши изменения (или manifest не объявил зоны) → fail как раньше.
//
// Heuristics для "наши":
//   - Если staged source files есть → owning zone = их union; dirty generated
//     с тем же owning zone → НЕ stash (это последствие наших правок).
//   - Если staged source пустой → fail-safe не stash'им (не знаем кто хозяин).
function tryAutoStashForeignDirty() {
    const dirty = getDirtyGeneratedFiles();
    if (dirty.length === 0) return { stashed: false, files: [] };

    // Получить staged source files (НЕ generated).
    const stagedOutput = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: ROOT_DIR });
    const stagedFiles = stagedOutput.split('\n').filter(Boolean);
    const stagedSources = stagedFiles.filter(f => !isGeneratedStatusFile(f));

    // Если у нас НЕТ staged source — не знаем чьи это generated → safe fail.
    if (stagedSources.length === 0) return { stashed: false, files: dirty, reason: 'no-staged-source' };

    // Определяем "наши" zones по staged source.
    const ourZones = new Set(stagedSources.map(getZoneForFile).filter(Boolean));
    if (ourZones.size === 0) return { stashed: false, files: dirty, reason: 'unknown-zones' };

    // Все ли dirty generated файлы НЕ помечены нашей зоной? (Generated zone =
    // `_generated`, owner определяем не им, а по тому какой агент их раздул.
    // Берём конкретный hack: если рядом с dirty generated есть staged source
    // нашей зоны который мог бы его триггернуть — считаем «нашим», не stash'им.)
    //
    // Простая безопасная эвристика: если ВСЕ staged source — одной зоны, и
    // dirty generated — пересборка чужой работы (есть unstaged source файлы
    // в другой зоне) → stash dirty generated.
    const unstagedOutput = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8', cwd: ROOT_DIR });
    const unstagedSourcesByZone = new Map();
    unstagedOutput.split('\n').filter(line => line.length >= 3).forEach(line => {
        // Worktree-modified files: " M filename" or "M  filename" (we want either)
        const filePath = line.slice(3).replace(/^"|"$/g, '');
        if (isGeneratedStatusFile(filePath)) return;
        if (stagedFiles.includes(filePath)) return; // already staged
        const zone = getZoneForFile(filePath);
        if (!zone || zone === '_generated') return;
        if (!unstagedSourcesByZone.has(zone)) unstagedSourcesByZone.set(zone, []);
        unstagedSourcesByZone.get(zone).push(filePath);
    });

    // Foreign source = zones что НЕ наши.
    const foreignZones = [...unstagedSourcesByZone.keys()].filter(z => !ourZones.has(z));
    if (foreignZones.length === 0) {
        return { stashed: false, files: dirty, reason: 'no-foreign-source' };
    }

    // Есть foreign-зона с unstaged source → их generated dirty похожи на их работу.
    // Auto-stash dirty generated + foreign unstaged source как один пакет.
    const filesToStash = [
        ...dirty,
        ...foreignZones.flatMap(z => unstagedSourcesByZone.get(z))
    ];
    const stashLabel = `auto-stash:foreign-zones:${foreignZones.join(',')}`;
    try {
        execSync(
            `git stash push --include-untracked -m "${stashLabel}" -- ${filesToStash.map(f => JSON.stringify(f)).join(' ')}`,
            { encoding: 'utf8', cwd: ROOT_DIR, stdio: 'pipe' }
        );
        return { stashed: true, files: filesToStash, foreignZones, stashLabel };
    } catch (e) {
        return { stashed: false, files: dirty, reason: 'stash-failed: ' + (e.message || e) };
    }
}

function assertGeneratedBaselineClean() {
    const result = tryAutoStashForeignDirty();
    if (result.stashed) {
        console.info(`[legacy-sync] 🧹 Auto-stash чужих зон (${result.foreignZones.join(', ')}):`);
        result.files.forEach(f => console.info(`  - ${f}`));
        console.info(`[legacy-sync] post-commit hook вернёт через 'git stash pop' (${result.stashLabel}).`);
        return; // продолжаем integration rebuild с clean baseline
    }
    if (result.files.length === 0) return; // ничего не было dirty

    console.error('[legacy-sync] ❌ Generated files are already dirty before bundle sync.');
    if (result.reason) console.error(`[legacy-sync] auto-stash не применился: ${result.reason}`);
    console.error('[legacy-sync] Commit/stash/revert them first, then run integration rebuild from a clean baseline:');
    result.files.forEach(filePath => console.error(`  - ${filePath}`));
    process.exit(1);
}

function buildBundleSourceIndex() {
    const index = new Map();

    for (const [bundleName, files] of Object.entries(LEGACY_BUNDLES)) {
        for (const file of files) {
            if (!index.has(file)) index.set(file, new Set());
            index.get(file).add(bundleName);
        }
    }

    return index;
}

function buildReverseGeneratorDeps() {
    const reverse = new Map();

    for (const name of Object.keys(LEGACY_GENERATORS)) {
        reverse.set(name, new Set());
    }

    for (const [name, config] of Object.entries(LEGACY_GENERATORS)) {
        for (const dependency of config.dependsOn || []) {
            if (!reverse.has(dependency)) reverse.set(dependency, new Set());
            reverse.get(dependency).add(name);
        }
    }

    return reverse;
}

function detectInitialGenerators(stagedFiles) {
    const needed = new Set();

    for (const [name, config] of Object.entries(LEGACY_GENERATORS)) {
        const relatedFiles = new Set([config.script, ...config.sources]);
        for (const filePath of stagedFiles) {
            if (relatedFiles.has(filePath)) {
                needed.add(name);
            }
        }
    }

    return needed;
}

function expandAffectedGenerators(initialGenerators) {
    const reverseDeps = buildReverseGeneratorDeps();
    const expanded = new Set(initialGenerators);
    const queue = [...initialGenerators];

    while (queue.length > 0) {
        const current = queue.shift();
        const dependents = reverseDeps.get(current) || new Set();
        for (const dependent of dependents) {
            if (!expanded.has(dependent)) {
                expanded.add(dependent);
                queue.push(dependent);
            }
        }
    }

    return expanded;
}

function detectAffectedFinalBundles(stagedFiles, generators) {
    const bundleSourceIndex = buildBundleSourceIndex();
    const finalBundles = new Set();

    for (const filePath of stagedFiles) {
        const relPath = stripWebPrefix(filePath);
        if (!relPath) continue;
        const bundles = bundleSourceIndex.get(relPath);
        if (!bundles) continue;
        bundles.forEach(bundleName => finalBundles.add(bundleName));
    }

    for (const generatorName of generators) {
        const relOutput = stripWebPrefix(LEGACY_GENERATORS[generatorName].output);
        const bundles = bundleSourceIndex.get(relOutput);
        if (!bundles) continue;
        bundles.forEach(bundleName => finalBundles.add(bundleName));
    }

    return [...finalBundles].sort();
}

function hasRelevantLegacyChanges(stagedFiles) {
    if (stagedFiles.some(filePath => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath))) return true;

    const generators = detectInitialGenerators(stagedFiles);
    if (generators.size > 0) return true;

    return stagedFiles.some(filePath => {
        if (isLegacyGeneratedFile(filePath)) return false;
        const relPath = stripWebPrefix(filePath);
        return !!relPath && Object.values(LEGACY_BUNDLES).some(files => files.includes(relPath));
    });
}

function stageGeneratedOutputs() {
    // Bundle outputs берём ДИНАМИЧЕСКИ из LEGACY_GENERATORS — раньше тут был
    // hardcoded список который при добавлении нового generator (fingers, 2026-06-01)
    // не покрывал новый output, и при коммите изменения в source бандл не
    // стейджился → на push уходили исходники без обновлённого артефакта.
    const generatorOutputs = Object.values(LEGACY_GENERATORS)
        .map(g => g.output)
        .join(' ');
    const fixedPaths = 'apps/web/public apps/web/bundle-manifest.json apps/web/index.html';
    run(`git add -A ${fixedPaths} ${generatorOutputs}`);
}

function main() {
    const mode = getMode();
    const stagedFiles = getStagedFiles();
    const isTestMode = !!getCliFilesOverride();

    // A-light (improvement A): source-only opt-in для commit'а. Skipает bundle
    // rebuild на этом коммите — generated собираются в CI на deploy, либо в
    // следующем integration-mode commit'е. Полезно для атомарных source-only
    // коммитов в параллельных потоках, чтобы не дёргать generated.
    // Активируется через env HEYS_COMMIT_SOURCE_ONLY=1.
    if (process.env.HEYS_COMMIT_SOURCE_ONLY === '1') {
        console.info('[legacy-sync] 🪶 source-only mode (HEYS_COMMIT_SOURCE_ONLY=1) — пропускаю bundle rebuild.');
        console.info('[legacy-sync] Generated артефакты соберутся в CI или следующем integration-коммите.');
        return;
    }

    if (stagedFiles.length === 0) {
        console.info('[legacy-sync] Нет staged-файлов — пропускаю sync legacy bundles.');
        return;
    }

    if (isTestMode) {
        console.info('[legacy-sync] 🧪 Test mode via --files (без чтения git diff --cached).');
    }
    if (mode !== 'default') {
        console.info(`[legacy-sync] mode=${mode}`);
    }

    const relevant = stagedFiles.filter(filePath => !isLegacyGeneratedFile(filePath));

    if (!hasRelevantLegacyChanges(relevant)) {
        console.info('[legacy-sync] Legacy-исходники не затронуты — bundle sync не нужен.');
        return;
    }

    console.info('[legacy-sync] Обнаружены изменения в legacy-исходниках:');
    relevant.forEach(filePath => console.info(`  - ${filePath}`));

    if (!isTestMode && mode === 'integration') {
        assertGeneratedBaselineClean();
    }

    if (relevant.some(filePath => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath))) {
        console.info('[legacy-sync] ⚙️ Изменён core bundling config — запускаю полный rebuild.');
        if (mode === 'agent-check' || isTestMode) {
            console.info('[legacy-sync] 🔧 Would run full legacy rebuild: pnpm --filter @heys/web run predev && pnpm bundle:legacy');
            console.info(mode === 'agent-check'
                ? '[legacy-sync] ✅ Agent check only: generated artifacts are left for integration-pass.'
                : '[legacy-sync] ✅ Test mode: generated artifacts are left untouched.');
            return;
        }
        run('pnpm --filter @heys/web run predev');
        run('pnpm bundle:legacy');
        stageGeneratedOutputs();
        console.info('[legacy-sync] ✅ Legacy bundles пересобраны и добавлены в staging.');
        return;
    }

    const initialGenerators = detectInitialGenerators(relevant);
    const generatorsToRun = expandAffectedGenerators(initialGenerators);
    const orderedGenerators = LEGACY_GENERATOR_ORDER.filter(name => generatorsToRun.has(name));
    const finalBundles = detectAffectedFinalBundles(relevant, generatorsToRun);

    if (mode === 'agent-check') {
        if (orderedGenerators.length > 0) {
            console.info(`[legacy-sync] 🔧 Would run intermediate generators at integration: ${orderedGenerators.join(', ')}`);
        }
        if (finalBundles.length > 0) {
            console.info(`[legacy-sync] 📦 Would rebuild final legacy bundles at integration: ${finalBundles.join(', ')}`);
        }
        console.info('[legacy-sync] ✅ Agent check only: generated artifacts are left for integration-pass.');
        return;
    }

    if (orderedGenerators.length > 0) {
        console.info(`[legacy-sync] 🔧 Intermediate generators: ${orderedGenerators.join(', ')}`);
        orderedGenerators.forEach((name) => {
            const relativeScript = LEGACY_GENERATORS[name].script.replace(/^apps\/web\//, '');
            run(`node ${relativeScript}`, { cwd: WEB_DIR });
        });
    }

    if (finalBundles.length > 0) {
        console.info(`[legacy-sync] 📦 Final legacy bundles: ${finalBundles.join(', ')}`);
        run(`node scripts/bundle-legacy.mjs --bundle=${finalBundles.join(',')}`);
    }

    if (!isTestMode) {
        stageGeneratedOutputs();
    }

    console.info(isTestMode
        ? '[legacy-sync] ✅ Legacy bundles selectively rebuilt (test mode, без staging).'
        : '[legacy-sync] ✅ Legacy bundles пересобраны и добавлены в staging.');
}

main();
