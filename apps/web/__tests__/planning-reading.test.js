import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import * as ReactDOM from 'react-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalogSource = fs.readFileSync(path.resolve(__dirname, '../heys_reading_catalog_v1.js'), 'utf8');
const sewellSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/carl-sewell-customers-for-life_v1.js'), 'utf8');
const dalioSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/ray-dalio-principles_v1.js'), 'utf8');
const atomicHabitsSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/james-clear-atomic-habits_v1.js'), 'utf8');
const thinkingFastAndSlowSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/daniel-kahneman-thinking-fast-and-slow_v1.js'), 'utf8');
const unreasonableHospitalitySource = fs.readFileSync(path.resolve(__dirname, '../reading/books/will-guidara-unreasonable-hospitality_v1.js'), 'utf8');
const eMythSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/michael-gerber-e-myth-revisited_v1.js'), 'utf8');
const goodStrategyBadStrategySource = fs.readFileSync(path.resolve(__dirname, '../reading/books/richard-rumelt-good-strategy-bad-strategy_v1.js'), 'utf8');
const noiseSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/kahneman-sibony-sunstein-noise_v1.js'), 'utf8');
const checklistManifestoSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/atul-gawande-checklist-manifesto_v1.js'), 'utf8');
const sevenHabitsSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/stephen-covey-seven-habits_v1.js'), 'utf8');
const powerOfNowSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/eckhart-tolle-power-of-now_v1.js'), 'utf8');
const poltavskyOverlay = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../reading/personalization/poltavsky_v1.json'), 'utf8'));
const uiSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_reading_v1.js'), 'utf8');

function loadReading() {
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.HEYS = {};
    (0, eval)(catalogSource);
    (0, eval)(sewellSource);
    (0, eval)(dalioSource);
    (0, eval)(atomicHabitsSource);
    (0, eval)(thinkingFastAndSlowSource);
    (0, eval)(unreasonableHospitalitySource);
    (0, eval)(eMythSource);
    (0, eval)(goodStrategyBadStrategySource);
    (0, eval)(noiseSource);
    (0, eval)(checklistManifestoSource);
    (0, eval)(sevenHabitsSource);
    (0, eval)(powerOfNowSource);
    (0, eval)(uiSource);
    return { catalog: window.HEYS.Reading, ui: window.HEYS.PlanningReading };
}

