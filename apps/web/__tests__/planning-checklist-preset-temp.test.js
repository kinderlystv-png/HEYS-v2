import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

function loadPlanningModule() {
    const filePath = path.resolve(__dirname, '../heys_planning_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
    return window.HEYS.Planning;
}

function ids(preset) {
    return preset.items.map((entry) => entry.id);
}

describe('Sea-tent checklist preset — temperature-driven rebuild', () => {
    let Planning;

    beforeEach(() => {
        window.HEYS = {};
        window.React = { createElement: () => null };
        window.ReactDOM = {};
        Planning = loadPlanningModule();
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
    });

    it('classifies day temperature into four bands', () => {
        expect(Planning.getDayTempBand(34)).toBe('hot');
        expect(Planning.getDayTempBand(30)).toBe('hot');
        expect(Planning.getDayTempBand(27)).toBe('warm');
        expect(Planning.getDayTempBand(22)).toBe('warm');
        expect(Planning.getDayTempBand(18)).toBe('cool');
        expect(Planning.getDayTempBand(15)).toBe('cool');
        expect(Planning.getDayTempBand(10)).toBe('cold');
    });

    it('classifies night temperature into four bands', () => {
        expect(Planning.getNightTempBand(22)).toBe('warm');
        expect(Planning.getNightTempBand(20)).toBe('warm');
        expect(Planning.getNightTempBand(16)).toBe('mild');
        expect(Planning.getNightTempBand(12)).toBe('mild');
        expect(Planning.getNightTempBand(8)).toBe('cool');
        expect(Planning.getNightTempBand(5)).toBe('cool');
        expect(Planning.getNightTempBand(-2)).toBe('cold');
    });

    it('adds heat-specific gear on a hot day and drops it when warm', () => {
        const hot = Planning.buildSeaTentChecklistPreset(2, 0, [], 34, 18);
        const warm = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18);
        expect(ids(hot)).toContain('heat-extra-water');
        expect(ids(hot)).toContain('heat-cooling');
        expect(ids(warm)).not.toContain('heat-extra-water');
        expect(hot.items.length).toBeGreaterThan(warm.items.length);
    });

    it('adds cold-day layers below the cool threshold', () => {
        const cold = Planning.buildSeaTentChecklistPreset(2, 0, [], 10, 18);
        const cool = Planning.buildSeaTentChecklistPreset(2, 0, [], 18, 18);
        expect(ids(cold)).toContain('cold-jacket');
        expect(ids(cold)).toContain('cold-thermos');
        expect(ids(cool)).toContain('cool-fleece');
        expect(ids(cool)).not.toContain('cold-jacket');
    });

    it('rebuilds night sleep gear and the sleeping-bag note across bands', () => {
        const warmNight = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 24);
        const coldNight = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, -2);
        const findBag = (preset) => preset.items.find((entry) => entry.id === 'sleep-bags');

        expect(ids(warmNight)).toContain('night-warm-liner');
        expect(findBag(warmNight).note).toBe('лёгкие, можно вкладыш');

        expect(ids(coldNight)).toContain('night-cold-hot-bottle');
        expect(ids(coldNight)).toContain('night-cold-insulated-mat');
        expect(findBag(coldNight).note).toBe('зимние или демисезонные');
    });

    it('mild night leaves the base sleeping bags without a temperature note', () => {
        const mild = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 16);
        const bag = mild.items.find((entry) => entry.id === 'sleep-bags');
        expect(bag.note).toBeFalsy();
        expect(ids(mild)).not.toContain('night-cold-hot-bottle');
        expect(ids(mild)).not.toContain('night-warm-liner');
    });

    it('clamps and echoes resolved temperatures with a summary label', () => {
        const preset = Planning.buildSeaTentChecklistPreset(2, 0, [], 999, -999);
        expect(preset.dayTemp).toBe(45);
        expect(preset.nightTemp).toBe(-5);
        expect(preset.tempLabel).toBe('днём +45° · ночью -5°');
    });

    it('falls back to defaults when temperatures are missing', () => {
        const preset = Planning.buildSeaTentChecklistPreset(2, 0, []);
        expect(preset.dayTemp).toBe(27);
        expect(preset.nightTemp).toBe(18);
        expect(preset.tempLabel).toBe('днём +27° · ночью +18°');
    });
});

describe('Sea-tent checklist preset — per-checklist item overlay', () => {
    let Planning;

    beforeEach(() => {
        window.HEYS = {};
        window.React = { createElement: () => null };
        window.ReactDOM = {};
        Planning = loadPlanningModule();
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
    });

    it('drops tombstoned preset items and keeps the rest', () => {
        const preset = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18);
        const result = Planning.materializeSeaTentItems(preset.items, preset.items, ['docs-cash']);
        const resultIds = result.map((entry) => entry.id);
        expect(resultIds).not.toContain('docs-cash');
        expect(resultIds).toContain('docs-passports');
    });

    it('keeps a manual item and the removal across a temperature rebuild', () => {
        const presetWarm = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18);
        const removed = ['docs-cash'];
        const custom = { id: 'custom-abc', group: 'Еда', text: 'Арбуз', quantity: '1 шт.', done: false, order: 9999 };
        const afterEdits = presetWarm.items
            .filter((entry) => entry.id !== 'docs-cash')
            .concat(custom);

        // Температура меняется → пресет пересобирается из шаблона, оверлей применяется заново.
        const presetHot = Planning.buildSeaTentChecklistPreset(2, 0, [], 34, 18);
        const rebuilt = Planning.materializeSeaTentItems(presetHot.items, afterEdits, removed);
        const rebuiltIds = rebuilt.map((entry) => entry.id);

        expect(rebuiltIds).not.toContain('docs-cash'); // удаление переживает пересборку
        expect(rebuiltIds).toContain('custom-abc'); // ручной пункт переживает пересборку
        expect(rebuiltIds).toContain('heat-extra-water'); // новые пункты диапазона добавились
        expect(rebuilt.find((entry) => entry.id === 'custom-abc').text).toBe('Арбуз');
    });

    it('preserves done state of surviving preset items through rebuild', () => {
        const presetA = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18);
        const current = presetA.items.map((entry) => (
            entry.id === 'docs-passports' ? { ...entry, done: true } : entry
        ));
        const presetB = Planning.buildSeaTentChecklistPreset(3, 0, [], 27, 18);
        const rebuilt = Planning.materializeSeaTentItems(presetB.items, current, []);
        expect(rebuilt.find((entry) => entry.id === 'docs-passports').done).toBe(true);
    });

    it('keeps the manual item done state as stored', () => {
        const preset = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18);
        const custom = { id: 'custom-x', group: 'Еда', text: 'Чай', done: true, order: 9999 };
        const result = Planning.materializeSeaTentItems(preset.items, preset.items.concat(custom), []);
        expect(result.find((entry) => entry.id === 'custom-x').done).toBe(true);
    });
});
