import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { READING_BOOK_SOURCES } from '../../../scripts/legacy-bundle-config.mjs';

const webRoot = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(path.join(webRoot, 'heys_reading_catalog_v1.js'), 'utf8');
const sewellSource = fs.readFileSync(path.join(webRoot, 'reading/books/carl-sewell-customers-for-life_v1.js'), 'utf8');
const dalioSource = fs.readFileSync(path.join(webRoot, 'reading/books/ray-dalio-principles_v1.js'), 'utf8');

function createReading() {
    const context = { window: {}, structuredClone, console: { error() {} } };
    vm.createContext(context);
    vm.runInContext(coreSource, context);
    return { context, Reading: context.window.HEYS.Reading };
}

describe('reading authoring contract', () => {
    it('keeps the manifest equal to the independent book files', () => {
        const disk = fs.readdirSync(path.join(webRoot, 'reading/books'))
            .filter((file) => file.endsWith('_v1.js'))
            .map((file) => `reading/books/${file}`)
            .sort();
        expect([...READING_BOOK_SOURCES].sort()).toEqual(disk);
        expect(READING_BOOK_SOURCES).toContain('reading/books/ray-dalio-principles_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/carl-sewell-customers-for-life_v1.js');
    });

    it('registers Sewell as an independent reviewed summary', () => {
        const { context, Reading } = createReading();
        vm.runInContext(sewellSource, context);
        const book = Reading.getBookById('carl-sewell-customers-for-life');
        expect(Reading.getBookWordCount(book)).toBeGreaterThanOrEqual(1800);
        expect(Reading.getBookWordCount(book)).toBeLessThanOrEqual(2200);
        expect(book.editorialRank).toBe(20);
        expect(book.schemaVersion).toBe(2);
        expect(book.topics).toContain('service');
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.filter((block) => block.voice === 'review').length).toBeGreaterThan(5);
        expect(book.blocks.some((block) => block.type === 'details')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Dalio separately with the editorial volume and sources', () => {
        const { context, Reading } = createReading();
        expect(Reading.BOOKS).toHaveLength(0);
        vm.runInContext(dalioSource, context);
        const book = Reading.getBookById('ray-dalio-principles');
        expect(book).toBeTruthy();
        expect(Reading.getBookWordCount(book)).toBeGreaterThanOrEqual(1800);
        expect(Reading.getBookWordCount(book)).toBeLessThanOrEqual(2200);
        expect(book.sources).toHaveLength(4);
        expect(book.editorialRank).toBe(10);
        expect(book.schemaVersion).toBe(2);
        expect(book.blocks[2].items).toHaveLength(6);
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.filter((block) => block.type === 'details')).toHaveLength(3);
        expect(book.blocks.filter((block) => block.sectionRole === 'decision-process')).toHaveLength(1);
        expect(book.blocks.some((block) => block.text?.includes('Боль + осмысление'))).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('hides drafts and lets an invalid book fail without removing valid books', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const validBook = Reading.BOOKS[0];
        const draft = structuredClone(validBook);
        draft.id = 'draft-book';
        draft.status = 'draft';
        expect(Reading.registerBook(draft).registered).toBe(true);
        expect(Reading.getDraftBooks()).toHaveLength(1);
        expect(Reading.BOOKS).toHaveLength(1);

        const invalid = structuredClone(validBook);
        invalid.id = 'invalid-book';
        invalid.blocks[0].text = '<b>HTML</b> TODO';
        invalid.topics = ['unknown'];
        invalid.sources[0].url = 'http://example.com';
        const result = Reading.registerBook(invalid);
        expect(result.registered).toBe(false);
        expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(['E_RAW_MARKUP', 'E_PLACEHOLDER', 'E_TOPIC_UNKNOWN', 'E_SOURCE_HTTPS']));
        expect(Reading.BOOKS).toHaveLength(1);
    });

    it('reports stable codes and paths for structure, citations and volume', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        book.blocks[0].id = book.blocks[1].id;
        const quote = book.blocks.find((block) => block.type === 'quote');
        quote.text = Array(26).fill('слово').join(' ');
        quote.sourceIds = ['missing'];
        book.blocks = book.blocks.filter((block) => block.sectionRole !== 'audience');
        book.blocks.forEach((block) => {
            if (block.type === 'list') block.items = ['Короткий пункт'];
            else if (block.type !== 'quote' && block.type !== 'heading') block.text = 'Короткий текст';
        });
        const result = Reading.validateBookSummary(book, [book]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_BLOCK_ID_DUPLICATE', path: expect.stringContaining('.id') }),
            expect.objectContaining({ code: 'E_QUOTE_LENGTH', path: expect.stringContaining('.text') }),
            expect.objectContaining({ code: 'E_SOURCE_REF', path: expect.stringContaining('.sourceIds') }),
            expect.objectContaining({ code: 'E_REQUIRED_SECTION', path: 'ray-dalio-principles.blocks' }),
            expect.objectContaining({ code: 'E_WORD_COUNT', path: 'ray-dalio-principles.blocks' }),
        ]));
    });

    it('blocks placeholder sources, invalid editorial order and oversized accordion summaries', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        book.editorialRank = 0;
        book.sources[0] = { id: 'replace-source', label: 'TODO: заменить источник', url: 'https://example.com/replace-before-publishing' };
        const details = book.blocks.find((block) => block.type === 'details');
        details.summary = Array(31).fill('слово').join(' ');
        details.sourceIds = ['replace-source'];
        const result = Reading.validateBookSummary(book, [book]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_EDITORIAL_RANK', path: 'ray-dalio-principles.editorialRank' }),
            expect.objectContaining({ code: 'E_PLACEHOLDER', path: 'ray-dalio-principles.sources[0]' }),
            expect.objectContaining({ code: 'E_DETAILS_SUMMARY_LENGTH', path: expect.stringContaining('.summary') }),
        ]));
    });

    it('requires separate quick-summary and applicability blocks with enough depth', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        book.blocks[2].voice = 'review';
        book.blocks[2].items = book.blocks[2].items.slice(0, 4);
        book.blocks[3].voice = 'retelling';
        book.blocks[3].strength = 'Краткая оценка 8/10.';
        book.blocks[3].worksWhen = 'Краткое условие.';
        book.blocks[3].limitations = 'Краткое ограничение.';
        book.blocks[3].experiment = 'Краткая проверка.';
        const result = Reading.validateBookSummary(book, [book]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_QUICK_SUMMARY_VOICE', path: 'ray-dalio-principles.blocks[2].voice' }),
            expect.objectContaining({ code: 'E_QUICK_SUMMARY_ITEMS', path: 'ray-dalio-principles.blocks[2].items' }),
            expect.objectContaining({ code: 'E_APPLICABILITY_VOICE', path: 'ray-dalio-principles.blocks[3].voice' }),
            expect.objectContaining({ code: 'E_APPLICABILITY_VOLUME', path: 'ray-dalio-principles.blocks[3]' }),
            expect.objectContaining({ code: 'E_REVIEW_RATING', path: 'ray-dalio-principles.blocks[3]' }),
        ]));
    });

    it('enforces an open thesis and accordion rhythm in long sections', () => {
        const { context, Reading } = createReading();
        vm.runInContext(sewellSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        const contextHeadingIndex = book.blocks.findIndex((block) => block.sectionRole === 'context');
        const contextDetailsIndex = book.blocks.findIndex((block) => block.id === 'retention-evidence');
        const [contextDetails] = book.blocks.splice(contextDetailsIndex, 1);
        book.blocks.splice(contextHeadingIndex + 1, 0, contextDetails);

        const coreDetails = book.blocks.find((block) => block.id === 'recovery-evidence');
        coreDetails.type = 'paragraph';
        delete coreDetails.title;
        delete coreDetails.summary;
        const result = Reading.validateBookSummary(book, [book]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_SECTION_OPENING', path: expect.stringContaining('.blocks[') }),
            expect.objectContaining({ code: 'E_SECTION_DISCLOSURE', path: expect.stringContaining('.blocks[') }),
            expect.objectContaining({ code: 'E_DISCLOSURE_RHYTHM', path: expect.stringContaining('.blocks[') }),
        ]));
    });

    it('requires a substantial second opinion, including visible critique', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        book.blocks.filter((block) => block.voice === 'review' && block.type !== 'applicability')
            .forEach((block) => { block.voice = 'retelling'; });
        const applicability = book.blocks.find((block) => block.type === 'applicability');
        applicability.strength = 'Краткая оценка.';
        applicability.worksWhen = 'Краткое условие.';
        applicability.limitations = 'Краткое ограничение.';
        applicability.experiment = 'Краткая проверка.';
        const critiqueHeadingIndex = book.blocks.findIndex((block) => block.sectionRole === 'critique');
        const critiqueParagraph = book.blocks.slice(critiqueHeadingIndex + 1).find((block) => block.type === 'paragraph');
        critiqueParagraph.voice = 'retelling';
        const result = Reading.validateBookSummary(book, [book]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_REVIEW_DEPTH', path: 'ray-dalio-principles.blocks' }),
            expect.objectContaining({ code: 'E_REVIEW_VOLUME', path: 'ray-dalio-principles.blocks' }),
            expect.objectContaining({ code: 'E_CRITIQUE_REVIEW', path: expect.stringContaining('.blocks[') }),
        ]));
    });

    it('provides a throwing assertion for tests and build-time checks', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        expect(() => Reading.assertPublishedCatalog()).not.toThrow();
        const broken = structuredClone(Reading.BOOKS[0]);
        broken.sources[0].url = 'http://example.com';
        expect(() => Reading.assertPublishedCatalog([broken])).toThrow(/E_SOURCE_HTTPS ray-dalio-principles\.sources\[0\]\.url/);
    });

    it('searches taxonomy labels and calculates time from content', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const books = Reading.BOOKS;
        expect(Reading.filterBooks(books, { query: 'мышление решения' })).toHaveLength(1);
        expect(Reading.filterBooks(books, { query: 'systems teams' })).toHaveLength(1);
        expect(Reading.estimateReadingMinutes(books[0])).toBe(Math.ceil(Reading.getBookWordCount(books[0]) / 180));
    });
});
