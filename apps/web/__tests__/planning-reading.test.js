import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import * as ReactDOM from 'react-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalogSource = fs.readFileSync(path.resolve(__dirname, '../heys_reading_catalog_v1.js'), 'utf8');
const sewellSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/carl-sewell-customers-for-life_v1.js'), 'utf8');
const dalioSource = fs.readFileSync(path.resolve(__dirname, '../reading/books/ray-dalio-principles_v1.js'), 'utf8');
const uiSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_reading_v1.js'), 'utf8');

function loadReading() {
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.HEYS = {};
    (0, eval)(catalogSource);
    (0, eval)(sewellSource);
    (0, eval)(dalioSource);
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
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'системность' })).toHaveLength(2);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'клиенты лояльность' })).toHaveLength(1);
        expect(catalog.filterBooks([{ ...catalog.BOOKS[0], title: 'Всё ещё возможно' }], { query: 'все еще' })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Боль осмысление', topic: 'thinking', tags: ['decisions'] })).toHaveLength(1);
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

    it('sorts without mutating the catalog and exposes a shared reset action', () => {
        const { catalog, ui } = loadReading();
        const original = catalog.BOOKS.slice();
        expect(catalog.sortBooks(catalog.BOOKS, 'author')).not.toBe(catalog.BOOKS);
        expect(catalog.BOOKS).toEqual(original);
        expect(catalog.sortBooks(catalog.BOOKS, 'recommended').map((book) => book.id)).toEqual(['ray-dalio-principles', 'carl-sewell-customers-for-life']);
        const later = { ...catalog.BOOKS[0], id: 'later-book', title: 'Позже', editorialRank: 20 };
        const earlier = { ...catalog.BOOKS[0], id: 'earlier-book', title: 'Раньше', editorialRank: 5 };
        expect(catalog.sortBooks([later, earlier], 'recommended').map((book) => book.id)).toEqual(['earlier-book', 'later-book']);
        expect(catalog.formatBookCount(1)).toBe('1 книга');
        expect(catalog.formatBookCount(2)).toBe('2 книги');
        expect(catalog.formatBookCount(11)).toBe('11 книг');

        render(React.createElement(ui.ReadingScreen));
        expect(screen.getByLabelText('Сортировка')).toBeTruthy();
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
        expect(dialog.querySelector('blockquote')).toBeTruthy();
        const details = dialog.querySelectorAll('.reading-block--details');
        expect(details).toHaveLength(3);
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
        fireEvent.change(slider, { target: { value: '21' } });
        fireEvent.click(theme);

        expect(dialog.classList.contains('reading-reader--dark')).toBe(true);
        expect(dialog.style.getPropertyValue('--reading-reader-font-size')).toBe('21px');
        await waitFor(() => expect(JSON.parse(localStorage.getItem('heys_reading_preferences_v1'))).toEqual({ fontSize: 21, theme: 'dark' }));
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
