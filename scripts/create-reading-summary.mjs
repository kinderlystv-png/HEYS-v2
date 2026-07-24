import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [arg, ''];
}));
const { id, title, author } = args;
const year = Number(args.year);
const editorialRank = args.rank == null ? 100 : Number(args.rank);
if (!id || !title || !author || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !Number.isInteger(year) || year < 1000 || year > 2100 || !Number.isInteger(editorialRank) || editorialRank < 1) {
    console.error('Использование: pnpm reading:new --id=book-id --title="Название" --author="Автор" --year=2024 [--rank=100]');
    process.exit(1);
}

const root = process.cwd();
const relativeSource = `reading/books/${id}_v1.js`;
const target = path.join(root, 'apps/web', relativeSource);
if (fs.existsSync(target)) {
    console.error(`Файл уже существует: ${target}`);
    process.exit(1);
}

const quote = (value) => JSON.stringify(value);
const template = `(function () {\n    'use strict';\n\n    window.HEYS.Reading.registerBook({\n        schemaVersion: 1,\n        status: 'draft',\n        id: ${quote(id)},\n        title: ${quote(title)},\n        author: ${quote(author)},\n        year: ${year},\n        editorialRank: ${editorialRank},\n        verdict: 'Сформулируйте ясный редакционный вердикт.',\n        practicalValue: 'Опишите применимую ценность книги.',\n        topics: ['thinking'],\n        tags: ['decisions'],\n        coverTone: 'violet',\n        blocks: [\n            { id: 'lead', type: 'lead', text: 'Кратко объясните, зачем читать книгу и в чём её ограничение.' },\n            { id: 'opening-verdict', type: 'verdict', title: 'Короткий вердикт', text: 'Дайте итог уже во втором смысловом блоке.' },\n            { id: 'overview-heading', type: 'heading', sectionRole: 'overview', text: 'О чём эта книга' },\n            { id: 'overview', type: 'paragraph', voice: 'retelling', text: 'Перескажите предмет и замысел книги.' },\n            { id: 'ideas-heading', type: 'heading', sectionRole: 'core-ideas', text: 'Главные идеи' },\n            { id: 'ideas', type: 'paragraph', voice: 'retelling', text: 'Раскройте центральную модель один раз.' },\n            { id: 'critique-heading', type: 'heading', sectionRole: 'critique', text: 'Что вызывает вопросы' },\n            { id: 'critique', type: 'paragraph', voice: 'review', text: 'Отделите оценку рецензента от пересказа.' },\n            { id: 'audience-heading', type: 'heading', sectionRole: 'audience', text: 'Кому читать' },\n            { id: 'audience', type: 'paragraph', voice: 'review', text: 'Назовите аудиторию и ограничения.' },\n            { id: 'final-heading', type: 'heading', sectionRole: 'original-verdict', text: 'Стоит ли читать оригинал' },\n            { id: 'final', type: 'verdict', title: 'Вердикт', text: 'Ответьте, когда саммари достаточно, а когда нужен оригинал.' },\n        ],\n        sources: [{ id: 'replace-source', label: 'TODO: заменить подтверждённым источником', url: 'https://example.com/replace-before-publishing' }],\n    });\n})();\n`;

const completeDraft = template
    .replace("tags: ['decisions']", "tags: ['decisions', 'mistakes', 'systems']")
    .replace("            { id: 'critique-heading'", "            { id: 'application-heading', type: 'heading', sectionRole: 'application', text: 'Как применить идеи' },\n            { id: 'application', type: 'paragraph', voice: 'review', text: 'Опишите конкретное и ограниченное применение.' },\n            { id: 'critique-heading'")
    .replace("verdict: '", "verdict: 'TODO: ")
    .replace("practicalValue: '", "practicalValue: 'TODO: ")
    .replaceAll("text: '", "text: 'TODO: ");
const configPath = path.join(root, 'scripts/legacy-bundle-config.mjs');
const config = fs.readFileSync(configPath, 'utf8');
const match = config.match(/export const READING_BOOK_SOURCES = \[([\s\S]*?)\];/);
if (!match) throw new Error('READING_BOOK_SOURCES не найден в legacy-bundle-config.mjs');
const current = Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]);
const next = [...new Set([...current, relativeSource])].sort();
const replacement = `export const READING_BOOK_SOURCES = [\n${next.map((source) => `    '${source}',`).join('\n')}\n];`;

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, completeDraft, { flag: 'wx' });
try {
    fs.writeFileSync(configPath, config.replace(match[0], replacement));
} catch (error) {
    fs.unlinkSync(target);
    throw error;
}
console.log(`Создан черновик: ${target}`);
console.log(`Далее: заполните контент, затем pnpm reading:check --book=${id}`);
