// settings-v4-notify-detail.test.js — лист «Настроить подробно» в настройках.
//
// Контракт settings-system.v4.dc.html, строки «вид листа „Настроить
// подробно“», «состав листа», «тихие часы», «вход в лист», «вид листа».
//
// Руками этот лист не собрать: он живёт над шторкой настроек, открывается
// только при включённом общем тумблере, а его шесть тумблеров и диапазон
// тишины проверяются рассылкой на сервере. Поэтому смоук не читает исходник
// глазами, а исполняет реальные куски heys_app_shell_v1.js: генератор
// получаса, список видов и само выражение разметки листа. Расхождение с
// кодом ломает извлечение — это осознанно fail-closed.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const SHELL_SRC = read(path.join(WEB_DIR, 'heys_app_shell_v1.js'));
const BASE_CSS = read(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'));
const CRON_SRC = read(
    path.resolve(WEB_DIR, '../../yandex-cloud-functions/heys-cron-reminders/index.js'),
);

function ruleBlock(css, selectorLine) {
    const idx = css.indexOf(selectorLine);
    expect(idx, `selector "${selectorLine}" not found`).toBeGreaterThanOrEqual(0);
    return css.slice(idx, css.indexOf('}', idx));
}

function slice(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    expect(start, `маркер "${startMarker}" не найден`).toBeGreaterThanOrEqual(0);
    const end = src.indexOf(endMarker, start);
    expect(end, `маркер "${endMarker}" не найден`).toBeGreaterThan(start);
    return src.slice(start, end);
}

// ── Реальные куски продукта, исполняемые смоуком ─────────────────────────
const KIND_ROWS_SRC = slice(SHELL_SRC, 'const NOTIFY_KIND_ROWS = [', '];') + '];';
const NOTIFY_KIND_ROWS = new Function(`${KIND_ROWS_SRC}\nreturn NOTIFY_KIND_ROWS;`)();

const QUIET_DEFAULT_SRC = slice(
    SHELL_SRC,
    'const QUIET_HOURS_DEFAULT = ',
    '\n',
);
const QUIET_HOURS_DEFAULT = new Function(`${QUIET_DEFAULT_SRC}\nreturn QUIET_HOURS_DEFAULT;`)();

const QUIET_OPTIONS_SRC = slice(
    SHELL_SRC,
    'const QUIET_TIME_OPTIONS = React.useMemo(',
    '}, []);',
) + '}, []);';
const QUIET_TIME_OPTIONS = new Function(
    'React',
    `${QUIET_OPTIONS_SRC}\nreturn QUIET_TIME_OPTIONS;`,
)({ useMemo: (fn) => fn() });

const CAPSULE_SRC = slice(
    SHELL_SRC,
    'const renderQuietCapsule = (prefKey, value, label) =>',
    'const renderPaletteDots =',
).trimEnd();

const SHEET_SRC = slice(
    SHELL_SRC,
    'settingsMenuOpen && notifyDetailOpen && React.createElement(',
    '// CRS Progress Bar',
).trimEnd().replace(/,$/, '');

function renderSheet(overrides = {}) {
    const calls = [];
    const ctx = {
        settingsMenuOpen: true,
        notifyDetailOpen: true,
        NOTIFY_KIND_ROWS,
        QUIET_TIME_OPTIONS,
        notifyPrefs: { ...QUIET_HOURS_DEFAULT },
        setNotifyDetailOpen: (v) => calls.push(['close', v]),
        updateNotifyPrefs: (patch) => calls.push(['prefs', patch]),
        ...overrides,
    };
    ctx.notifyQuietStart = ctx.notifyPrefs.quiet_start || QUIET_HOURS_DEFAULT.quiet_start;
    ctx.notifyQuietEnd = ctx.notifyPrefs.quiet_end || QUIET_HOURS_DEFAULT.quiet_end;

    const build = new Function('React', 'window', 'ctx', `
        const {
            settingsMenuOpen, notifyDetailOpen, NOTIFY_KIND_ROWS, QUIET_TIME_OPTIONS,
            notifyPrefs, notifyQuietStart, notifyQuietEnd,
            setNotifyDetailOpen, updateNotifyPrefs,
        } = ctx;
        ${CAPSULE_SRC}
        return (${SHEET_SRC});
    `);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    act(() => { root.render(build(React, window, ctx)); });
    return { host, calls, root };
}

describe('состав листа — шесть видов в порядке контракта', () => {
    it('шесть строк, подписи и порядок как в контракте', () => {
        expect(NOTIFY_KIND_ROWS.map((r) => r.label)).toEqual([
            'Сообщения от куратора',
            'Утренний чек-ин',
            'Вода в пищевом окне',
            'Итог дня',
            'Серия — седьмой день',
            'Правки куратора',
        ]);
    });

    // Ключи листа обязаны совпадать с теми, по которым рассылку гейтит
    // heys-cron-reminders: переименование в UI молча выключило бы тумблер.
    it('пять ключей из шести читает cron напоминаний', () => {
        const served = NOTIFY_KIND_ROWS
            .map((r) => r.key)
            .filter((key) => CRON_SRC.includes(`prefs.${key}`));
        expect(served).toEqual([
            'morning_checkin_enabled',
            'water_hint_enabled',
            'evening_summary_enabled',
            'streak_celebration_enabled',
            'curator_actions_enabled',
        ]);
    });

    // Шестой вид — сообщения куратора. Их шлёт не рассылка напоминаний, а
    // heys-api-messages, поэтому и гейт живёт там. Раньше здесь стояла
    // проверка «ключ есть, гейта ещё нет» — она держала дыру видимой; теперь
    // гейт стоит, и проверка сторожит его наличие.
    it('тумблер сообщений куратора действительно гейтит отправку', () => {
        expect(NOTIFY_KIND_ROWS[0].key).toBe('curator_messages_enabled');
        // Рассылка напоминаний про этот ключ по-прежнему не знает — и не должна.
        expect(CRON_SRC).not.toContain('curator_messages_enabled');
        const messagesSrc = read(
            path.resolve(WEB_DIR, '../../yandex-cloud-functions/heys-api-messages/index.js'),
        );
        expect(messagesSrc).toContain('curator_messages_enabled === false');
        expect(messagesSrc).toContain('curator_messages_disabled');
    });

    it('общий тумблер остаётся в шторке настроек, в лист не переезжает', () => {
        expect(SHELL_SRC).toContain("className: 'hdr-settings-sheet__push'");
        expect(SHEET_SRC).not.toContain('hdr-settings-sheet__push');
    });
});

describe('тихие часы — диапазон, шаг и оговорка про куратора', () => {
    it('по умолчанию 22:00–08:00', () => {
        expect(QUIET_HOURS_DEFAULT).toEqual({ quiet_start: '22:00', quiet_end: '08:00' });
    });

    it('шаг капсул 30 минут — 48 значений от 00:00 до 23:30', () => {
        expect(QUIET_TIME_OPTIONS).toHaveLength(48);
        expect(QUIET_TIME_OPTIONS[0]).toBe('00:00');
        expect(QUIET_TIME_OPTIONS[1]).toBe('00:30');
        expect(QUIET_TIME_OPTIONS[47]).toBe('23:30');
        expect(QUIET_TIME_OPTIONS.every((t) => /^([01]\d|2[0-3]):(00|30)$/.test(t))).toBe(true);
    });

    it('капсулы показывают значения человека, а выбор идёт тем же списком', () => {
        const { host } = renderSheet({
            notifyPrefs: { quiet_start: '23:30', quiet_end: '07:00' },
        });
        const values = [...host.querySelectorAll('.notify-detail__capsule-value')]
            .map((n) => n.textContent);
        expect(values).toEqual(['23:30', '07:00']);
        const selects = host.querySelectorAll('.notify-detail__capsule-select');
        expect(selects).toHaveLength(2);
        expect(selects[0].querySelectorAll('option')).toHaveLength(48);
        expect(selects[0].getAttribute('aria-label')).toBe('Тихие часы с');
        expect(selects[1].getAttribute('aria-label')).toBe('Тихие часы до');
    });

    it('смена капсулы пишет в prefs именно тот ключ, что читает отправка', () => {
        const { host, calls } = renderSheet();
        const select = host.querySelector('.notify-detail__capsule-select');
        act(() => {
            select.value = '21:30';
            select.dispatchEvent(new window.Event('change', { bubbles: true }));
        });
        expect(calls).toContainEqual(['prefs', { quiet_start: '21:30' }]);
    });

    it('оговорка про сообщения куратора стоит строкой под капсулами', () => {
        const { host } = renderSheet();
        const note = host.querySelector('.notify-detail__quiet-note');
        expect(note.textContent).toContain('Сообщения от куратора тихие часы не глушат');
    });

    // Контракт: «не приходят вовсе, а не копятся» — на сервере это continue,
    // а не отложенная очередь.
    it('в тихие часы рассылка пропускается, а не откладывается', () => {
        expect(CRON_SRC).toMatch(/isInQuietHours\([^)]*\)\)\s*(continue|\{)/);
        expect(CRON_SRC).not.toMatch(/quiet[_a-z]*queue/i);
    });
});

