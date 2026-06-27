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

function getStagedSourceFiles() {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: ROOT_DIR });
    return output
        .split('\n')
        .filter(Boolean)
        .filter(filePath => !isGeneratedStatusFile(filePath));
}

function getUnstagedSourceFiles() {
    const output = execSync('git status --porcelain --untracked-files=all', {
        encoding: 'utf8',
        cwd: ROOT_DIR,
    });
    return output
        .split('\n')
        .filter(line => line.length >= 3)
        .filter(line => line[1] !== ' ' || line.startsWith('??'))
        .map(line => line.slice(3).replace(/^"|"$/g, ''))
        .filter(filePath => !isGeneratedStatusFile(filePath));
}

function describeGeneratedBaselineConflict(dirtyFiles) {
    const stagedSources = getStagedSourceFiles();
    console.error('[legacy-sync] ❌ Generated files are already dirty before bundle sync.');
    console.error('[legacy-sync] Авто-stash чужих зон отключён: hooks/scripts не должны прятать,');
    console.error('[legacy-sync] откатывать или удалять чужой WIP без прямой команды пользователя.');
    console.error('[legacy-sync] Dirty generated files:');
    dirtyFiles.forEach(filePath => console.error(`  - ${filePath}`));

    if (stagedSources.length > 0) {
        console.error('[legacy-sync] Current staged source files:');
        stagedSources.forEach(filePath => console.error(`  - ${filePath}`));
    }

    console.error('[legacy-sync] Safe options:');
    console.error('[legacy-sync]   1) если это твои preview-generated файлы — убери или пересобери только свой preview scope отдельным явным действием;');
    console.error('[legacy-sync]   2) если это чужой/неясный WIP — остановись, покажи scope владельцу и используй worktree/integration-pass;');
    console.error('[legacy-sync]   3) если нужно принять весь dirty generated scope в shipping — сделай это отдельным осознанным integration/release проходом;');
    console.error('[legacy-sync]   4) не используй stash/restore/checkout/reset для чужого scope без прямой команды.');
}

function getGeneratedBaselineConflict() {
    const dirty = getDirtyGeneratedFiles();
    return { dirty };
}

function assertGeneratedBaselineClean() {
    const result = getGeneratedBaselineConflict();
    if (result.dirty.length === 0) return;

    describeGeneratedBaselineConflict(result.dirty);
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

function getAffectedLegacyOutputs(sourceFiles) {
    const initialGenerators = detectInitialGenerators(sourceFiles);
    const generatorsToRun = expandAffectedGenerators(initialGenerators);
    const finalBundles = detectAffectedFinalBundles(sourceFiles, generatorsToRun);
    return new Set([
        ...[...generatorsToRun].map(name => `generator:${name}`),
        ...finalBundles.map(name => `bundle:${name}`),
    ]);
}

function intersects(a, b) {
    for (const value of a) {
        if (b.has(value)) return true;
    }
    return false;
}

function assertNoUnstagedLegacyInputContamination(stagedRelevantFiles) {
    const unstagedSources = getUnstagedSourceFiles();
    const unstagedRelevant = unstagedSources.filter(filePath => hasRelevantLegacyChanges([filePath]));
    if (unstagedRelevant.length === 0) return;

    const stagedTouchesFullRebuild = stagedRelevantFiles.some(filePath => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath));
    const unstagedTouchesFullRebuild = unstagedRelevant.some(filePath => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath));
    const stagedOutputs = getAffectedLegacyOutputs(stagedRelevantFiles);

    const risky = unstagedRelevant.filter((filePath) => {
        if (stagedTouchesFullRebuild || unstagedTouchesFullRebuild) return true;
        return intersects(getAffectedLegacyOutputs([filePath]), stagedOutputs);
    });
    if (risky.length === 0) return;

    console.error('[legacy-sync] ❌ Unstaged legacy source would affect the same generated output.');
    console.error('[legacy-sync] Rebuild reads files from the worktree, not from the staged index.');
    console.error('[legacy-sync] Committing generated artifacts now could include code that is not in this commit.');
    console.error('[legacy-sync] Current staged legacy source:');
    stagedRelevantFiles.forEach(filePath => console.error(`  - ${filePath}`));
    console.error('[legacy-sync] Risky unstaged legacy source:');
    risky.forEach(filePath => console.error(`  - ${filePath}`));
    console.error('[legacy-sync] Safe options:');
    console.error('[legacy-sync]   1) include these source files only if user/integrator explicitly accepts the combined scope;');
    console.error('[legacy-sync]   2) move this commit to an isolated worktree;');
    console.error('[legacy-sync]   3) run a separate integration pass that accepts the combined dirty scope.');
    process.exit(1);
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
    // rebuild на этом коммите — generated собираются в следующем явно
    // разрешённом integration/release проходе. Полезно для атомарных source-only
    // коммитов в параллельных потоках, чтобы не дёргать generated.
    // Активируется через env HEYS_COMMIT_SOURCE_ONLY=1.
    if (process.env.HEYS_COMMIT_SOURCE_ONLY === '1') {
        console.info('[legacy-sync] 🪶 source-only mode (HEYS_COMMIT_SOURCE_ONLY=1) — пропускаю bundle rebuild.');
        console.info('[legacy-sync] Generated артефакты соберутся в следующем integration/release проходе.');
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
        assertNoUnstagedLegacyInputContamination(relevant);
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
