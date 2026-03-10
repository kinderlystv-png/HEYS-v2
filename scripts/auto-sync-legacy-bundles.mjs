#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';

import {
    LEGACY_BUNDLES,
    LEGACY_FULL_REBUILD_TRIGGERS,
    LEGACY_GENERATORS,
    LEGACY_GENERATOR_ORDER,
} from './legacy-bundle-config.mjs';

const ROOT_DIR = process.cwd();
const WEB_DIR = path.join(ROOT_DIR, 'apps/web');

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

function isLegacyGeneratedFile(filePath) {
    return (
        filePath.startsWith('apps/web/public/') ||
        filePath === 'apps/web/bundle-manifest.json' ||
        filePath === 'apps/web/index.html' ||
        filePath === 'apps/web/public/sw.js' ||
        /^apps\/web\/heys_.*bundle.*\.js$/.test(filePath)
    );
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
    run('git add -A apps/web/public apps/web/bundle-manifest.json apps/web/index.html apps/web/heys_advice_bundle_v1.js apps/web/heys_day_meals_bundle_v1.js apps/web/heys_day_bundle_v1.js', { shell: '/bin/bash' });
}

function main() {
    const stagedFiles = getStagedFiles();
    const isTestMode = !!getCliFilesOverride();

    if (stagedFiles.length === 0) {
        console.info('[legacy-sync] Нет staged-файлов — пропускаю sync legacy bundles.');
        return;
    }

    if (isTestMode) {
        console.info('[legacy-sync] 🧪 Test mode via --files (без чтения git diff --cached).');
    }

    const relevant = stagedFiles.filter(filePath => !isLegacyGeneratedFile(filePath));

    if (!hasRelevantLegacyChanges(relevant)) {
        console.info('[legacy-sync] Legacy-исходники не затронуты — bundle sync не нужен.');
        return;
    }

    console.info('[legacy-sync] Обнаружены изменения в legacy-исходниках:');
    relevant.forEach(filePath => console.info(`  - ${filePath}`));

    if (relevant.some(filePath => LEGACY_FULL_REBUILD_TRIGGERS.has(filePath))) {
        console.info('[legacy-sync] ⚙️ Изменён core bundling config — запускаю полный rebuild.');
        run('pnpm --filter @heys/web run predev');
        run('pnpm bundle:legacy');
        stageGeneratedOutputs();
        console.info('[legacy-sync] ✅ Legacy bundles пересобраны и добавлены в staging.');
        return;
    }

    const initialGenerators = detectInitialGenerators(relevant);
    const generatorsToRun = expandAffectedGenerators(initialGenerators);
    const orderedGenerators = LEGACY_GENERATOR_ORDER.filter(name => generatorsToRun.has(name));

    if (orderedGenerators.length > 0) {
        console.info(`[legacy-sync] 🔧 Intermediate generators: ${orderedGenerators.join(', ')}`);
        orderedGenerators.forEach((name) => {
            const relativeScript = LEGACY_GENERATORS[name].script.replace(/^apps\/web\//, '');
            run(`node ${relativeScript}`, { cwd: WEB_DIR });
        });
    }

    const finalBundles = detectAffectedFinalBundles(relevant, generatorsToRun);

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