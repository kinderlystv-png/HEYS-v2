#!/usr/bin/env node
/**
 * release-prepare-and-commit.mjs
 *
 * One-shot helper for the explicit "before push" flow:
 * 1. Shows preview of current/suggested What's New text
 * 2. Runs interactive preparation with screenshot confirmation
 * 3. Validates the entry
 * 4. Stages whats-new metadata/assets
 * 5. Creates a follow-up commit with a standard message
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isReleaseMetaOnlyFile } from './prepare-release.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const WHATS_NEW_JSON = path.join(ROOT_DIR, 'apps', 'web', 'public', 'whats-new.json');
const WHATS_NEW_DIR = path.join(ROOT_DIR, 'apps', 'web', 'public', 'whats-new');
const PREPARE_RELEASE_SCRIPT = path.join(__dirname, 'prepare-release.mjs');

function writeLine(text = '') {
    process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
    process.stderr.write(`${text}\n`);
}

function run(command, options = {}) {
    writeLine(`$ ${command}`);
    execSync(command, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        ...options,
    });
}

function runInteractiveNodeScript(scriptPath, args = []) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: node ${path.relative(ROOT_DIR, scriptPath)} ${args.join(' ')}`.trim());
    }
}

function loadWhatsNew() {
    const raw = fs.readFileSync(WHATS_NEW_JSON, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.releases) || data.releases.length === 0) {
        throw new Error('whats-new.json не содержит релизов');
    }
    return data;
}

function getLatestRelease() {
    return loadWhatsNew().releases[0];
}

function hasStagedWhatsNewChanges() {
    const result = spawnSync('git', ['diff', '--cached', '--quiet', '--', 'apps/web/public/whats-new.json', 'apps/web/public/whats-new'], {
        cwd: ROOT_DIR,
        stdio: 'ignore',
        shell: process.platform === 'win32',
    });
    return result.status === 1;
}

function sanitizeCommitTitle(value) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildCommitMessage(release) {
    const hash = sanitizeCommitTitle(release.buildHash || 'manual');
    const title = sanitizeCommitTitle(release.title || 'update release notes');
    return `chore: add what's-new entry for ${hash} (${title})`;
}

function ensurePathsExist() {
    if (!fs.existsSync(WHATS_NEW_JSON)) {
        throw new Error('Не найден apps/web/public/whats-new.json');
    }
    if (!fs.existsSync(WHATS_NEW_DIR)) {
        fs.mkdirSync(WHATS_NEW_DIR, { recursive: true });
    }
}

function main() {
    ensurePathsExist();
    const args = process.argv.slice(2);
    const skipPreview = args.includes('--skip-preview');

    writeLine('🚀 HEYS push-ready helper');
    writeLine('');

    if (!skipPreview) {
        writeLine('👀 Сначала покажу текущий текст релиза, автопредложение и статус скринов.');
        writeLine('');
        runInteractiveNodeScript(PREPARE_RELEASE_SCRIPT, ['--preview']);
    }

    writeLine('✍️ Теперь подтвердим/отредактируем текст и проверим скрины.');
    writeLine('');
    runInteractiveNodeScript(PREPARE_RELEASE_SCRIPT);
    runInteractiveNodeScript(PREPARE_RELEASE_SCRIPT, ['--check']);

    run('git add -- apps/web/public/whats-new.json apps/web/public/whats-new');

    if (!hasStagedWhatsNewChanges()) {
        writeLine('ℹ️ Нет новых staged-изменений в What\'s New — отдельный commit не нужен.');
        return;
    }

    // 🛡️ CI fast-path contract: release-bump commit MUST contain only files
    // matched by isReleaseMetaOnlyFile(). Otherwise GitHub Actions detect job
    // would silently fall back to full build for what should be a fast-path push.
    // Better to abort early with a clear error than ship a degraded commit.
    const stagedRaw = execSync('git diff --cached --name-only', { cwd: ROOT_DIR, encoding: 'utf8' });
    const stagedFiles = stagedRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const nonMetaStaged = stagedFiles.filter((f) => !isReleaseMetaOnlyFile(f));
    if (nonMetaStaged.length > 0) {
        writeError('❌ Release-bump commit нарушает CI fast-path контракт:');
        writeError('   следующие staged файлы НЕ matches isReleaseMetaOnlyFile():');
        nonMetaStaged.forEach((f) => writeError(`   - ${f}`));
        writeError('');
        writeError('   Эти файлы заставят GitHub Actions запустить full build (~4 мин)');
        writeError('   вместо fast-path (~30с). Либо unstage их, либо обнови');
        writeError('   RELEASE_META_FILE_PATTERNS в scripts/prepare-release.mjs.');
        process.exit(1);
    }

    const release = getLatestRelease();
    const commitMessage = buildCommitMessage(release);

    writeLine('');
    writeLine(`📝 Commit message: ${commitMessage}`);
    run(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);

    writeLine('');
    writeLine('✅ What\'s New подтверждён и закоммичен отдельным follow-up commit.');
    writeLine('Теперь можно делать обычный git push.');
}

try {
    main();
} catch (error) {
    writeError(`❌ ${error?.message || error}`);
    process.exit(1);
}