describe('лист «Настроить подробно» — поведение тумблеров', () => {
    it('шесть переключателей, по умолчанию все включены', () => {
        const { host } = renderSheet();
        const rows = host.querySelectorAll('.notify-detail__row');
        expect(rows).toHaveLength(6);
        [...rows].forEach((row) => {
            expect(row.getAttribute('role')).toBe('switch');
            expect(row.getAttribute('aria-checked')).toBe('true');
        });
    });

    it('сохранённое false гасит свой вид и не трогает соседей', () => {
        const { host } = renderSheet({
            notifyPrefs: { ...QUIET_HOURS_DEFAULT, water_hint_enabled: false },
        });
        const rows = [...host.querySelectorAll('.notify-detail__row')];
        expect(rows.map((r) => r.getAttribute('aria-checked')))
            .toEqual(['true', 'true', 'false', 'true', 'true', 'true']);
        expect(rows[2].getAttribute('aria-label')).toBe('Вода в пищевом окне, выключено');
    });

    it('тап по строке переключает именно её ключ', () => {
        const { host, calls } = renderSheet();
        const rows = [...host.querySelectorAll('.notify-detail__row')];
        act(() => { rows[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
        expect(calls).toContainEqual(['prefs', { evening_summary_enabled: false }]);
    });

    it('повторный тап возвращает прежнее состояние', () => {
        const { host, calls } = renderSheet({
            notifyPrefs: { ...QUIET_HOURS_DEFAULT, evening_summary_enabled: false },
        });
        const rows = [...host.querySelectorAll('.notify-detail__row')];
        act(() => { rows[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
        expect(calls).toContainEqual(['prefs', { evening_summary_enabled: true }]);
    });

    it('крестик закрывает лист, шторка настроек остаётся', () => {
        const { host, calls } = renderSheet();
        const close = host.querySelector('.notify-detail__close');
        expect(close.getAttribute('aria-label')).toBe('Закрыть');
        act(() => { close.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
        expect(calls).toContainEqual(['close', false]);
    });

    it('лист не рисуется без шторки и без своего состояния', () => {
        expect(renderSheet({ settingsMenuOpen: false }).host.querySelector('.notify-detail'))
            .toBeNull();
        expect(renderSheet({ notifyDetailOpen: false }).host.querySelector('.notify-detail'))
            .toBeNull();
    });
});

describe('запись настроек — только выбранное человеком', () => {
    const UPDATE_SRC = slice(SHELL_SRC, 'const updateNotifyPrefs = (patch) => {', '\n        };')
        + '\n        };';

    function runUpdate({ stored = null, sheetPushOn = true } = {}) {
        const box = { ls: stored, shown: null, saved: [] };
        const U = {
            lsGet: (_k, fallback) => (box.ls === null ? fallback : box.ls),
            lsSet: (_k, value) => { box.ls = value; },
        };
        const win = {
            HEYS: {
                push: {
                    savePrefs: (patch) => { box.saved.push(patch); return Promise.resolve(); },
                },
            },
        };
        const updateNotifyPrefs = new Function(
            'U', 'window', 'sheetPushOn', 'setNotifyPrefs', 'QUIET_HOURS_DEFAULT',
            `${UPDATE_SRC}\nreturn updateNotifyPrefs;`,
        )(U, win, sheetPushOn, (next) => { box.shown = next; }, QUIET_HOURS_DEFAULT);
        return { updateNotifyPrefs, box };
    }

    it('тумблер вида кладёт в хранилище только свой ключ — тихие часы не подмешиваются', () => {
        const { updateNotifyPrefs, box } = runUpdate();
        updateNotifyPrefs({ water_hint_enabled: false });
        expect(box.ls).toEqual({ water_hint_enabled: false });
        expect(box.saved).toEqual([{ water_hint_enabled: false }]);
    });

    it('показываем дефолт тихих часов, но не выдаём его за выбор человека', () => {
        const { updateNotifyPrefs, box } = runUpdate();
        updateNotifyPrefs({ evening_summary_enabled: false });
        expect(box.shown.quiet_start).toBe('22:00');
        expect(box.shown.quiet_end).toBe('08:00');
        expect(Object.keys(box.ls)).toEqual(['evening_summary_enabled']);
    });

    it('прежние настройки не стираются — правка ложится поверх', () => {
        const { updateNotifyPrefs, box } = runUpdate({
            stored: { meal_reminder_gap_hours: 5, quiet_start: '23:00' },
        });
        updateNotifyPrefs({ quiet_end: '07:00' });
        expect(box.ls).toEqual({
            meal_reminder_gap_hours: 5,
            quiet_start: '23:00',
            quiet_end: '07:00',
        });
    });

    it('без подписки на сервер не ходим — правка остаётся локальной', () => {
        const { updateNotifyPrefs, box } = runUpdate({ sheetPushOn: false });
        updateNotifyPrefs({ curator_actions_enabled: false });
        expect(box.saved).toEqual([]);
        expect(box.ls).toEqual({ curator_actions_enabled: false });
    });
});

describe('вход в лист — строка под общим тумблером', () => {
    const rowSrc = slice(SHELL_SRC, "key: 'notify-detail'", '}),');

    it('строка называется «Настроить подробно» и стоит в ярусе «Приложение»', () => {
        expect(rowSrc).toContain("label: 'Настроить подробно'");
        const groupIdx = SHELL_SRC.indexOf("renderSettingsGroup('app', 'Приложение'");
        const rowIdx = SHELL_SRC.indexOf("key: 'notify-detail'");
        expect(rowIdx).toBeGreaterThan(groupIdx);
        expect(rowIdx - groupIdx).toBeLessThan(600);
    });

    it('при выключенном общем тумблере строка не нажимается', () => {
        expect(rowSrc).toContain('disabled: !sheetPushOn');
        expect(SHELL_SRC).toContain('if (disabled) return;');
        expect(SHELL_SRC).toContain("disabled: !!disabled");
    });

    it('погашена ровно до 40 % — контракт «вход в лист»', () => {
        expect(ruleBlock(BASE_CSS, '.hdr-settings-sheet__row.is-disabled {'))
            .toContain('opacity: 0.4;');
    });
});

describe('два слоя — лист над шторкой, закрываются по очереди', () => {
    // Лист рисуется вне обёртки настроек, а на документе висит capture-listener
    // «тап мимо → закрыть шторку». Без развилки первый же тап по тумблеру
    // закрывал бы обе поверхности.
    it('тап по листу не считается тапом мимо настроек', () => {
        const outside = slice(SHELL_SRC, 'const handleOutsidePointer = (event) => {', 'const handleEscape');
        expect(outside).toContain("target.closest('.notify-detail-backdrop')");
        const exemptIdx = outside.indexOf("target.closest('.notify-detail-backdrop')");
        const backdropIdx = outside.indexOf("target.closest('.tab-settings-backdrop')");
        expect(exemptIdx).toBeGreaterThan(0);
        expect(exemptIdx).toBeLessThan(backdropIdx);
    });

    it('Escape закрывает сначала лист, потом шторку', () => {
        const escape = slice(SHELL_SRC, "if (event.key !== 'Escape') return;", '\n            };');
        expect(escape.indexOf('setNotifyDetailOpen(false)'))
            .toBeLessThan(escape.indexOf('setSettingsMenuOpen(false)'));
    });

    it('кнопка назад закрывает лист своей меткой истории', () => {
        expect(SHELL_SRC).toContain("window.history.pushState({ heysNotifyDetailSheet: true }, '')");
        expect(SHELL_SRC).toContain('if (window.history.state?.heysNotifyDetailSheet) window.history.back();');
    });

    it('лист закрывается вместе со шторкой и при выключении общего тумблера', () => {
        const effect = slice(SHELL_SRC, 'if (!notifyDetailOpen) return undefined;', '}, [notifyDetailOpen, settingsMenuOpen');
        expect(effect).toContain('if (!settingsMenuOpen || !sheetPushOn) {');
        expect(effect).toContain('setNotifyDetailOpen(false);');
    });
});

describe('вид листа «Настроить подробно» — геометрия контракта', () => {
    it('нижний лист: радиус 26, поля 12 px по краям экрана, внутренние 12/16/18', () => {
        const backdrop = ruleBlock(BASE_CSS, '.notify-detail-backdrop {');
        expect(backdrop).toContain('align-items: flex-end;');
        expect(backdrop).toContain('padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));');
        const sheet = ruleBlock(BASE_CSS, '.notify-detail {');
        expect(sheet).toContain('border-radius: 26px;');
        expect(sheet).toContain('padding: 12px 16px 18px;');
    });

    it('ручка 38×4', () => {
        const handle = ruleBlock(BASE_CSS, '.notify-detail__handle {');
        expect(handle).toContain('width: 38px;');
        expect(handle).toContain('height: 4px;');
    });

    it('ярусы карточками радиусом 18, строки по 44, разделитель линией набора', () => {
        expect(ruleBlock(BASE_CSS, '.notify-detail__card {')).toContain('border-radius: 18px;');
        const row = ruleBlock(BASE_CSS, '.notify-detail__row {');
        expect(row).toContain('min-height: 44px;');
        expect(row).toContain('border-top: 1px solid var(--v4-line');
    });

    it('тумблеры вида 42×25 с кнопкой 19 и отступом 3', () => {
        const sw = ruleBlock(BASE_CSS, '.notify-detail__switch {');
        expect(sw).toContain('width: 42px;');
        expect(sw).toContain('height: 25px;');
        expect(sw).toContain('padding: 3px;');
        expect(ruleBlock(BASE_CSS, '.notify-detail__knob {')).toContain('width: 19px;');
    });

    it('капсулы 38 px радиусом 14, число 15/700 акцентным тоном', () => {
        const capsule = ruleBlock(BASE_CSS, '.notify-detail__capsule {');
        expect(capsule).toContain('min-height: 38px;');
        expect(capsule).toContain('border-radius: 14px;');
        const value = ruleBlock(BASE_CSS, '.notify-detail__capsule-value {');
        expect(value).toContain('font: 700 15px/1');
        expect(value).toContain('var(--v4-act-text');
    });

    // Отступление названо: контракт просит --scrim БЕЗ блюра, инвариант
    // продуктового scrim (CLAUDE.md) держит дим + blur 2,5 px на всех
    // модалках продукта. Ради одного листа инвариант не расщепляем.
    it('затемнение — общий продуктовый scrim, а не свой', () => {
        const backdrop = ruleBlock(BASE_CSS, '.notify-detail-backdrop {');
        expect(backdrop).toContain('var(--v4-modal-backdrop-dim');
        expect(backdrop).toContain('blur(var(--v4-modal-backdrop-blur, 2.5px))');
    });
});

describe('вид листа — шторка настроек выпадающей панелью, не нижним листом', () => {
    it('панель зафиксирована у шапки, без ручки и без своего фона', () => {
        const menu = ruleBlock(BASE_CSS, '.tab-settings-menu.tab-settings-menu--v4-sheet {');
        expect(menu).toContain('position: fixed;');
        expect(menu).toContain('background: transparent;');
        // Ручки нет — псевдоэлемент погашен явно
        const handle = ruleBlock(BASE_CSS, '.tab-settings-menu.tab-settings-menu--v4-sheet::before {');
        expect(handle).toContain('content: none;');
    });

    it('закрывается тем же тапом по иконке и крестиком, жеста закрытия нет', () => {
        expect(SHELL_SRC).toContain('const toggleSettingsMenu = () => {');
        expect(SHELL_SRC).toContain("'aria-label': 'Закрыть настройки'");
        const menuIdx = SHELL_SRC.indexOf("className: 'tab-settings-menu tab-settings-menu--v4-sheet'");
        const chunk = SHELL_SRC.slice(menuIdx, menuIdx + 4000);
        expect(chunk).not.toMatch(/onTouchMove|onPanEnd|swipeToClose/);
    });
});
