#!/usr/bin/env node
/**
 * lint-legacy-undef.mjs
 *
 * Ловит свободные переменные в легаси-слое `apps/web` — обращения к именам,
 * которых нет ни в одной области видимости. В этом слое такая опечатка не
 * видна ничем: обычный eslint по нему не ходит (в `apps/web/package.json`
 * скрипт `lint` покрывает только `src/**`, а `.eslintrc.cjs` держит `no-undef`
 * выключенным для `apps/web/**\/heys_*.js`), в браузере ошибка всплывает лишь
 * на том экране, где строка исполнится, а под try/catch — не всплывает вовсе.
 *
 * Разбор 2026-08-31 нашёл так 26 имён в 44 местах: падал лист подписки в
 * кабинете, «Готово» в минутах по зонам, вкладка «Задачи»; молча не работали
 * tombstone-проверка продуктов, защита после signIn и правило советов про
 * активные предупреждения.
 *
 * Что считается известным именем — список GLOBALS ниже (браузер + глобали
 * склейки). Что разобрано и оставлено намеренно — `lint-legacy-undef-allowlist.txt`
 * строками вида `путь:имя` (`#` — комментарий). Список может только уменьшаться.
 *
 * Запуск:
 *   node scripts/lint-legacy-undef.mjs            — весь легаси-слой
 *   node scripts/lint-legacy-undef.mjs --staged   — только staged-файлы (pre-commit)
 *
 * Коды выхода: 0 — чисто, 1 — есть находки, 2 — ошибка конфигурации.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT, 'apps/web');

// Глобали, которые в этом слое существуют по-настоящему: браузерные, React из
// отдельного бандла, пространство HEYS и имена, живущие в общей области склейки.
const GLOBALS = {
    React: 'readonly',
    ReactDOM: 'readonly',
    HEYS: 'writable',
    DEV: 'readonly',
    YandexAPI: 'readonly',
    global: 'readonly',
    module: 'writable',
    require: 'readonly',
    exports: 'writable',
    process: 'readonly',
    BarcodeDetector: 'readonly',
    IdleDetector: 'readonly',
    PasswordCredential: 'readonly',
};

// Генерируемые склейки не проверяем: их источники уже в выборке, а находка в
// склейке — это та же строка, показанная дважды и не по тому адресу.
const GENERATED = /^heys_(day|day_core|day_meals|advice|fingers|mobility)_bundle_v1\.js$/;
const SKIP_DIRS = new Set(['__tests__', 'public', 'node_modules', 'src', 'scripts', 'styles']);
// Чужой вендорный бандл и сниппет, который вставляют руками в консоль, — не наш
// код и не часть приложения: правила слоя к ним не применяются.
const SKIP_FILES = new Set(['react-bundle.js', 'debug_patterns.js']);

function* walkWebJs(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            yield* walkWebJs(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            if (/\.bundle\.[a-f0-9]{12}\.js$/.test(entry.name)) continue;
            if (GENERATED.test(entry.name) || SKIP_FILES.has(entry.name)) continue;
            yield full;
        }
    }
}

function stagedWebJs() {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
        cwd: ROOT,
        encoding: 'utf8',
    });
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((rel) => rel.startsWith('apps/web/') && rel.endsWith('.js'))
        .filter((rel) => {
            const parts = rel.split('/');
            if (parts.some((p) => SKIP_DIRS.has(p))) return false;
            const name = parts[parts.length - 1];
            if (SKIP_FILES.has(name)) return false;
            return !GENERATED.test(name) && !/\.bundle\.[a-f0-9]{12}\.js$/.test(name);
        })
        .map((rel) => resolve(ROOT, rel))
        .filter((full) => existsSync(full));
}

const ALLOWLIST_PATH = resolve(__dirname, 'lint-legacy-undef-allowlist.txt');
const allowlist = new Set(
    existsSync(ALLOWLIST_PATH)
        ? readFileSync(ALLOWLIST_PATH, 'utf8')
              .split('\n')
              .map((l) => l.replace(/#.*$/, '').trim())
              .filter(Boolean)
        : [],
);

const staged = process.argv.includes('--staged');
const files = staged ? stagedWebJs() : [...walkWebJs(WEB_DIR)];

if (files.length === 0) {
    console.log('[lint-legacy-undef] OK — нет файлов для проверки.');
    process.exit(0);
}

const eslint = new ESLint({
    useEslintrc: false,
    overrideConfig: {
        env: { browser: true, es2022: true },
        parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
        globals: GLOBALS,
        rules: { 'no-undef': 'error' },
    },
});

const results = await eslint.lintFiles(files);
const findings = [];

for (const result of results) {
    const rel = relative(ROOT, result.filePath).replace(/\\/g, '/');
    for (const message of result.messages) {
        if (message.ruleId !== 'no-undef') continue;
        const name = /^'(.+)' is not defined/.exec(message.message)?.[1] ?? '?';
        if (allowlist.has(`${rel}:${name}`)) continue;
        findings.push({ rel, line: message.line, name });
    }
}

if (findings.length === 0) {
    console.log(`[lint-legacy-undef] OK — свободных переменных нет (${files.length} файл(ов)).`);
    process.exit(0);
}

console.error(`[lint-legacy-undef] ${findings.length} свободная(ых) переменная(ых):`);
for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}: ${f.name}`);
}
console.error('\nЭто имя не объявлено ни в одной области: строка упадёт ReferenceError,');
console.error('а под try/catch — молча отключит ветку. Объяви имя или возьми его оттуда,');
console.error('где оно живёт. Если обращение намеренное — строка `путь:имя` с причиной');
console.error('в scripts/lint-legacy-undef-allowlist.txt.');
process.exit(1);
