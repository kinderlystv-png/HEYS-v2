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

    it('rebuilds electric items when a campsite outlet is available', () => {
        const withoutOutlet = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18, { hasOutlet: false });
        const withOutlet = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18, { hasOutlet: true });

        expect(ids(withoutOutlet)).toContain('electric-powerbanks');
        expect(ids(withoutOutlet)).toContain('electric-solar');
        expect(ids(withoutOutlet)).toContain('electric-rechargeable-camp-light');
        expect(ids(withOutlet)).not.toContain('electric-powerbanks');
        expect(ids(withOutlet)).not.toContain('electric-rechargeable-camp-light');
        expect(ids(withOutlet)).toContain('electric-camp-string-lights');
        expect(ids(withOutlet)).toContain('electric-extension');
        expect(ids(withOutlet)).toContain('electric-outlet-cooling');
        expect(withOutlet.utilityLabel).toContain('есть розетка');
    });

    it('rebuilds hygiene items when a campsite shower is available', () => {
        const withoutShower = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18, { hasShower: false });
        const withShower = Planning.buildSeaTentChecklistPreset(2, 0, [], 27, 18, { hasShower: true });

        expect(ids(withoutShower)).toContain('hygiene-portable-shower');
        expect(ids(withoutShower)).toContain('hygiene-shower-shelter');
        expect(ids(withShower)).not.toContain('hygiene-portable-shower');
        expect(ids(withShower)).toContain('hygiene-shower-shoes');
        expect(ids(withShower)).toContain('hygiene-shower-bag');
        expect(withShower.utilityLabel).toContain('есть душ');
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

describe('Mountain checklist preset — parameter-driven rebuild', () => {
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

    it('registers both presets in the registry', () => {
        const presetIds = Planning.CHECKLIST_PRESETS.map((preset) => preset.id);
        expect(presetIds).toContain('sea-tent-camping');
        expect(presetIds).toContain('mountain-trip');
    });

    it('builds a base mountain list with id, title and temperature label', () => {
        const preset = Planning.buildMountainChecklistPreset(2, 0, [], 18, 8);
        expect(preset.id).toBe('mountain-trip');
        expect(preset.title).toBe('Поездка в горы');
        expect(preset.dayTemp).toBe(18);
        expect(preset.nightTemp).toBe(8);
        expect(preset.tempLabel).toBe('днём +18° · ночью +8°');
        expect(ids(preset)).toContain('mtn-pack-backpack');
        expect(ids(preset)).toContain('mtn-nav-map');
    });

    it('swaps tent gear for hut gear by the shelter toggle', () => {
        const tent = Planning.buildMountainChecklistPreset(2, 0, [], 18, 8, { hasShelter: false });
        const hut = Planning.buildMountainChecklistPreset(2, 0, [], 18, 8, { hasShelter: true });

        expect(ids(tent)).toContain('mtn-tent');
        expect(ids(tent)).toContain('mtn-tent-mat');
        expect(ids(tent)).not.toContain('mtn-hut-booking');

        expect(ids(hut)).toContain('mtn-hut-booking');
        expect(ids(hut)).toContain('mtn-hut-indoor-shoes');
        expect(ids(hut)).not.toContain('mtn-tent');
        expect(hut.utilityLabel).toContain('ночёвка в приюте');
    });

    it('adds snow-and-ice technical gear only when the snow toggle is on', () => {
        const noSnow = Planning.buildMountainChecklistPreset(2, 0, [], 10, 2, { hasSnow: false });
        const snow = Planning.buildMountainChecklistPreset(2, 0, [], 10, 2, { hasSnow: true });

        expect(ids(noSnow)).not.toContain('mtn-snow-traction');
        expect(ids(snow)).toContain('mtn-snow-traction');
        expect(ids(snow)).toContain('mtn-snow-iceaxe');
        expect(ids(snow)).toContain('mtn-snow-avalanche');
        expect(snow.utilityLabel).toContain('снег и лёд');
    });

    it('adds a tent snow shovel only when camping on snow', () => {
        const tentSnow = Planning.buildMountainChecklistPreset(2, 0, [], 10, 2, { hasShelter: false, hasSnow: true });
        const hutSnow = Planning.buildMountainChecklistPreset(2, 0, [], 10, 2, { hasShelter: true, hasSnow: true });
        expect(ids(tentSnow)).toContain('mtn-snow-shovel-tent');
        expect(ids(hutSnow)).not.toContain('mtn-snow-shovel-tent');
    });

    it('rebuilds day-band layers: heat gear hot, insulation cold', () => {
        const hot = Planning.buildMountainChecklistPreset(2, 0, [], 32, 14);
        const cold = Planning.buildMountainChecklistPreset(2, 0, [], 8, 2);

        expect(ids(hot)).toContain('mtn-heat-water');
        expect(ids(hot)).not.toContain('mtn-cold-insulated-jacket');

        expect(ids(cold)).toContain('mtn-cold-insulated-jacket');
        expect(ids(cold)).toContain('mtn-cold-thermos-hot');
        expect(ids(cold)).not.toContain('mtn-heat-water');
    });

    it('rebuilds night sleep gear and the sleeping-bag note across bands', () => {
        const warmNight = Planning.buildMountainChecklistPreset(2, 0, [], 18, 24);
        const coldNight = Planning.buildMountainChecklistPreset(2, 0, [], 18, -2);
        const findBag = (preset) => preset.items.find((entry) => entry.id === 'mtn-sleep-bag');

        expect(ids(warmNight)).toContain('mtn-night-warm-liner');
        expect(findBag(warmNight).note).toBe('лёгкий, можно вкладыш');

        expect(ids(coldNight)).toContain('mtn-night-cold-hot-bottle');
        expect(ids(coldNight)).toContain('mtn-night-cold-insulated-mat');
        expect(findBag(coldNight).note).toBe('зимний или экспедиционный');
    });

    it('adds child-by-age gear and scales adult-only counts', () => {
        const family = Planning.buildMountainChecklistPreset(2, 2, [1, 9], 18, 8);
        const adultsOnly = Planning.buildMountainChecklistPreset(2, 0, [], 18, 8);

        expect(ids(family)).toContain('mtn-child-clothes');
        expect(ids(family)).toContain('mtn-baby-carrier'); // возраст 1 → малыш
        expect(ids(family)).toContain('mtn-school-daypack'); // возраст 9 → школьник
        expect(ids(family)).toContain('mtn-child-id'); // оба младше 12

        expect(ids(adultsOnly)).not.toContain('mtn-child-clothes');
        expect(ids(adultsOnly)).not.toContain('mtn-baby-carrier');
    });

    it('clamps temperatures to the shared bounds', () => {
        const preset = Planning.buildMountainChecklistPreset(2, 0, [], 999, -999);
        expect(preset.dayTemp).toBe(45);
        expect(preset.nightTemp).toBe(-5);
    });

    it('resolves the right preset from a saved checklist via the registry', () => {
        const seaPreset = Planning.getChecklistPreset({ presetId: 'sea-tent-camping' });
        const mountainPreset = Planning.getChecklistPreset({ presetId: 'mountain-trip' });
        const mountainByTitle = Planning.getChecklistPreset({ title: 'Поездка в горы' });

        expect(seaPreset.id).toBe('sea-tent-camping');
        expect(mountainPreset.id).toBe('mountain-trip');
        expect(mountainByTitle.id).toBe('mountain-trip');
        expect(Planning.getChecklistPreset({ title: 'Случайный список' })).toBeNull();
    });

    it('reads toggle params from a saved mountain checklist', () => {
        const preset = Planning.getChecklistPreset({ presetId: 'mountain-trip' });
        const params = Planning.getPresetChecklistParams(
            { presetId: 'mountain-trip', adults: 3, hasShelter: true, hasSnow: true },
            preset,
        );
        expect(params.adults).toBe(3);
        expect(params.hasShelter).toBe(true);
        expect(params.hasSnow).toBe(true);
        expect(params.hasOutlet).toBeUndefined();
    });
});

describe('Sea-hotel checklist preset — parameter-driven rebuild', () => {
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

    it('registers the sea-hotel preset', () => {
        expect(Planning.CHECKLIST_PRESETS.map((p) => p.id)).toContain('sea-hotel');
        const preset = Planning.buildSeaHotelChecklistPreset(2, 0, [], 30, 22);
        expect(preset.id).toBe('sea-hotel');
        expect(preset.title).toBe('Поездка на море в отеле');
        expect(ids(preset)).toContain('hotel-beach-swimwear');
    });

    it('swaps food gear by the all-inclusive toggle', () => {
        const selfFood = Planning.buildSeaHotelChecklistPreset(2, 0, [], 30, 22, { allInclusive: false });
        const allIn = Planning.buildSeaHotelChecklistPreset(2, 0, [], 30, 22, { allInclusive: true });

        expect(ids(selfFood)).toContain('hotel-food-breakfast');
        expect(ids(selfFood)).toContain('hotel-food-snacks');
        expect(ids(selfFood)).not.toContain('hotel-ai-wristband');

        expect(ids(allIn)).toContain('hotel-ai-wristband');
        expect(ids(allIn)).not.toContain('hotel-food-breakfast');
        expect(allIn.utilityLabel).toContain('всё включено');
    });

    it('swaps transport gear by the flying toggle', () => {
        const driving = Planning.buildSeaHotelChecklistPreset(2, 0, [], 30, 22, { flying: false });
        const flying = Planning.buildSeaHotelChecklistPreset(2, 0, [], 30, 22, { flying: true });

        expect(ids(driving)).toContain('hotel-car-docs');
        expect(ids(driving)).toContain('hotel-car-emergency');
        expect(ids(driving)).not.toContain('hotel-fly-liquids');

        expect(ids(flying)).toContain('hotel-fly-liquids');
        expect(ids(flying)).toContain('hotel-fly-boarding');
        expect(flying.utilityLabel).toContain('летим');
    });

    it('rebuilds heat gear on a hot beach day', () => {
        const hot = Planning.buildSeaHotelChecklistPreset(2, 0, [], 34, 24);
        const warm = Planning.buildSeaHotelChecklistPreset(2, 0, [], 26, 20);
        expect(ids(hot)).toContain('hotel-heat-water');
        expect(ids(hot)).toContain('hotel-heat-umbrella');
        expect(ids(warm)).not.toContain('hotel-heat-water');
    });

    it('adds child-by-age gear', () => {
        const family = Planning.buildSeaHotelChecklistPreset(2, 2, [1, 9], 30, 22);
        expect(ids(family)).toContain('hotel-child-swimwear');
        expect(ids(family)).toContain('hotel-baby-diapers'); // 1 год → малыш
        expect(ids(family)).toContain('hotel-school-water-toys'); // 9 лет → школьник
        expect(ids(family)).toContain('hotel-child-id');
    });
});

describe('City-apartment checklist preset — parameter-driven rebuild', () => {
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

    it('registers the city-apartment preset', () => {
        expect(Planning.CHECKLIST_PRESETS.map((p) => p.id)).toContain('city-apartment');
        const preset = Planning.buildCityRentChecklistPreset(2, 0, [], 20, 12);
        expect(preset.id).toBe('city-apartment');
        expect(preset.title).toBe('Поездка в другой город, аренда квартиры');
        expect(ids(preset)).toContain('city-apt-checkin-time');
    });

    it('swaps cooking gear by the self-cooking toggle', () => {
        const cook = Planning.buildCityRentChecklistPreset(2, 0, [], 20, 12, { selfCooking: true });
        const eatOut = Planning.buildCityRentChecklistPreset(2, 0, [], 20, 12, { selfCooking: false });

        expect(ids(cook)).toContain('city-cook-groceries');
        expect(ids(cook)).toContain('city-cook-spices');
        expect(ids(cook)).not.toContain('city-eatout-list');

        expect(ids(eatOut)).toContain('city-eatout-list');
        expect(ids(eatOut)).not.toContain('city-cook-groceries');
        expect(cook.utilityLabel).toContain('готовим сами');
    });

    it('swaps transport gear by the flying toggle', () => {
        const driving = Planning.buildCityRentChecklistPreset(2, 0, [], 20, 12, { flying: false });
        const flying = Planning.buildCityRentChecklistPreset(2, 0, [], 20, 12, { flying: true });

        expect(ids(driving)).toContain('city-car-docs');
        expect(ids(driving)).toContain('city-car-nav');
        expect(ids(driving)).not.toContain('city-fly-liquids');

        expect(ids(flying)).toContain('city-fly-liquids');
        expect(ids(flying)).toContain('city-fly-boarding');
        expect(flying.utilityLabel).toContain('летим');
    });

    it('rebuilds cold-city layers below the cool threshold', () => {
        const cold = Planning.buildCityRentChecklistPreset(2, 0, [], 8, 2);
        const warm = Planning.buildCityRentChecklistPreset(2, 0, [], 26, 18);
        expect(ids(cold)).toContain('city-cold-coat');
        expect(ids(cold)).toContain('city-cold-warm-shoes');
        expect(ids(warm)).not.toContain('city-cold-coat');
    });

    it('adds child-by-age gear', () => {
        const family = Planning.buildCityRentChecklistPreset(2, 2, [1, 9], 20, 12);
        expect(ids(family)).toContain('city-child-clothes');
        expect(ids(family)).toContain('city-baby-stroller'); // 1 год → малыш
        expect(ids(family)).toContain('city-school-daypack'); // 9 лет → школьник
        expect(ids(family)).toContain('city-child-id');
    });
});
