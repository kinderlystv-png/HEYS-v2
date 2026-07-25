import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { READING_BOOK_SOURCES } from '../../../scripts/legacy-bundle-config.mjs';

const webRoot = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(path.join(webRoot, 'heys_reading_catalog_v1.js'), 'utf8');
const sewellSource = fs.readFileSync(path.join(webRoot, 'reading/books/carl-sewell-customers-for-life_v1.js'), 'utf8');
const dalioSource = fs.readFileSync(path.join(webRoot, 'reading/books/ray-dalio-principles_v1.js'), 'utf8');
const atomicHabitsSource = fs.readFileSync(path.join(webRoot, 'reading/books/james-clear-atomic-habits_v1.js'), 'utf8');
const thinkingFastAndSlowSource = fs.readFileSync(path.join(webRoot, 'reading/books/daniel-kahneman-thinking-fast-and-slow_v1.js'), 'utf8');
const unreasonableHospitalitySource = fs.readFileSync(path.join(webRoot, 'reading/books/will-guidara-unreasonable-hospitality_v1.js'), 'utf8');
const eMythSource = fs.readFileSync(path.join(webRoot, 'reading/books/michael-gerber-e-myth-revisited_v1.js'), 'utf8');
const goodStrategyBadStrategySource = fs.readFileSync(path.join(webRoot, 'reading/books/richard-rumelt-good-strategy-bad-strategy_v1.js'), 'utf8');
const noiseSource = fs.readFileSync(path.join(webRoot, 'reading/books/kahneman-sibony-sunstein-noise_v1.js'), 'utf8');
const checklistManifestoSource = fs.readFileSync(path.join(webRoot, 'reading/books/atul-gawande-checklist-manifesto_v1.js'), 'utf8');
const sevenHabitsSource = fs.readFileSync(path.join(webRoot, 'reading/books/stephen-covey-seven-habits_v1.js'), 'utf8');
const poltavskyOverlay = JSON.parse(fs.readFileSync(path.join(webRoot, 'reading/personalization/poltavsky_v1.json'), 'utf8'));

function createReading() {
    const context = { window: {}, structuredClone, console: { error() {} } };
    vm.createContext(context);
    vm.runInContext(coreSource, context);
    return { context, Reading: context.window.HEYS.Reading };
}

