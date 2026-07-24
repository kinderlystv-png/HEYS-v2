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
const completeDraft = `(function () {
    'use strict';

    window.HEYS.Reading.registerBook({
        schemaVersion: 2,
        status: 'draft',
        id: ${quote(id)},
        title: ${quote(title)},
        author: ${quote(author)},
        year: ${year},
        editorialRank: ${editorialRank},
        verdict: 'TODO: сформулируйте ясный редакционный вердикт.',
        practicalValue: 'TODO: опишите применимую ценность книги.',
        topics: ['thinking'],
        tags: ['decisions', 'mistakes', 'systems'],
        coverTone: 'violet',
        blocks: [
            { id: 'lead', type: 'lead', text: 'TODO: объясните, зачем читать книгу и в чём её ограничение.' },
            { id: 'opening-verdict', type: 'verdict', title: 'Короткий вердикт', text: 'TODO: дайте итог уже во втором смысловом блоке.' },
            { id: 'quick-summary', type: 'quick-summary', voice: 'retelling', title: 'Книга за 3 минуты', items: [
                'TODO: первый самостоятельный тезис книги.',
                'TODO: второй самостоятельный тезис книги.',
                'TODO: третий самостоятельный тезис книги.',
                'TODO: четвёртый самостоятельный тезис книги.',
                'TODO: пятый самостоятельный тезис книги.',
            ] },
            { id: 'applicability-review', type: 'applicability', voice: 'review', title: 'Проверка применимости HEYS',
                strength: 'TODO: объясните, что в книге действительно полезно.',
                worksWhen: 'TODO: назовите условия, при которых метод работает.',
                limitations: 'TODO: покажите, где метод ломается, устаревает или может навредить.',
                experiment: 'TODO: предложите один небольшой и безопасный способ проверить идею.',
            },
            { id: 'overview-heading', type: 'heading', sectionRole: 'overview', text: 'О чём эта книга' },
            { id: 'overview', type: 'paragraph', voice: 'retelling', text: 'TODO: перескажите предмет и замысел книги.' },
            { id: 'ideas-heading', type: 'heading', sectionRole: 'core-ideas', text: 'Главные идеи' },
            { id: 'ideas', type: 'paragraph', voice: 'retelling', text: 'TODO: раскройте центральную модель один раз.' },
            { id: 'ideas-depth', type: 'details', voice: 'retelling', title: 'Как работает модель',
                summary: 'TODO: сформулируйте видимую мысль, понятную без раскрытия.',
                text: 'TODO: добавьте вторичную механику, доказательства или пример без повторения тезиса.',
            },
            { id: 'application-heading', type: 'heading', sectionRole: 'application', text: 'Как применить идеи' },
            { id: 'application', type: 'paragraph', voice: 'review', text: 'TODO: опишите конкретное и ограниченное применение.' },
            { id: 'critique-heading', type: 'heading', sectionRole: 'critique', text: 'Что вызывает вопросы' },
            { id: 'critique', type: 'paragraph', voice: 'review', text: 'TODO: отделите оценку редактора от пересказа.' },
            { id: 'audience-heading', type: 'heading', sectionRole: 'audience', text: 'Кому читать' },
            { id: 'audience', type: 'paragraph', voice: 'review', text: 'TODO: назовите аудиторию и ограничения.' },
            { id: 'final-heading', type: 'heading', sectionRole: 'original-verdict', text: 'Стоит ли читать оригинал' },
            { id: 'final', type: 'verdict', title: 'Вердикт', text: 'TODO: ответьте, когда нужен оригинал, а когда достаточно саммари.' },
        ],
        sources: [{ id: 'replace-source', label: 'TODO: заменить подтверждённым источником', url: 'https://example.com/replace-before-publishing' }],
    });
})();
`;
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
