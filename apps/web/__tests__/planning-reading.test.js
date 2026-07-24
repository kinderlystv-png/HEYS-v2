import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import * as ReactDOM from 'react-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalogSource = fs.readFileSync(path.resolve(__dirname, '../heys_reading_catalog_v1.js'), 'utf8');
const uiSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_reading_v1.js'), 'utf8');

function loadReading() {
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.HEYS = {};
    (0, eval)(catalogSource);
    (0, eval)(uiSource);
    return { catalog: window.HEYS.Reading, ui: window.HEYS.PlanningReading };
}

describe('planning reading catalog and UI', () => {
    beforeEach(() => {
        history.replaceState({}, '');
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove('reading-reader-open');
        Array.from(document.body.children).forEach((node) => {
            node.inert = false;
            node.removeAttribute('aria-hidden');
        });
        history.replaceState({}, '');
        vi.restoreAllMocks();
    });

    it('validates the catalog and rejects duplicate ids, unsupported blocks and insecure sources', () => {
        const { catalog } = loadReading();
        const book = catalog.BOOKS[0];
        expect(catalog.validateBookSummary(book, catalog.BOOKS)).toEqual({ valid: true, errors: [] });

        const invalid = { ...book, blocks: [{ type: 'html', text: '<b>Нет</b>' }], sources: [{ label: 'Источник', url: 'http://example.com' }] };
        const result = catalog.validateBookSummary(invalid, [invalid, { ...invalid }]);
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/Повторяющийся id/);
        expect(result.errors.join(' ')).toMatch(/Недопустимый тип блока/);
        expect(result.errors.join(' ')).toMatch(/HTTPS/);
    });

    it('normalizes ё and combines text, topic and tag filters predictably', () => {
        const { catalog } = loadReading();
        expect(catalog.normalizeReadingText('  Всё ЁЩЁ  ')).toBe('все еще');
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Рэй Далио' })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'системность' })).toHaveLength(1);
        expect(catalog.filterBooks([{ ...catalog.BOOKS[0], title: 'Всё ещё возможно' }], { query: 'все еще' })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Боль осмысление', topic: 'Мышление', tags: ['решения'] })).toHaveLength(1);
        expect(catalog.filterBooks(catalog.BOOKS, { query: 'Далио', topic: 'Привычки', tags: [] })).toHaveLength(0);
        expect(catalog.estimateReadingMinutes(catalog.BOOKS[0])).toBeGreaterThan(1);
        expect(catalog.getBookById('ray-dalio-principles')).toBe(catalog.BOOKS[0]);
    });

    it('searches the whole summary, filters by clickable tags and resets an empty state', () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));

        expect(screen.getByRole('heading', { name: 'Библиотека' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Поиск по библиотеке'), { target: { value: 'психологической безопасности' } });
        expect(screen.getByText('Найдено: 1')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'решения' }));
        expect(screen.getByRole('button', { name: 'решения' }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.change(screen.getByLabelText('Поиск по библиотеке'), { target: { value: 'несуществующая книга' } });
        expect(screen.getByRole('heading', { name: 'Ничего не найдено' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
        expect(screen.getByRole('button', { name: /Открыть «Принципы/ })).toBeTruthy();
    });

    it('opens a semantic fullscreen reader with separated content and safe sources', async () => {
        const { ui } = loadReading();
        render(React.createElement(ui.ReadingScreen));
        const opener = screen.getByRole('button', { name: /Открыть «Принципы/ });
        opener.focus();
        fireEvent.click(opener);

        const dialog = screen.getByRole('dialog', { name: 'Принципы. Жизнь и работа' });
        expect(dialog).toBeTruthy();
        expect(document.body.classList.contains('reading-reader-open')).toBe(true);
        expect(screen.getByText('Авторский пример')).toBeTruthy();
        expect(dialog.querySelector('blockquote')).toBeTruthy();
        expect(Array.from(dialog.querySelectorAll('h1, h2')).map((heading) => heading.tagName)).toEqual(['H1', ...Array(dialog.querySelectorAll('h2').length).fill('H2')]);
        const source = screen.getByRole('link', { name: /Harvard Business Review/ });
        expect(source.getAttribute('target')).toBe('_blank');
        expect(source.getAttribute('rel')).toBe('noopener noreferrer');
        expect(dialog.querySelector('[dangerouslySetInnerHTML]')).toBeNull();

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
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(search.value).toBe('Далио');
        expect(screen.getByRole('button', { name: 'решения' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('contains no raw HTML payloads in the catalog', () => {
        const { catalog } = loadReading();
        const serialized = JSON.stringify(catalog.BOOKS);
        expect(serialized).not.toMatch(/<\/?[a-z][^>]*>/i);
        expect(serialized).not.toContain('dangerouslySetInnerHTML');
    });
});
