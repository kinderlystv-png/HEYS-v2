/**
 * Регрессия на «тихие промахи» вкладки «Инсайты»: вызовы через optional
 * chaining (`HEYS.X?.method?.()`), которые ссылаются на несуществующие имена.
 * Промах глушится — ошибок в консоли нет, модуль молча деградирует в нули и
 * фолбэки.
 *
 * Принцип тот же, что в widgets-missing-callees.test.js: тест читает ИСХОДНИК
 * и резолвит имя против НАСТОЯЩЕГО модуля. Мок здесь бесполезен — именно мок
 * несуществующего имени (`thresholds.getAdaptiveThresholds` в
 * pi_meal_recommender.test.js) годами держал дефект зелёным.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function evalModule(relPath) {
    // eslint-disable-next-line no-new-func
    new Function('window', read(relPath))(global);
}

describe('норма калорий берётся из TDEE, а не из жёстких 2000', () => {
    beforeAll(() => {
        global.window = global;
        global.HEYS = {};
        evalModule('apps/web/heys_tdee_v1.js');
    });

    it('resolveDailyTargets существует и это функция', () => {
        expect(typeof global.HEYS.TDEE?.resolveDailyTargets).toBe('function');
    });

    it('HEYS.Day.calculateOptimum не воскрес в исходнике', () => {
        // Комментарии описывают прошлый дефект — считаем только живой код.
        const code = read('apps/web/insights/pi_analytics_api.js').replace(/^\s*\/\/.*$/gm, '');
        expect(
            code.includes('calculateOptimum'),
            'calculateOptimum не существует нигде — вызов молча давал 2000 всем клиентам',
        ).toBe(false);
    });

    it('каждый вызов resolveDailyTargets в инсайтах попадает в живой модуль', () => {
        const src = read('apps/web/insights/pi_analytics_api.js');
        const calls = [...src.matchAll(/HEYS\.TDEE\?\.resolveDailyTargets\?\.\(/g)];
        // Счёт намеренно точный: число меняется — человек смотрит, не завёлся ли
        // рядом новый baseline 2000. Четвёртый и пятый вызовы — байесовская
        // проверка прогноза и ранние сигналы: там норма была захардкожена 2000.
        expect(calls.length, 'в файле должны остаться вызовы нормы').toBe(5);
        expect(typeof global.HEYS.TDEE.resolveDailyTargets).toBe('function');
    });

    it('норма реально зависит от дня, а не постоянна', () => {
        const profile = { weight: 80, height: 180, age: 30, gender: 'м', deficitPctTarget: 0 };
        const restDay = { weightMorning: 80, steps: 0 };
        const activeDay = { weightMorning: 80, steps: 15000 };

        const rest = global.HEYS.TDEE.resolveDailyTargets(profile, restDay).kcal;
        const active = global.HEYS.TDEE.resolveDailyTargets(profile, activeDay).kcal;

        expect(rest).toBeGreaterThan(0);
        expect(active, 'день с 15000 шагов обязан дать норму выше дня покоя').toBeGreaterThan(rest);
        expect(rest, 'норма не должна совпадать с прежней заглушкой 2000').not.toBe(2000);
    });
});

describe('сон: ночь плюс досып, без двойного счёта', () => {
    beforeAll(() => {
        global.window = global;
        global.HEYS = {};
        evalModule('apps/web/heys_day_utils.js');
    });

    it('три помощника действительно экспортируются', () => {
        const U = global.HEYS.dayUtils;
        expect(typeof U.getTotalSleepHours, 'getTotalSleepHours').toBe('function');
        expect(typeof U.getNightSleepHours, 'getNightSleepHours').toBe('function');
        expect(typeof U.normalizeDaySleepMinutes, 'normalizeDaySleepMinutes').toBe('function');
    });

    it('7 ч ночи + 90 мин досыпа = 8.5 ч', () => {
        const total = global.HEYS.dayUtils.getTotalSleepHours({
            sleepStart: '23:00', sleepEnd: '06:00', daySleepMinutes: 90,
        });
        expect(total).toBe(8.5);
    });

    it('уже просуммированное поле sleepHours не удваивает досып', () => {
        // Запись чек-ина: sleepHours уже содержит ночь+досып (heys_steps_v1.js:1682).
        const total = global.HEYS.dayUtils.getTotalSleepHours({
            sleepStart: '23:00', sleepEnd: '06:00', daySleepMinutes: 90, sleepHours: 8.5,
        });
        expect(total, 'сложение с sleepHours дало бы 10 ч').toBe(8.5);
    });

    it('без времён сна досып не складывается с суммарным полем', () => {
        const total = global.HEYS.dayUtils.getTotalSleepHours({
            daySleepMinutes: 90, sleepHours: 8.5,
        });
        expect(total).toBe(8.5);
    });

    it('ночь отделяется от досыпа обратной операцией', () => {
        const night = global.HEYS.dayUtils.getNightSleepHours({
            sleepStart: '23:00', sleepEnd: '06:00', daySleepMinutes: 90,
        });
        expect(night).toBe(7);
    });

    it('фолбэки в паттернах больше не прибавляют досып поверх суммы', () => {
        for (const rel of ['apps/web/insights/patterns/sleep.js', 'apps/web/insights/patterns/lifestyle.js']) {
            const src = read(rel);
            expect(
                /return\s+base\s*\+\s*napHours/.test(src),
                `${rel}: base + napHours — это и есть двойной счёт`,
            ).toBe(false);
        }
    });
});

describe('пороги: рекомендатель зовёт то имя, которое экспортирует модуль', () => {
    beforeAll(() => {
        global.window = global;
        global.HEYS = {};
        global.localStorage = {
            getItem: () => null, setItem: () => { }, removeItem: () => { }, key: () => null, length: 0,
        };
        evalModule('apps/web/insights/pi_thresholds.js');
    });

    it('живой экспорт называется get', () => {
        expect(typeof global.HEYS.InsightsPI?.thresholds?.get).toBe('function');
    });

    it('getAdaptiveThresholds наружу не экспортируется', () => {
        expect(global.HEYS.InsightsPI.thresholds.getAdaptiveThresholds).toBeUndefined();
    });

    it('имя, которое зовёт рекомендатель, существует в модуле порогов', () => {
        const src = read('apps/web/insights/pi_meal_recommender.js');
        const called = [...src.matchAll(/HEYS\.InsightsPI\??\.?thresholds\??\.(\w+)/g)].map((m) => m[1]);
        expect(called.length, 'вызовы порогов должны быть в файле').toBeGreaterThan(0);
        for (const name of new Set(called)) {
            expect(
                typeof global.HEYS.InsightsPI.thresholds[name],
                `thresholds.${name} не существует — адаптивные пороги молча не грузились`,
            ).toBe('function');
        }
    });

    it('тест рекомендателя мокает существующее имя, а не выдуманное', () => {
        const src = read('apps/web/__tests__/pi_meal_recommender.test.js');
        expect(
            src.includes('getAdaptiveThresholds'),
            'мок несуществующего имени скрывает дефект — он и скрывал',
        ).toBe(false);
    });
});

describe('разрешение противоречивых советов подключено', () => {
    it('pi_conflict_resolver входит в бандл инсайтов', () => {
        const config = read('scripts/legacy-bundle-config.mjs');
        expect(
            config.includes('insights/pi_conflict_resolver.js'),
            'файл не входил ни в один бандл — conflictResolver не существовал в рантайме',
        ).toBe(true);
    });

    it('модуль регистрирует то имя, которое зовёт pi_advanced', () => {
        global.window = global;
        global.HEYS = {};
        evalModule('apps/web/insights/pi_conflict_resolver.js');
        expect(typeof global.HEYS.InsightsPI?.conflictResolver?.resolveConflicts).toBe('function');

        const src = read('apps/web/insights/pi_advanced.js');
        expect(src.includes('conflictResolver?.resolveConflicts')).toBe(true);
    });
});

describe('оставшиеся фантомы вкладки не воскресли', () => {
    const PHANTOMS = [
        ['apps/web/insights/pi_ui_dashboard.js', 'products?.getIndex'],
        ['apps/web/heys_app_shell_v1.js', 'products?.getIndex'],
        ['apps/web/insights/pi_ui_dashboard.js', 'Day.computeDayTot'],
        ['apps/web/insights/pi_ui_dashboard.js', 'Day.calcNormAbs'],
        ['apps/web/insights/pi_ui_dashboard.js', 'getLatestWaveData?.('],
    ];

    it.each(PHANTOMS)('%s больше не зовёт %s', (rel, needle) => {
        const src = read(rel);
        // Комментарии описывают прошлый дефект — считаем только живой код.
        const code = src.replace(/^\s*\/\/.*$/gm, '');
        expect(code.includes(needle)).toBe(false);
    });

    it('buildIndex существует в ядре продуктов', () => {
        const core = read('apps/web/heys_core_v12.js');
        expect(core.includes('buildIndex:')).toBe(true);
    });

    it('инсулиновая волна зовётся через настоящий calculate', () => {
        const src = read('apps/web/insights/pi_ui_dashboard.js');
        expect(src.includes('IW.calculate({')).toBe(true);
    });
});

describe('lazy-чанки не грузятся вместе с eager', () => {
    it('POST_BOOT_BUNDLES в index.html не содержит -lazy', () => {
        const html = read('apps/web/index.html');
        const block = html.match(/var\s+POST_BOOT_BUNDLES\s*=\s*\[([\s\S]*?)\];/);
        expect(block, 'блок POST_BOOT_BUNDLES должен существовать').toBeTruthy();
        expect(
            block[1].includes('-lazy'),
            'lazy-чанк в этом списке грузится безусловно после appReady, минуя фасад',
        ).toBe(false);
    });

    it('генератор index.html отсекает -lazy по суффиксу', () => {
        const src = read('scripts/bundle-legacy.mjs');
        expect(src.includes("!name.endsWith('-lazy')")).toBe(true);
    });

    it('верификатор согласован с генератором', () => {
        const src = read('scripts/verify-legacy-bundles.mjs');
        expect(
            src.includes("!n.endsWith('-lazy')"),
            'иначе pre-push гейт упадёт на собственном же index.html',
        ).toBe(true);
    });

    it('все три lazy-чанка остаются в lazy-manifest для фасадов', () => {
        const manifest = JSON.parse(read('apps/web/public/lazy-manifest.json'));
        expect(Object.keys(manifest).sort()).toEqual([
            'postboot-1-game-lazy', 'postboot-2-insights-lazy', 'postboot-3-ui-lazy',
        ]);
    });
});
