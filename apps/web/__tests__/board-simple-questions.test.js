// board-simple-questions.test.js — batch resolve helpers for board simple questions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const BOARD_TAB = path.resolve(import.meta.dirname, '../heys_board_tab_v1.js');

function loadBoardHelpers() {
    const src = fs.readFileSync(BOARD_TAB, 'utf8');
    const context = {
        window: { HEYS: {} },
        document: {
            createElement: () => ({ id: '', textContent: '', setAttribute: () => {} }),
            getElementById: () => null,
            head: { appendChild: () => {} },
        },
        navigator: { onLine: true },
        location: { hostname: 'localhost' },
        React: {
            useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
            useEffect: () => {},
            useCallback: (fn) => fn,
            useRef: () => ({ current: null }),
            createElement: () => null,
        },
    };
    vm.createContext(context);
    vm.runInContext(src, context);
    return context.window.HEYS.Board;
}

describe('board simple question batch helpers', () => {
    const Board = loadBoardHelpers();

    it('maps yes/no choice to Russian answer', () => {
        expect(Board.choiceToAnswer('yes')).toBe('да');
        expect(Board.choiceToAnswer('no')).toBe('нет');
        expect(Board.choiceToAnswer('maybe')).toBeNull();
    });

    it('builds resolve entries only for selected questions', () => {
        const questions = [
            { key: 'heys/abc123', ref: 'heys/abc123', question: 'Smoke?' },
            { key: 'heys/def456', ref: 'heys/def456', question: 'Deploy?' },
        ];
        const selections = { 'heys/abc123': 'yes', 'heys/def456': 'no' };
        const entries = Board.buildBatchResolveEntries(questions, selections);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ key: 'heys/abc123', answer: 'да' });
        expect(entries[1]).toMatchObject({ key: 'heys/def456', answer: 'нет' });
        expect(Board.countSimpleSelections(questions, { 'heys/abc123': 'yes' })).toBe(1);
    });

    it('skips questions without selection', () => {
        const questions = [{ key: 'heys/abc123', ref: 'heys/abc123', question: 'Smoke?' }];
        expect(Board.buildBatchResolveEntries(questions, {})).toEqual([]);
        expect(Board.countSimpleSelections(questions, {})).toBe(0);
    });
});