describe('planning reading catalog and UI', () => {
    beforeEach(() => {
        history.replaceState({}, '', '/');
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove('reading-reader-open');
        Array.from(document.body.children).forEach((node) => {
            node.inert = false;
            node.removeAttribute('aria-hidden');
        });
        history.replaceState({}, '', '/');
        localStorage.removeItem('heys_reading_preferences_v1');
        localStorage.removeItem('heys_reading_progress_v1');
        sessionStorage.removeItem('heys_reading_position_v1:ray-dalio-principles');
        vi.restoreAllMocks();
    });

    it('validates the catalog and rejects duplicate ids, unsupported blocks and insecure sources', () => {
        const { catalog } = loadReading();
        const book = catalog.BOOKS[0];
        expect(catalog.validateBookSummary(book, catalog.BOOKS).valid).toBe(true);

        const invalid = { ...book, blocks: [{ type: 'html', text: '<b>Нет</b>' }], sources: [{ label: 'Источник', url: 'http://example.com' }] };
        const result = catalog.validateBookSummary(invalid, [invalid, { ...invalid }]);
        expect(result.valid).toBe(false);
        expect(result.errors.map((issue) => issue.code)).toContain('E_BOOK_ID_DUPLICATE');
        expect(result.errors.map((issue) => issue.code)).toContain('E_BLOCK_TYPE');
        expect(result.errors.map((issue) => issue.code)).toContain('E_SOURCE_HTTPS');
    });

    it('normalizes ё and combines text, topic and tag filters predictably', () => {
        const { catalog } = loadReading();
        expect(catalog.normalizeReadingText('  Всё ЁЩЁ  ')).toBe('все еще');
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Рэй Далио' })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'атом прив' }).map((book) => book.id)).toEqual(['james-clear-atomic-habits']);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Канем' }).map((book) => book.id)).toEqual([
            'daniel-kahneman-thinking-fast-and-slow',
            'kahneman-sibony-sunstein-noise',
        ]);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'системность' })).toHaveLength(10);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Рум' }).map((book) => book.id)).toEqual(['richard-rumelt-good-strategy-bad-strategy']);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'техник менеджер' }).map((book) => book.id)).toEqual(['michael-gerber-e-myth-revisited']);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'клиенты лояльность' }).map((book) => book.id)).toEqual([
            'carl-sewell-customers-for-life',
            'will-guidara-unreasonable-hospitality',
        ]);
        expect(catalog.filterBooks([{ ...catalog.BOOKS[0], title: 'Всё ещё возможно' }], { query: 'все еще' })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Боль осмысление' }).map((book) => book.id)).toEqual(['ray-dalio-principles']);
        expect(catalog.filterBooks(catalog.BOOKS, { topic: 'service', tags: ['customers', 'loyalty'] }).map((book) => book.id)).toEqual([
            'carl-sewell-customers-for-life',
            'will-guidara-unreasonable-hospitality',
        ]);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Далио', topic: 'management', tags: [] })).toHaveLength(1);
        expect(catalog.estimateReadingMinutes(catalog.BOOKS[0])).toBeGreaterThan(1);
        expect(catalog.getBookById('ray-dalio-principles')?.id).toBe('ray-dalio-principles');
    });

    it('searches the whole summary, filters by clickable tags and resets an empty state', () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));

        expect(screen.getByRole('heading', { name: 'Библиотека' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Поиск по библиотеке'), { target: { value: 'психологической безопасности' } });
        expect(screen.getByText('1 книга')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'решения' }));
        expect(screen.getByRole('button', { name: 'решения' }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.change(screen.getByLabelText('Поиск по библиотеке'), { target: { value: 'несуществующая книга' } });
        expect(screen.getByRole('heading', { name: 'Ничего не найдено' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
        expect(screen.getByRole('button', { name: /Открыть «Принципы/ })).toBeTruthy();
    });

    it('shows popular canon on the cover and explains that it is not a recommendation', () => {
        const { catalog, ui } = loadReading();
        const popularBook = structuredClone(catalog.getBookById('james-clear-atomic-habits'));
        popularBook.id = 'popular-canon-preview';
        popularBook.title = 'Популярная книга';
        popularBook.editorialRank = 1;
        popularBook.editorialRole = 'popular-canon';
        expect(catalog.registerBook(popularBook).registered).toBe(true);

        render(React.createElement(ui.ReadingScreen));
        const opener = screen.getByRole('button', { name: /Открыть «Популярная книга».*Популярный канон/ });
        expect(screen.getByText('Популярный канон')).toBeTruthy();
        expect(screen.queryByText(/Плашка не означает редакционную рекомендацию/)).toBeNull();

        fireEvent.click(opener);
        const explanation = screen.getByRole('complementary', { name: 'Редакционная пометка' });
        expect(explanation.textContent).toContain('Популярный канон');
        expect(explanation.textContent).toContain('Плашка не означает редакционную рекомендацию');
    });

    it('keeps recommended order without a sorting control and exposes a shared reset action', () => {
        const { catalog, ui } = loadReading();
        const original = catalog.BOOKS.slice();
        expect(catalog.sortBooks(catalog.BOOKS, 'author')).not.toBe(catalog.BOOKS);
        expect(catalog.BOOKS).toEqual(original);
        expect(catalog.sortBooks(catalog.BOOKS, 'recommended').map((book) => book.id)).toEqual([
            'ray-dalio-principles',
            'will-guidara-unreasonable-hospitality',
            'carl-sewell-customers-for-life',
            'atul-gawande-checklist-manifesto',
            'michael-gerber-e-myth-revisited',
            'richard-rumelt-good-strategy-bad-strategy',
            'james-clear-atomic-habits',
            'kahneman-sibony-sunstein-noise',
            'daniel-kahneman-thinking-fast-and-slow',
            'stephen-covey-seven-habits',
            'eckhart-tolle-power-of-now',
        ]);
        const later = { ...catalog.BOOKS[0], id: 'later-book', title: 'Позже', editorialRank: 20 };
        const earlier = { ...catalog.BOOKS[0], id: 'earlier-book', title: 'Раньше', editorialRank: 5 };
        expect(catalog.sortBooks([later, earlier], 'recommended').map((book) => book.id)).toEqual(['earlier-book', 'later-book']);
        expect(catalog.formatBookCount(1)).toBe('1 книга');
        expect(catalog.formatBookCount(2)).toBe('2 книги');
        expect(catalog.formatBookCount(11)).toBe('11 книг');

        render(React.createElement(ui.ReadingScreen));
        expect(screen.queryByLabelText('Сортировка')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Мышление' }));
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Все теги' }));
        const hiddenTag = screen.getByRole('button', { name: 'Фильтр по тегу команды' });
        fireEvent.click(hiddenTag);
        expect(hiddenTag.getAttribute('aria-pressed')).toBe('true');
    });

    it('opens a semantic fullscreen reader with separated content and safe sources', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        const opener = screen.getByRole('button', { name: /Открыть «Принципы/ });
        opener.focus();
        fireEvent.click(opener);
        expect(new URL(location.href).searchParams.get('reading')).toBe('ray-dalio-principles');

        const dialog = screen.getByRole('dialog', { name: 'Принципы. Жизнь и работа' });
        expect(dialog).toBeTruthy();
        expect(document.body.classList.contains('reading-reader-open')).toBe(true);
        expect(screen.getByText('Авторский пример')).toBeTruthy();
        const quickSummary = dialog.querySelector('.reading-block--quick-summary');
        const applicability = dialog.querySelector('.reading-block--applicability');
        const depthLabel = screen.getByText('Полный разбор');
        expect(quickSummary?.textContent).toContain('Краткая выжимка · пересказ');
        expect(quickSummary?.querySelectorAll('li')).toHaveLength(6);
        expect(applicability?.textContent).toContain('Второе мнение · HEYS');
        expect(applicability?.textContent).toContain('Где граница');
        expect(quickSummary.compareDocumentPosition(depthLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(applicability.compareDocumentPosition(depthLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const recap = dialog.querySelector('.reading-reader-recap');
        const sources = dialog.querySelector('.reading-sources');
        expect(recap?.open).toBe(false);
        expect(recap?.querySelector('summary')?.textContent).toContain('Книга в 6 тезисах');
        expect(recap?.querySelectorAll('li')).toHaveLength(6);
        expect(recap.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(recap.querySelector('summary'));
        expect(recap.open).toBe(true);
        expect(recap.querySelector('li')?.textContent).toBe(quickSummary.querySelector('li')?.textContent);
        expect(dialog.querySelector('blockquote')).toBeTruthy();
        const details = dialog.querySelectorAll('.reading-block--details');
        expect(details).toHaveLength(5);
        expect(details[0].open).toBe(false);
        fireEvent.click(details[0].querySelector('summary'));
        expect(details[0].open).toBe(true);
        const toc = screen.getByText('Содержание').closest('details');
        fireEvent.click(toc.querySelector('summary'));
        expect(toc.querySelectorAll('nav a')).toHaveLength(9);
        expect(toc.querySelector('nav a').getAttribute('href')).toBe('#reading-section-ray-dalio-principles-overview-heading');
        expect(Array.from(dialog.querySelectorAll('h1, h2')).map((heading) => heading.tagName)).toEqual(['H1', ...Array(dialog.querySelectorAll('h2').length).fill('H2')]);
        const sourceReference = screen.getAllByRole('link', { name: /Источник 1:/ })[0];
        expect(sourceReference.getAttribute('href')).toBe('#reading-source-ray-dalio-principles-1');
        expect(dialog.querySelector('#reading-source-ray-dalio-principles-1')).toBeTruthy();
        const source = screen.getByRole('link', { name: 'Harvard Business Review: условия полезной прозрачности' });
        expect(source.getAttribute('target')).toBe('_blank');
        expect(source.getAttribute('rel')).toBe('noopener noreferrer');
        expect(dialog.querySelector('[dangerouslySetInnerHTML]')).toBeNull();

        history.replaceState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(opener));
    });

    it('shows project applicability only when a client-scoped overlay is supplied', () => {
        const { ui } = loadReading();
        const { unmount } = render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        expect(screen.queryByRole('heading', { name: 'Для ваших проектов' })).toBeNull();
        unmount();
        document.body.classList.remove('reading-reader-open');
        Array.from(document.body.children).forEach((node) => {
            node.inert = false;
            node.removeAttribute('aria-hidden');
        });
        history.replaceState({}, '', '/');

        loadReading();
        render(React.createElement(window.HEYS.PlanningReading.ReadingScreen, { personalization: poltavskyOverlay }));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        const personal = screen.getByRole('heading', { name: 'Для ваших проектов' }).closest('.reading-personalization');
        expect(personal.textContent).toContain('только этот аккаунт');
        expect(personal.querySelectorAll('.reading-personalization__project')).toHaveLength(2);
        expect(Array.from(personal.querySelectorAll('.reading-personalization__project')).every((project) => project.open === false)).toBe(true);
        fireEvent.click(screen.getByText('Kinderly'));
        expect(personal.textContent).toContain('Вопросы для размышления');
        fireEvent.click(screen.getByRole('button', { name: 'Показать только главное' }));
        expect(screen.queryByRole('heading', { name: 'Для ваших проектов' })).toBeNull();
    });

    it('loads personalization through the session-safe KV key and rejects a client mismatch', async () => {
        const { ui } = loadReading();
        window.HEYS.YandexAPI = { getKV: vi.fn(async () => ({ data: poltavskyOverlay })) };
        await expect(ui.loadReadingPersonalization(poltavskyOverlay.clientId)).resolves.toEqual(poltavskyOverlay);
        expect(window.HEYS.YandexAPI.getKV).toHaveBeenCalledWith(poltavskyOverlay.clientId, 'heys_reading_personalization_v1');

        const mismatched = structuredClone(poltavskyOverlay);
        mismatched.clientId = '11111111-1111-4111-8111-111111111111';
        window.HEYS.YandexAPI.getKV = vi.fn(async () => ({ data: mismatched }));
        await expect(ui.loadReadingPersonalization(poltavskyOverlay.clientId)).resolves.toBeNull();
    });

    it('keeps search and tag filters after closing the reader', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        const search = screen.getByLabelText('Поиск по библиотеке');
        fireEvent.change(search, { target: { value: 'Далио' } });
        fireEvent.click(screen.getByRole('button', { name: 'решения' }));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        history.replaceState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(search.value).toBe('Далио');
        expect(screen.getByRole('button', { name: 'решения' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('closes on Escape and restores the per-book reading position', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        const opener = screen.getByRole('button', { name: /Открыть «Принципы/ });
        fireEvent.click(opener);
        const dialog = screen.getByRole('dialog');
        dialog.scrollTop = 420;
        fireEvent.scroll(dialog);
        history.replaceState({}, '', '/');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(opener);
        await waitFor(() => expect(screen.getByRole('dialog').scrollTop).toBe(420));
    });

    it('keeps reader font size and theme as local reading preferences', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        const dialog = screen.getByRole('dialog');
        const slider = screen.getByRole('slider', { name: 'Размер текста' });
        const theme = screen.getByRole('button', { name: 'Тёмная тема ридера' });
        expect(slider.min).toBe('14');
        expect(slider.max).toBe('18');
        fireEvent.change(slider, { target: { value: '17' } });
        fireEvent.click(theme);

        expect(dialog.classList.contains('reading-reader--dark')).toBe(true);
        expect(dialog.style.getPropertyValue('--reading-reader-font-size')).toBe('17px');
        await waitFor(() => expect(JSON.parse(localStorage.getItem('heys_reading_preferences_v1'))).toEqual({
            fontSize: 17,
            theme: 'dark',
            markerEnabled: true,
            markerColor: 'yellow',
        }));
    });

    it('renders semantic markers and persists their visibility and color locally', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        const dialog = screen.getByRole('dialog');
        expect(dialog.querySelectorAll('mark.reading-text-mark').length).toBeGreaterThan(20);
        expect(screen.getByText('искать причины повторяющихся ошибок').tagName).toBe('MARK');

        fireEvent.click(screen.getByRole('button', { name: 'Цвет маркера: Жёлтый' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Голубой' }));
        expect(dialog.classList.contains('reading-reader--marker-blue')).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Выключить маркер' }));
        expect(dialog.querySelector('mark.reading-text-mark')).toBeNull();

        await waitFor(() => expect(JSON.parse(localStorage.getItem('heys_reading_preferences_v1'))).toMatchObject({
            markerEnabled: false,
            markerColor: 'blue',
        }));
    });

    it('builds “Главное” from highlights without changing full-reading progress', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        const opener = screen.getByRole('button', { name: /Открыть «Принципы/ });
        fireEvent.click(opener);
        const dialog = screen.getByRole('dialog');
        Object.defineProperty(dialog, 'scrollHeight', { configurable: true, value: 1000 });
        Object.defineProperty(dialog, 'clientHeight', { configurable: true, value: 500 });
        dialog.scrollTop = 250;
        fireEvent.scroll(dialog);

        fireEvent.click(screen.getByRole('button', { name: 'Показать только главное' }));
        await waitFor(() => expect(dialog.classList.contains('reading-reader--key-view')).toBe(true));
        expect(screen.getByText('Тезисы и ограничения без примеров и доказательств. Для контекста вернитесь к полному разбору.')).toBeTruthy();
        expect(screen.getAllByText('HEYS').length).toBeGreaterThan(1);
        expect(screen.queryByText(/описывает людей как элементы машины/)).toBeNull();
        dialog.scrollTop = 400;
        fireEvent.scroll(dialog);

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(JSON.parse(localStorage.getItem('heys_reading_progress_v1'))['ray-dalio-principles']).toMatchObject({ position: 250, percent: 50 });

        fireEvent.click(opener);
        await waitFor(() => expect(screen.getByRole('dialog').scrollTop).toBe(250));
        expect(screen.getByRole('button', { name: 'Показать только главное' })).toBeTruthy();
    });

    it('opens a direct book URL and removes the parameter when closing a direct entry', async () => {
        history.replaceState({}, '', '/?reading=carl-sewell-customers-for-life');
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        expect(screen.getByRole('dialog', { name: 'Клиенты на всю жизнь' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Закрыть саммари' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(new URL(location.href).searchParams.has('reading')).toBe(false);
    });

    it('shows a persistent continue action and a matching search excerpt', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        fireEvent.click(screen.getByRole('button', { name: /Открыть «Принципы/ }));
        const dialog = screen.getByRole('dialog');
        Object.defineProperty(dialog, 'scrollHeight', { configurable: true, value: 1000 });
        Object.defineProperty(dialog, 'clientHeight', { configurable: true, value: 500 });
        dialog.scrollTop = 250;
        fireEvent.scroll(dialog);
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.getByRole('button', { name: /Продолжить чтение · 50%/ })).toBeTruthy());

        fireEvent.change(screen.getByLabelText('Поиск по библиотеке'), { target: { value: 'домашние телефоны' } });
        await waitFor(() => expect(document.querySelector('.reading-card__excerpt')?.textContent).toMatch(/домашние телефоны/i));
    });

    it('contains no raw HTML payloads in the catalog', () => {
        const { catalog } = loadReading();
        const serialized = JSON.stringify(catalog.BOOKS);
        expect(serialized).not.toMatch(/<\/?[a-z][^>]*>/i);
        expect(serialized).not.toContain('dangerouslySetInnerHTML');
        expect(uiSource).not.toContain('ModalManager');
    });
});
