#!/usr/bin/env node
/**
 * prepare-release.mjs — Interactive release notes editor for HEYS "What's New" modal
 *
 * Usage:
 *   node scripts/prepare-release.mjs
 *   node scripts/prepare-release.mjs --check
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WHATS_NEW_PATH = path.join(__dirname, '..', 'apps', 'web', 'public', 'whats-new.json');
const WHATS_NEW_IMAGES_DIR = path.join(__dirname, '..', 'apps', 'web', 'public', 'whats-new');
const MAX_RELEASES_KEPT = 10;
const RELEASE_META_FILE_PATTERNS = [
    /^apps\/web\/public\/whats-new\.json$/,
    /^apps\/web\/public\/whats-new\//,
];

const TECHNICAL_FILE_PATTERNS = [
    /^docs\//,
    /^\.github\//,
    /^\.husky\//,
    /^scripts\//,
    /^tools\//,
    /^packages\//,
    /^yandex-cloud-functions\//,
    /^apps\/web\/__tests__\//,
    /^apps\/web\/tests\//,
    /^apps\/web\/scripts\//,
    /^apps\/web\/api\//,
    /^apps\/web\/public\/whats-new\.json$/,
    /^apps\/web\/public\/build-meta\.json$/,
    /^apps\/web\/public\/version\.json$/,
    /^apps\/web\/public\/sw\.js$/,
    /^.*\.(md|sql|yml|yaml|json)$/,
    /(^|\/)package\.json$/,
    /(^|\/)pnpm-lock\.yaml$/,
    /(^|\/)tsconfig(\..+)?\.json$/,
    /(^|\/)vitest(\..+)?\.(js|ts|mjs|cjs)$/,
    /(^|\/)jest(\..+)?\.(js|ts|mjs|cjs|json)$/,
    /(^|\/)eslint(\..+)?\.(js|ts|mjs|cjs|json)$/,
    /(^|\/)prettier(\..+)?\.(js|ts|mjs|cjs|json)$/,
    /(^|\/)Dockerfile$/,
];

const RELEASE_PROFILES = {
    technicalGeneral: {
        profile: 'technical-general',
        kind: 'technical',
        label: 'Внутренние улучшения',
        compactLabel: 'Короткий technical note',
        compactTitle: 'Исправления и улучшения стабильности',
        compactItems: [
            {
                type: 'fix',
                title: 'Исправили внутренние ошибки',
                description: 'В этом обновлении мы исправили внутренние ошибки и улучшили стабильность приложения.',
            },
        ],
        title: 'Исправления ошибок и улучшение стабильности',
        reason: 'Изменения выглядят техническими: скрипты, тесты, конфиги, backend или инфраструктура.',
        items: [
            {
                type: 'fix',
                title: 'Исправили внутренние ошибки и улучшили стабильность',
                description: 'В этом обновлении мы устранили несколько внутренних проблем, улучшили стабильность работы приложения и подготовили основу для следующих улучшений.',
            },
        ],
    },
    technicalSyncStorage: {
        profile: 'technical-sync-storage',
        kind: 'technical',
        label: 'Sync / Storage',
        compactLabel: 'Короткий sync/storage note',
        compactTitle: 'Улучшения синхронизации и данных',
        compactItems: [
            {
                type: 'fix',
                title: 'Улучшили надёжность синхронизации',
                description: 'Мы внесли внутренние исправления в синхронизацию и обработку данных для более стабильной работы приложения.',
            },
        ],
        title: 'Улучшение синхронизации и надёжности данных',
        reason: 'Изменения затрагивают sync/storage сценарии, локальное хранение или устойчивость данных.',
        items: [
            {
                type: 'fix',
                title: 'Улучшили синхронизацию и обработку данных',
                description: 'Мы доработали внутреннюю логику синхронизации и хранения данных, чтобы приложение работало стабильнее и надёжнее в сложных сценариях.',
            },
        ],
    },
    technicalBackendApi: {
        profile: 'technical-backend-api',
        kind: 'technical',
        label: 'Backend / API',
        compactLabel: 'Короткий backend/API note',
        compactTitle: 'Исправления серверной логики',
        compactItems: [
            {
                type: 'fix',
                title: 'Улучшили стабильность серверных сценариев',
                description: 'В этом обновлении мы внесли внутренние исправления в серверную логику и API-сценарии.',
            },
        ],
        title: 'Улучшения серверной логики и стабильности API',
        reason: 'Изменения относятся к backend/API, cloud functions или серверной инфраструктуре.',
        items: [
            {
                type: 'fix',
                title: 'Доработали внутренние API и серверные процессы',
                description: 'В этом обновлении мы улучшили внутреннюю серверную логику и повысили надёжность фоновых процессов и API-сценариев.',
            },
        ],
    },
    technicalInfraTests: {
        profile: 'technical-infra-tests',
        kind: 'technical',
        label: 'Infra / Tests',
        compactLabel: 'Короткий infra/tests note',
        compactTitle: 'Технические улучшения качества',
        compactItems: [
            {
                type: 'improvement',
                title: 'Улучшили внутренние процессы',
                description: 'Мы обновили внутренние инструменты и проверки, чтобы релизы были стабильнее и предсказуемее.',
            },
        ],
        title: 'Технические улучшения и повышение качества релизов',
        reason: 'Изменения затрагивают тесты, tooling, build/deploy скрипты или инженерную инфраструктуру.',
        items: [
            {
                type: 'improvement',
                title: 'Улучшили внутренние процессы и качество обновлений',
                description: 'Мы доработали внутренние инструменты, проверки и инфраструктурные процессы, чтобы релизы становились стабильнее и предсказуемее.',
            },
        ],
    },
    technicalDataSecurity: {
        profile: 'technical-data-security',
        kind: 'technical',
        label: 'Data / Security',
        compactLabel: 'Короткий data/security note',
        compactTitle: 'Улучшения обработки данных и защиты',
        compactItems: [
            {
                type: 'fix',
                title: 'Усилили внутренние механизмы защиты',
                description: 'В этом обновлении мы улучшили внутреннюю обработку данных и защитные сценарии системы.',
            },
        ],
        title: 'Исправления в обработке данных и защите системы',
        reason: 'Изменения связаны со схемой данных, безопасностью, SQL, RLS или валидацией.',
        items: [
            {
                type: 'fix',
                title: 'Улучшили обработку данных и защитные механизмы',
                description: 'В этом обновлении мы усилили внутренние механизмы обработки данных и доработали защитные сценарии для более надёжной работы системы.',
            },
        ],
    },
    userFacingGeneral: {
        profile: 'user-facing-general',
        kind: 'user-facing',
        label: 'User-facing',
        title: 'Новые возможности и улучшения',
        reason: 'Есть изменения, которые похожи на пользовательские сценарии, UI или runtime.',
        items: [
            {
                type: 'improvement',
                title: 'Улучшили ключевые сценарии использования',
                description: 'В этом обновлении мы доработали важные пользовательские сценарии, улучшили поведение интерфейса и исправили заметные шероховатости.',
            },
        ],
    },
};

const RELEASE_PROFILE_RULES = [
    {
        profileKey: 'technicalSyncStorage',
        matchers: [
            /sync/i,
            /storage/i,
            /offline/i,
            /cache/i,
            /merge/i,
            /quota/i,
            /^apps\/web\/heys_.*sync.*\.js$/,
            /^apps\/web\/heys_.*storage.*\.js$/,
        ],
    },
    {
        profileKey: 'technicalBackendApi',
        matchers: [
            /^apps\/web\/api\//,
            /^packages\/core\//,
            /^yandex-cloud-functions\//,
            /server/i,
            /rpc/i,
            /rest/i,
            /api/i,
        ],
    },
    {
        profileKey: 'technicalDataSecurity',
        matchers: [
            /security/i,
            /auth/i,
            /rls/i,
            /policy/i,
            /schema/i,
            /migration/i,
            /database/i,
            /sql$/i,
        ],
    },
    {
        profileKey: 'technicalInfraTests',
        matchers: [
            /^scripts\//,
            /^tools\//,
            /^\.husky\//,
            /^\.github\//,
            /^docs\//,
            /^apps\/web\/__tests__\//,
            /^apps\/web\/tests\//,
            /test/i,
            /vitest/i,
            /playwright/i,
            /bundle/i,
            /build/i,
            /deploy/i,
            /lint/i,
        ],
    },
];

function writeLine(text = '') {
    process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
    process.stderr.write(`${text}\n`);
}

function generateVersion() {
    const now = new Date();
    const moscowDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const year = moscowDate.getFullYear();
    const month = String(moscowDate.getMonth() + 1).padStart(2, '0');
    const day = String(moscowDate.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

function getShortHash(ref = 'HEAD') {
    try {
        return execSync(`git rev-parse --short ${ref}`, { encoding: 'utf8' }).trim();
    } catch {
        return 'manual';
    }
}

function isReleaseMetaOnlyFile(filePath) {
    return RELEASE_META_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function getCommitFiles(ref = 'HEAD') {
    const output = runGitCommand(`git diff-tree --no-commit-id --name-only -r ${ref}`);
    if (!output) return [];
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveReleaseTargetRef() {
    const historyOutput = runGitCommand('git rev-list --max-count=20 HEAD');
    if (!historyOutput) {
        return { targetRef: 'HEAD', currentHeadHash: getShortHash('HEAD'), targetHash: getShortHash('HEAD') };
    }

    const revisions = historyOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const revision of revisions) {
        const files = getCommitFiles(revision);
        if (files.length === 0) continue;
        const hasNonReleaseMetaFiles = files.some((filePath) => !isReleaseMetaOnlyFile(filePath));
        if (hasNonReleaseMetaFiles) {
            return {
                targetRef: revision,
                currentHeadHash: getShortHash('HEAD'),
                targetHash: getShortHash(revision),
            };
        }
    }

    return { targetRef: 'HEAD', currentHeadHash: getShortHash('HEAD'), targetHash: getShortHash('HEAD') };
}

function getCurrentReleaseMeta() {
    const dateVersion = generateVersion();
    const { targetRef, currentHeadHash, targetHash } = resolveReleaseTargetRef();
    return {
        gitHash: targetHash,
        currentHeadHash,
        targetRef,
        releaseVersion: `${dateVersion}.${targetHash}`,
    };
}

function runGitCommand(command) {
    try {
        return execSync(command, { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function getChangedFiles() {
    const commands = [
        `git diff-tree --no-commit-id --name-only -r ${resolveReleaseTargetRef().targetRef}`,
        'git diff --cached --name-only',
        'git diff --name-only',
        'git ls-files --others --exclude-standard',
    ];

    const files = new Set();
    commands.forEach((command) => {
        const output = runGitCommand(command);
        if (!output) return;
        output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((file) => files.add(file));
    });
    return Array.from(files);
}

function getChangeSummary() {
    const { targetRef } = resolveReleaseTargetRef();
    const output = runGitCommand(`git diff-tree --no-commit-id --shortstat -r ${targetRef}`);
    const fileMatch = output.match(/(\d+) files? changed/i);
    const insertMatch = output.match(/(\d+) insertions?\(\+\)/i);
    const deleteMatch = output.match(/(\d+) deletions?\(-\)/i);
    return {
        filesChanged: fileMatch ? parseInt(fileMatch[1], 10) : 0,
        insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    };
}

function isTechnicalFile(filePath) {
    return TECHNICAL_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function countProfileMatches(files, matchers) {
    return files.reduce((count, filePath) => {
        const matched = matchers.some((matcher) => matcher.test(filePath));
        return matched ? count + 1 : count;
    }, 0);
}

function detectReleaseProfile(relevantFiles, technicalOnly) {
    if (!technicalOnly) return RELEASE_PROFILES.userFacingGeneral;

    let bestProfileKey = 'technicalGeneral';
    let bestScore = 0;

    RELEASE_PROFILE_RULES.forEach((rule) => {
        const score = countProfileMatches(relevantFiles, rule.matchers);
        if (score > bestScore) {
            bestScore = score;
            bestProfileKey = rule.profileKey;
        }
    });

    return RELEASE_PROFILES[bestProfileKey] || RELEASE_PROFILES.technicalGeneral;
}

function classifyReleaseKind(changedFiles) {
    const relevantFiles = (changedFiles || []).filter((filePath) => filePath !== 'apps/web/public/whats-new.json');
    const changeSummary = getChangeSummary();
    if (relevantFiles.length === 0) {
        const fallbackProfile = RELEASE_PROFILES.technicalGeneral;
        return {
            kind: fallbackProfile.kind,
            profile: fallbackProfile.profile,
            changedFiles: [],
            suggestedTemplate: fallbackProfile,
            changeSummary,
            reason: 'Не удалось определить пользовательские изменения — используем безопасный технический шаблон.',
        };
    }

    const technicalOnly = relevantFiles.every(isTechnicalFile);
    const suggestedTemplate = detectReleaseProfile(relevantFiles, technicalOnly);

    return {
        kind: suggestedTemplate.kind,
        profile: suggestedTemplate.profile,
        changedFiles: relevantFiles,
        suggestedTemplate,
        changeSummary,
        reason: suggestedTemplate.reason,
    };
}

function getSuggestedTemplate(kind) {
    return RELEASE_PROFILES[kind] || RELEASE_PROFILES.userFacingGeneral;
}

function cloneTemplateItems(items) {
    return items.map((item) => ({ ...item }));
}

function chooseTemplateVariant(profile, releaseAnalysis) {
    if (!profile || profile.kind !== 'technical') {
        return {
            title: profile?.title || '',
            items: cloneTemplateItems(profile?.items || []),
            variant: 'expanded',
            label: profile?.label || 'User-facing',
        };
    }

    const summary = releaseAnalysis?.changeSummary || { filesChanged: 0, insertions: 0, deletions: 0 };
    const totalTouchedLines = summary.insertions + summary.deletions;
    const smallTechnicalChange = summary.filesChanged > 0 && summary.filesChanged <= 3 && totalTouchedLines <= 80;

    if (smallTechnicalChange && profile.compactTitle && profile.compactItems) {
        return {
            title: profile.compactTitle,
            items: cloneTemplateItems(profile.compactItems),
            variant: 'compact',
            label: profile.compactLabel || profile.label,
        };
    }

    return {
        title: profile.title,
        items: cloneTemplateItems(profile.items || []),
        variant: 'expanded',
        label: profile.label,
    };
}

async function askForImage(rl, images, defaultImage = '') {
    if (images.length > 0) {
        const imageChoice = await ask(rl, '  Скриншот (номер, имя файла, пусто = без скрина)', defaultImage);
        if (!imageChoice) return '';
        const numericChoice = parseInt(imageChoice, 10);
        if (numericChoice > 0 && numericChoice <= images.length) {
            return `/whats-new/${images[numericChoice - 1]}`;
        }
        if (images.includes(imageChoice)) {
            return `/whats-new/${imageChoice}`;
        }
        if (imageChoice.startsWith('/')) {
            return imageChoice;
        }
        return `/whats-new/${imageChoice}`;
    }

    const imagePath = await ask(rl, '  Путь к скриншоту (или пусто)', defaultImage);
    if (!imagePath) return '';
    return imagePath.startsWith('/') ? imagePath : `/whats-new/${imagePath}`;
}

function generateDateISO() {
    const now = new Date();
    const moscowDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const year = moscowDate.getFullYear();
    const month = String(moscowDate.getMonth() + 1).padStart(2, '0');
    const day = String(moscowDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function loadWhatsNew() {
    try {
        const raw = fs.readFileSync(WHATS_NEW_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.releases)) return data;
    } catch {
        // ignore malformed or missing file and start fresh
    }
    return { releases: [] };
}

function saveWhatsNew(data) {
    if (data.releases.length > MAX_RELEASES_KEPT) {
        data.releases = data.releases.slice(0, MAX_RELEASES_KEPT);
    }
    fs.writeFileSync(WHATS_NEW_PATH, JSON.stringify(data, null, 2) + '\n');
}

function listImages() {
    try {
        if (!fs.existsSync(WHATS_NEW_IMAGES_DIR)) return [];
        return fs.readdirSync(WHATS_NEW_IMAGES_DIR)
            .filter((fileName) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fileName));
    } catch {
        return [];
    }
}

function resolveImagePublicPath(imagePath) {
    const relative = imagePath.replace(/^\//, '').split('/').join(path.sep);
    return path.join(__dirname, '..', 'apps', 'web', 'public', relative);
}

function getMissingImages(items) {
    return items
        .filter((item) => item.image)
        .filter((item) => !fs.existsSync(resolveImagePublicPath(item.image)));
}

function ask(rl, question, defaultValue = '') {
    return new Promise((resolve) => {
        const suffix = defaultValue ? ` [${defaultValue}]` : '';
        rl.question(`${question}${suffix}: `, (answer) => {
            resolve(answer.trim() || defaultValue || '');
        });
    });
}

function runCheck() {
    const data = loadWhatsNew();
    const { gitHash, currentHeadHash, releaseVersion } = getCurrentReleaseMeta();

    if (data.releases.length === 0) {
        writeLine('⚠️  whats-new.json пуст — нет записей о релизах.');
        writeLine('   Запусти: pnpm prepare-release');
        return 1;
    }

    const latest = data.releases[0];
    const latestHash = latest.buildHash || '';
    const latestMatchesCurrent = latestHash === gitHash || latest.version === releaseVersion;

    if (!latestMatchesCurrent) {
        writeLine('⚠️  Для текущего commit нет актуального changelog entry.');
        writeLine(`   Текущий build hash: ${gitHash}`);
        writeLine(`   Ожидаемая release version: ${releaseVersion}`);
        writeLine(`   Последний entry: ${latest.version}${latestHash ? ` (hash ${latestHash})` : ''}`);
        writeLine('   Перед push/deploy нужно подтвердить тексты и скриншоты.');
        writeLine('   Запусти: pnpm prepare-release');
        return 1;
    }

    writeLine(`✅ whats-new.json актуален: v${latest.version} — "${latest.title}"`);
    writeLine(`   Build hash: ${gitHash}`);
    if (currentHeadHash !== gitHash) {
        writeLine(`   HEAD содержит только release/meta-изменения, поэтому target hash взят из предыдущего meaningful commit: ${gitHash}`);
    }
    writeLine(`   Записей: ${latest.items.length}`);

    const missingImages = getMissingImages(latest.items || []);
    if (missingImages.length > 0) {
        writeLine('');
        writeLine('⚠️  Отсутствуют скриншоты:');
        missingImages.forEach((item) => {
            writeLine(`   📸 ${item.image} — для "${item.title}"`);
        });
        writeLine('   Добавь изображения в apps/web/public/whats-new/');
        return 1;
    }

    return 0;
}

async function runInteractive() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    writeLine('');
    writeLine('🚀 HEYS — Подготовка релиза (What\'s New)');
    writeLine('=========================================');
    writeLine('');

    const data = loadWhatsNew();
    const { gitHash, currentHeadHash, releaseVersion } = getCurrentReleaseMeta();
    const todayDate = generateDateISO();
    const releaseAnalysis = classifyReleaseKind(getChangedFiles());
    const suggestedProfile = releaseAnalysis.suggestedTemplate || getSuggestedTemplate(releaseAnalysis.kind);
    const templateVariant = chooseTemplateVariant(suggestedProfile, releaseAnalysis);

    const existingIdx = data.releases.findIndex((release) => (release.buildHash && release.buildHash === gitHash) || release.version === releaseVersion);
    let release;

    if (existingIdx >= 0) {
        writeLine(`📝 Найден существующий релиз v${data.releases[existingIdx].version}: "${data.releases[existingIdx].title}"`);
        writeLine(`   Build hash: ${gitHash}`);
        writeLine(`   Записей: ${data.releases[existingIdx].items.length}`);
        const action = await ask(rl, '   Дополнить (д) / Перезаписать (п) / Отмена (о)', 'д');
        if (action === 'о' || action === 'o') {
            writeLine('Отменено.');
            rl.close();
            return;
        }
        if (action === 'п' || action === 'p') {
            release = { version: releaseVersion, buildHash: gitHash, date: todayDate, title: '', items: [] };
        } else {
            release = data.releases[existingIdx];
        }
    } else {
        release = { version: releaseVersion, buildHash: gitHash, date: todayDate, title: '', items: [] };
    }

    release.version = releaseVersion;
    release.buildHash = gitHash;
    release.date = todayDate;
    release.kind = suggestedProfile.kind;
    release.profile = suggestedProfile.profile;

    writeLine(`🔎 Тип релиза: ${releaseAnalysis.kind === 'technical' ? 'technical / внутренний' : 'user-facing / пользовательский'}`);
    writeLine(`   Профиль: ${suggestedProfile.label}`);
    if (releaseAnalysis.changeSummary) {
        writeLine(`   Масштаб: ${releaseAnalysis.changeSummary.filesChanged || 0} файлов, +${releaseAnalysis.changeSummary.insertions || 0} / -${releaseAnalysis.changeSummary.deletions || 0} строк`);
    }
    if (currentHeadHash !== gitHash) {
        writeLine(`   HEAD commit выглядит как release/meta follow-up. What's New будет привязан к предыдущему meaningful commit: ${gitHash}`);
    }
    writeLine(`   ${releaseAnalysis.reason}`);
    if (releaseAnalysis.changedFiles.length > 0) {
        writeLine('   Изменённые файлы для оценки:');
        releaseAnalysis.changedFiles.slice(0, 8).forEach((filePath) => writeLine(`   • ${filePath}`));
        if (releaseAnalysis.changedFiles.length > 8) {
            writeLine(`   • … и ещё ${releaseAnalysis.changedFiles.length - 8}`);
        }
    }
    writeLine('');

    if ((!release.title || release.items.length === 0) && suggestedProfile) {
        const templateAnswer = await ask(
            rl,
            releaseAnalysis.kind === 'technical'
                ? `💡 Похоже на технический релиз. Подставить ${templateVariant.variant === 'compact' ? 'короткий' : 'расширенный'} шаблон в стиле крупных приложений? (Y/n)`
                : '💡 Подставить базовый шаблон релиза и потом отредактировать? (Y/n)',
            'Y',
        );
        if (!['n', 'N', 'нет', 'no'].includes(templateAnswer)) {
            if (!release.title) release.title = templateVariant.title;
            if (!release.items.length) release.items = cloneTemplateItems(templateVariant.items);
        }
    }

    const title = await ask(rl, '📋 Заголовок релиза (краткое описание)', release.title);
    release.title = title;

    writeLine('');
    writeLine('Добавляем записи. Типы: feature (🆕), improvement (✨), fix (🔧)');
    writeLine('Оставь заголовок пустым для завершения.');
    writeLine('');

    const images = listImages();
    if (images.length > 0) {
        writeLine('📸 Доступные изображения в public/whats-new/:');
        images.forEach((image, index) => writeLine(`   ${index + 1}. ${image}`));
        writeLine('');
    }

    if (release.items.length > 0) {
        writeLine('Текущие записи релиза:');
        release.items.forEach((item, index) => {
            writeLine(`   ${index + 1}. [${item.type}] ${item.title}`);
        });
        writeLine('');

        for (let index = 0; index < release.items.length; index += 1) {
            const currentItem = release.items[index];
            writeLine(`✏️  Проверка записи #${index + 1}`);
            const reviewAction = await ask(rl, '  Оставить / Изменить / Удалить [o/e/d]', 'o');

            if (['d', 'D', 'удалить'].includes(reviewAction)) {
                release.items.splice(index, 1);
                index -= 1;
                writeLine('  🗑️ Запись удалена');
                writeLine('');
                continue;
            }

            if (['e', 'E', 'изменить'].includes(reviewAction)) {
                currentItem.type = await ask(rl, '  Тип [feature/improvement/fix]', currentItem.type || 'feature');
                currentItem.title = await ask(rl, '  Заголовок', currentItem.title || '');
                currentItem.description = await ask(rl, '  Описание', currentItem.description || '');
                const nextImage = await askForImage(rl, images, currentItem.image || '');
                if (nextImage) {
                    currentItem.image = nextImage;
                } else {
                    delete currentItem.image;
                }
                writeLine('  ✅ Запись обновлена');
                writeLine('');
            }
        }
    }

    let adding = true;
    while (adding) {
        const itemTitle = await ask(rl, `  Заголовок записи #${release.items.length + 1} (пусто = завершить)`, '');
        if (!itemTitle) {
            adding = false;
            break;
        }

        const type = await ask(rl, '  Тип [feature/improvement/fix]', 'feature');
        const description = await ask(rl, '  Описание (1-2 предложения)', '');
        const image = await askForImage(rl, images, '');

        const item = { type: type || 'feature', title: itemTitle };
        if (description) item.description = description;
        if (image) item.image = image;

        release.items.push(item);
        writeLine(`  ✅ Добавлено: [${item.type}] ${item.title}`);
        writeLine('');
    }

    if (release.items.length === 0) {
        writeLine('⚠️  Нет записей — whats-new.json не обновлён.');
        rl.close();
        return;
    }

    if (existingIdx >= 0) {
        data.releases[existingIdx] = release;
    } else {
        data.releases.unshift(release);
    }

    saveWhatsNew(data);

    writeLine('');
    writeLine('✅ whats-new.json обновлён!');
    writeLine(`   Версия: ${release.version}`);
    writeLine(`   Build hash: ${release.buildHash}`);
    writeLine(`   Заголовок: ${release.title}`);
    writeLine(`   Записей: ${release.items.length}`);

    const missingImages = getMissingImages(release.items || []);
    if (missingImages.length > 0) {
        writeLine('');
        writeLine('📸 Не забудь добавить скриншоты:');
        missingImages.forEach((item) => {
            writeLine(`   • ${item.image} — для "${item.title}"`);
        });
        writeLine('   Положи их в: apps/web/public/whats-new/');
    }

    writeLine('');
    writeLine('Следующие шаги:');
    writeLine('  1. Добавь скриншоты в apps/web/public/whats-new/ (если ещё не добавлены)');
    writeLine('  2. git add & commit');
    writeLine('  3. При деплое пользователи увидят модаль "Что нового" после обновления');
    writeLine('');

    rl.close();
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
    process.exit(runCheck());
} else {
    runInteractive().catch((error) => {
        writeError(`Ошибка: ${error?.stack || error}`);
        process.exit(1);
    });
}