function expectBookFitsDepthProfile(Reading, book, expectedProfile = 'standard') {
    const range = Reading.DEPTH_PROFILES[expectedProfile];
    const words = Reading.getBookWordCount(book);
    expect(book.depthProfile).toBe(expectedProfile);
    expect(words).toBeGreaterThanOrEqual(range.minWords);
    expect(words).toBeLessThanOrEqual(range.maxWords);
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
        expect(READING_BOOK_SOURCES).toContain('reading/books/james-clear-atomic-habits_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/daniel-kahneman-thinking-fast-and-slow_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/will-guidara-unreasonable-hospitality_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/michael-gerber-e-myth-revisited_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/richard-rumelt-good-strategy-bad-strategy_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/kahneman-sibony-sunstein-noise_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/atul-gawande-checklist-manifesto_v1.js');
        expect(READING_BOOK_SOURCES).toContain('reading/books/stephen-covey-seven-habits_v1.js');
    });

    it('registers the practical and conceptual calibration books under schema v3', () => {
        const { context, Reading } = createReading();
        vm.runInContext(atomicHabitsSource, context);
        vm.runInContext(thinkingFastAndSlowSource, context);
        expect(Reading.BOOKS).toHaveLength(2);
        Reading.BOOKS.forEach((book) => {
            expect(book.schemaVersion).toBe(3);
            expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
            expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        });
        const atomicHabits = Reading.getBookById('james-clear-atomic-habits');
        const thinkingFastAndSlow = Reading.getBookById('daniel-kahneman-thinking-fast-and-slow');
        expectBookFitsDepthProfile(Reading, atomicHabits, 'compact');
        expectBookFitsDepthProfile(Reading, thinkingFastAndSlow, 'deep');
        expect(atomicHabits?.blocks.some((block) => block.type === 'details')).toBe(true);
        expect(thinkingFastAndSlow?.blocks.find((block) => block.id === 'priming-replication')?.sourceIds).toContain('ego-depletion-replication');
        expect(thinkingFastAndSlow?.blocks.find((block) => block.id === 'prospect-theory-evidence')?.sourceIds).toEqual(
            expect.arrayContaining(['prospect-replication', 'loss-aversion-meta']),
        );
        expect(thinkingFastAndSlow?.blocks.some((block) => block.id === 'judgment-decision-result' && block.voice === 'review')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Sewell as an independent reviewed summary', () => {
        const { context, Reading } = createReading();
        vm.runInContext(sewellSource, context);
        const book = Reading.getBookById('carl-sewell-customers-for-life');
        expectBookFitsDepthProfile(Reading, book);
        expect(book.editorialRank).toBe(20);
        expect(book.schemaVersion).toBe(3);
        expect(book.topics).toContain('service');
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.filter((block) => block.voice === 'review').length).toBeGreaterThan(5);
        expect(book.blocks.some((block) => block.type === 'details')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Guidara as a sourced service summary with an explicit editorial review', () => {
        const { context, Reading } = createReading();
        vm.runInContext(unreasonableHospitalitySource, context);
        const book = Reading.getBookById('will-guidara-unreasonable-hospitality');
        expectBookFitsDepthProfile(Reading, book, 'standard');
        expect(book.editorialRank).toBe(15);
        expect(book.topics).toEqual(expect.arrayContaining(['service', 'management']));
        expect(book.sources.length).toBeGreaterThanOrEqual(5);
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[2].items).toHaveLength(7);
        expect(book.blocks[2].items.at(-1)).toContain('Масштабировать следует общую внимательность');
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.some((block) => block.id === 'privacy-boundary')).toBe(true);
        expect(book.blocks.some((block) => block.type === 'example' && block.origin === 'reviewer')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('keeps public summaries universal and validates the separate Poltavsky overlay', () => {
        const { context, Reading } = createReading();
        [sewellSource, dalioSource, atomicHabitsSource, thinkingFastAndSlowSource, unreasonableHospitalitySource, eMythSource, goodStrategyBadStrategySource, noiseSource, checklistManifestoSource, sevenHabitsSource]
            .forEach((source) => vm.runInContext(source, context));

        const publicContent = JSON.stringify(Reading.BOOKS);
        expect(publicContent).not.toMatch(/Kinderly|EPUPK/i);
        Reading.BOOKS.forEach((book) => {
            expect(book.blocks[3]).toMatchObject({ type: 'applicability', title: 'Проверка применимости' });
        });

        const result = Reading.validatePersonalizationOverlay(poltavskyOverlay, Reading.BOOKS);
        expect(result).toMatchObject({ valid: true, bookCount: 10, errors: [] });
        Reading.BOOKS.forEach((book) => {
            const entry = Reading.getPersonalizedBookOverlay(poltavskyOverlay, book.id, Reading.BOOKS);
            expect(entry.projects.map((project) => project.id)).toEqual(['kinderly', 'heys']);
        });

        const selective = structuredClone(poltavskyOverlay);
        delete selective.books['ray-dalio-principles'];
        selective.books['carl-sewell-customers-for-life'].projects = selective.books['carl-sewell-customers-for-life'].projects.slice(0, 1);
        expect(Reading.validatePersonalizationOverlay(selective, Reading.BOOKS)).toMatchObject({ valid: true, bookCount: 9, errors: [] });

        const generic = structuredClone(poltavskyOverlay);
        generic.books['ray-dalio-principles'].projects[0].questions = ['Как эту идею можно применить?'];
        expect(Reading.validatePersonalizationOverlay(generic, Reading.BOOKS).errors).toContainEqual(
            expect.objectContaining({ code: 'E_PERSONALIZATION_QUESTIONS', path: 'poltavsky.books.ray-dalio-principles.projects[0].questions' }),
        );
    });

    it('registers Rumelt as a strategy summary with a visible hindsight boundary', () => {
        const { context, Reading } = createReading();
        vm.runInContext(goodStrategyBadStrategySource, context);
        const book = Reading.getBookById('richard-rumelt-good-strategy-bad-strategy');
        expectBookFitsDepthProfile(Reading, book, 'standard');
        expect(book.editorialRank).toBe(28);
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.some((block) => block.id === 'kernel')).toBe(true);
        expect(book.blocks.some((block) => block.id === 'hindsight-boundary' && block.voice === 'review')).toBe(true);
        expect(book.blocks.some((block) => block.id === 'focus-risk' && block.voice === 'review')).toBe(true);
        expect(book.blocks.find((block) => block.id === 'strategy-as-hypothesis')?.text).toContain('Аномалия важнее среднего');
        expect(book.blocks.some((block) => block.type === 'example' && block.origin === 'reviewer')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Noise as a deep systems review with explicit limits on standardization', () => {
        const { context, Reading } = createReading();
        vm.runInContext(noiseSource, context);
        const book = Reading.getBookById('kahneman-sibony-sunstein-noise');
        expectBookFitsDepthProfile(Reading, book, 'deep');
        expect(book.editorialRank).toBe(35);
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks.some((block) => block.id === 'noise-audit')).toBe(true);
        expect(book.blocks.some((block) => block.id === 'insurance-audit' && block.sourceIds?.includes('hbr-noise'))).toBe(true);
        expect(book.blocks.some((block) => block.id === 'map-protocol')).toBe(true);
        expect(book.blocks.find((block) => block.id === 'predictive-and-evaluative-judgments')?.text).toContain('Суждение описывает мир');
        expect(book.blocks.find((block) => block.id === 'rules-and-algorithms')?.sourceIds).toContain('grove-meta');
        expect(book.blocks.some((block) => block.id === 'algorithm-boundary' && block.voice === 'review')).toBe(true);
        expect(book.blocks.some((block) => block.id === 'valuable-diversity' && block.voice === 'review')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Gerber as a bounded systems summary rather than a franchise prescription', () => {
        const { context, Reading } = createReading();
        vm.runInContext(eMythSource, context);
        const book = Reading.getBookById('michael-gerber-e-myth-revisited');
        expectBookFitsDepthProfile(Reading, book, 'standard');
        expect(book.editorialRank).toBe(25);
        expect(book.tags).toEqual(expect.arrayContaining(['systems', 'teams']));
        expect(book.sources.length).toBeGreaterThanOrEqual(5);
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.some((block) => block.id === 'judgment-risk')).toBe(true);
        expect(book.blocks.some((block) => block.requiresSource && block.sourceIds?.includes('bls-survival'))).toBe(true);
        expect(book.blocks.find((block) => block.id === 'survival-rhetoric')?.sourceIds).toContain('closure-failure');
        expect(book.blocks.find((block) => block.id === 'franchise-evidence')?.sourceIds).toContain('franchise-census');
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Gawande as a sourced checklist review with an implementation boundary', () => {
        const { context, Reading } = createReading();
        vm.runInContext(checklistManifestoSource, context);
        const book = Reading.getBookById('atul-gawande-checklist-manifesto');
        expectBookFitsDepthProfile(Reading, book, 'standard');
        expect(book.status).toBe('published');
        expect(book.editorialRank).toBe(22);
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.find((block) => block.id === 'michigan-system')?.sourceIds).toContain('pronovost-study');
        expect(book.blocks.find((block) => block.id === 'critique')?.sourceIds).toEqual(expect.arrayContaining(['who-study', 'ontario-study']));
        expect(book.blocks.some((block) => block.id === 'implementation-boundary' && block.voice === 'review')).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Covey as a deep principles review with explicit responsibility and power boundaries', () => {
        const { context, Reading } = createReading();
        vm.runInContext(sevenHabitsSource, context);
        const book = Reading.getBookById('stephen-covey-seven-habits');
        expectBookFitsDepthProfile(Reading, book, 'deep');
        expect(book.status).toBe('published');
        expect(book.editorialRank).toBe(45);
        expect(book.editorialRole).toBeUndefined();
        expect(book.blocks[2]).toMatchObject({ type: 'quick-summary', voice: 'retelling' });
        expect(book.blocks[2].items).toHaveLength(7);
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.some((block) => block.id === 'responsibility-boundary' && block.voice === 'review')).toBe(true);
        expect(book.blocks.find((block) => block.id === 'cultural-boundary')?.sourceIds).toContain('culture-self');
        expect(book.blocks.find((block) => block.id === 'intention-action')?.sourceIds).toEqual(
            expect.arrayContaining(['implementation-intentions', 'goal-setting']),
        );
        expect(book.blocks.find((block) => block.id === 'time-matrix-evidence')?.sourceIds).toEqual(
            expect.arrayContaining(['time-management-meta', 'urgency-effect']),
        );
        expect(book.blocks.find((block) => block.id === 'pseudo-listening')?.sourceIds).toContain('listening-meta');
        expect(book.blocks.find((block) => block.id === 'compromise-boundary')?.sourceIds).toContain('team-diversity-meta');
        expect(book.blocks.find((block) => block.id === 'win-win-boundary')?.sourceIds).toContain('negotiation-meta');
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('registers Dalio separately with the editorial volume and sources', () => {
        const { context, Reading } = createReading();
        expect(Reading.BOOKS).toHaveLength(0);
        vm.runInContext(dalioSource, context);
        const book = Reading.getBookById('ray-dalio-principles');
        expect(book).toBeTruthy();
        expectBookFitsDepthProfile(Reading, book, 'deep');
        expect(book.sources).toHaveLength(4);
        expect(book.editorialRank).toBe(10);
        expect(book.schemaVersion).toBe(3);
        expect(book.blocks[2].items).toHaveLength(6);
        expect(book.blocks[3]).toMatchObject({ type: 'applicability', voice: 'review' });
        expect(book.blocks.filter((block) => block.type === 'details')).toHaveLength(5);
        expect(book.blocks.filter((block) => block.sectionRole === 'decision-process')).toHaveLength(1);
        expect(book.blocks.some((block) => block.text?.includes('Боль + осмысление'))).toBe(true);
        expect(Reading.getCatalogDiagnostics().errors).toEqual([]);
    });

    it('requires a depth profile and enforces its own word range', () => {
        const { context, Reading } = createReading();
        vm.runInContext(atomicHabitsSource, context);
        const source = Reading.BOOKS[0];
        expect(Reading.DEPTH_PROFILES.compact).toEqual({ minWords: 1200, maxWords: 1700 });
        expect(Reading.DEPTH_PROFILES.standard).toEqual({ minWords: 1700, maxWords: 2400 });
        expect(Reading.DEPTH_PROFILES.deep).toEqual({ minWords: 2400, maxWords: 3400 });

        const missing = structuredClone(source);
        delete missing.depthProfile;
        expect(Reading.validateBookSummary(missing, [missing]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_DEPTH_PROFILE', path: 'james-clear-atomic-habits.depthProfile' }),
        );

        const compactTooLong = structuredClone(source);
        compactTooLong.depthProfile = 'compact';
        const compactOverflow = Reading.DEPTH_PROFILES.compact.maxWords - Reading.getBookWordCount(compactTooLong) + 1;
        compactTooLong.blocks.find((block) => block.type === 'details').text += ' ' + Array(compactOverflow).fill('слово').join(' ');
        expect(Reading.validateBookSummary(compactTooLong, [compactTooLong]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_WORD_COUNT', message: expect.stringContaining('compact') }),
        );

        const compact = structuredClone(source);
        compact.id = 'compact-calibration-book';
        compact.depthProfile = 'compact';
        expect(Reading.validateBookSummary(compact, [compact]).valid).toBe(true);

        const deepTooShort = structuredClone(source);
        deepTooShort.depthProfile = 'deep';
        expect(Reading.validateBookSummary(deepTooShort, [deepTooShort]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_WORD_COUNT', message: expect.stringContaining('deep') }),
        );

        const deep = structuredClone(source);
        deep.id = 'deep-calibration-book';
        deep.depthProfile = 'deep';
        const extraWords = Reading.DEPTH_PROFILES.deep.minWords - Reading.getBookWordCount(deep);
        deep.blocks.find((block) => block.type === 'details').text += ' ' + Array(extraWords).fill('слово').join(' ');
        expect(Reading.validateBookSummary(deep, [deep]).valid).toBe(true);
    });

    it('keeps popular canon as a controlled optional editorial role', () => {
        const { context, Reading } = createReading();
        vm.runInContext(atomicHabitsSource, context);
        const book = structuredClone(Reading.BOOKS[0]);
        book.editorialRole = 'popular-canon';

        expect(Reading.getEditorialRole(book.editorialRole)).toEqual({
            id: 'popular-canon',
            label: 'Популярный канон',
            description: expect.stringContaining('не означает редакционную рекомендацию'),
        });
        expect(Reading.validateBookSummary(book, [book]).errors).toEqual([]);
        expect(Reading.filterBooks([book], { query: 'популярный канон' })).toHaveLength(1);

        book.editorialRole = 'bestseller';
        expect(Reading.validateBookSummary(book, [book]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_EDITORIAL_ROLE', path: 'james-clear-atomic-habits.editorialRole' }),
        );
    });

    it('requires exact, unambiguous and non-overlapping highlight fragments', () => {
        const { context, Reading } = createReading();
        vm.runInContext(dalioSource, context);
        const source = Reading.BOOKS[0];

        const missing = structuredClone(source);
        delete missing.blocks[0].highlights;
        expect(Reading.validateBookSummary(missing, [missing]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_HIGHLIGHT_REQUIRED', path: 'ray-dalio-principles.blocks[0].highlights.text' }),
        );

        const malformed = structuredClone(source);
        malformed.blocks[0].highlights = {
            unknown: ['ошибок'],
            text: ['нет такого фрагмента'],
        };
        const malformedErrors = Reading.validateBookSummary(malformed, [malformed]).errors;
        expect(malformedErrors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'E_HIGHLIGHT_TARGET', path: 'ray-dalio-principles.blocks[0].highlights.unknown' }),
            expect.objectContaining({ code: 'E_HIGHLIGHT_NOT_FOUND', path: 'ray-dalio-principles.blocks[0].highlights.text[0]' }),
        ]));

        const ambiguous = structuredClone(source);
        ambiguous.blocks[0].highlights.text = ['для'];
        expect(Reading.validateBookSummary(ambiguous, [ambiguous]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_HIGHLIGHT_AMBIGUOUS', path: 'ray-dalio-principles.blocks[0].highlights.text[0]' }),
        );

        const overlapping = structuredClone(source);
        overlapping.blocks[0].highlights.text = ['искать причины', 'причины повторяющихся ошибок'];
        expect(Reading.validateBookSummary(overlapping, [overlapping]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_HIGHLIGHT_OVERLAP', path: 'ray-dalio-principles.blocks[0].highlights.text[1]' }),
        );
    });

    it('keeps published highlight coverage readable and blocks marker overload', () => {
        const { context, Reading } = createReading();
        [sewellSource, dalioSource, atomicHabitsSource, thinkingFastAndSlowSource, unreasonableHospitalitySource, eMythSource, checklistManifestoSource, sevenHabitsSource]
            .forEach((source) => vm.runInContext(source, context));

        Reading.BOOKS.forEach((book) => {
            const stats = Reading.getBookHighlightStats(book);
            expect(stats.coveragePercent).toBeGreaterThanOrEqual(Reading.HIGHLIGHT_COVERAGE_WARN_MIN);
            expect(stats.coveragePercent).toBeLessThanOrEqual(Reading.HIGHLIGHT_COVERAGE_WARN_MAX);
            expect(stats.readingMinutes).toBeGreaterThanOrEqual(1);
        });

        const overloaded = structuredClone(Reading.BOOKS[0]);
        overloaded.blocks.forEach((block) => {
            const targets = Reading.getHighlightTargets(block);
            if (!targets.length) return;
            block.highlights = Object.fromEntries(targets.map((target) => [target, [block[target]]]));
        });
        expect(Reading.validateBookSummary(overloaded, [overloaded]).errors).toContainEqual(
            expect.objectContaining({ code: 'E_HIGHLIGHT_DENSITY', path: overloaded.id + '.blocks' }),
        );
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
