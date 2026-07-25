import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { READING_BOOK_SOURCES } from './legacy-bundle-config.mjs';

const root = process.cwd();
const booksDir = path.join(root, 'apps/web/reading/books');
const personalizationDir = path.join(root, 'apps/web/reading/personalization');
const requestedId = process.argv.find((arg) => arg.startsWith('--book='))?.slice(7);
const manifestFiles = READING_BOOK_SOURCES.map((file) => path.join(root, 'apps/web', file));
const diskSources = fs.readdirSync(booksDir)
    .filter((file) => file.endsWith('_v1.js'))
    .map((file) => `reading/books/${file}`)
    .sort();
const manifestSources = [...READING_BOOK_SOURCES].sort();

const manifestErrors = [];
for (const source of manifestSources.filter((source) => !diskSources.includes(source))) manifestErrors.push(`manifest: файла нет на диске — ${source}`);
for (const source of diskSources.filter((source) => !manifestSources.includes(source))) manifestErrors.push(`manifest: файл не зарегистрирован — ${source}`);

const captured = [];
const sandbox = {
    window: {},
    structuredClone,
    console: { error: (...args) => captured.push(args.join(' ')), warn: (...args) => captured.push(args.join(' ')), log: () => {} },
};
vm.createContext(sandbox);
const evaluate = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

evaluate(path.join(root, 'apps/web/heys_reading_catalog_v1.js'));
manifestFiles.filter(fs.existsSync).forEach(evaluate);

const Reading = sandbox.window.HEYS.Reading;
const diagnostics = Reading.getCatalogDiagnostics();
const attempts = diagnostics.attempts.filter((entry) => !requestedId || entry.book?.id === requestedId);
if (requestedId && attempts.length === 0) manifestErrors.push(`book: не найден id ${requestedId}`);

for (const entry of attempts) {
    const book = entry.book;
    const headings = book.blocks?.filter((block) => block.type === 'heading').length || 0;
    const wordRange = entry.result.wordCountMin == null ? 'не определён' : `${entry.result.wordCountMin}–${entry.result.wordCountMax}`;
    console.log(`${entry.result.valid ? '✓' : '✗'} ${book.id} [${book.status} · ${book.depthProfile || 'без профиля'}]`);
    console.log(`  ${entry.result.wordCount} слов из ${wordRange} · ${Reading.estimateReadingMinutes(book)} минут · ${headings} разделов · ${book.sources?.length || 0} источника`);
    console.log(`  быстрый слой: ${entry.result.quickSummaryWordCount} слов · применимость: ${entry.result.applicabilityWordCount} слов · review: ${entry.result.reviewWordCount} слов / ${entry.result.reviewBlockCount} блоков`);
    console.log(`  маркер: ${entry.result.highlightStats.highlightedWords} из ${entry.result.highlightStats.eligibleWords} слов (${entry.result.highlightStats.coveragePercent}%) · Главное: ${entry.result.highlightStats.readingMinutes} мин`);
    for (const issue of [...entry.result.errors, ...entry.result.warnings]) {
        console.log(`  ${issue.severity === 'error' ? 'ERROR' : 'WARN'} ${issue.code} ${issue.path}: ${issue.message}`);
    }
}

manifestErrors.forEach((message) => console.log(`ERROR E_MANIFEST manifest: ${message}`));
const personalizationFiles = fs.existsSync(personalizationDir)
    ? fs.readdirSync(personalizationDir).filter((file) => file.endsWith('.json')).sort()
    : [];
const personalizationResults = personalizationFiles.map((file) => {
    const overlay = JSON.parse(fs.readFileSync(path.join(personalizationDir, file), 'utf8'));
    const result = Reading.validatePersonalizationOverlay(overlay, diagnostics.published);
    console.log(`${result.valid ? '✓' : '✗'} personalization/${file}: ${result.bookCount} книг`);
    result.errors.forEach((issue) => console.log(`  ERROR ${issue.code} ${issue.path}: ${issue.message}`));
    return result;
});
const publishedErrors = attempts.flatMap((entry) => entry.book.status === 'published' ? entry.result.errors : []);
const personalizationErrors = personalizationResults.flatMap((result) => result.errors);
const errorCount = manifestErrors.length + publishedErrors.length + personalizationErrors.length;
const warningCount = attempts.reduce((sum, entry) => sum + entry.result.warnings.length, 0);
console.log(`Catalog: ${diagnostics.published.length} published, ${diagnostics.drafts.length} drafts, ${errorCount} errors, ${warningCount} warnings`);
if (errorCount) process.exitCode = 1;
