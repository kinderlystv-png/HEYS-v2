/**
 * Две строки контракта home-widgets.v4.dc.html двенадцатой сборки:
 * «формат чисел · правило продукта» и «непрочитанные у мессенджера».
 *
 * Почему смоуком, а не глазами. Разделитель разрядов — невидимый символ:
 * U+202F и U+00A0 на экране выглядят одинаково, и прежняя редакция строки
 * («узкий неразрывный», а пример набран обычным) держалась в коде месяцами
 * именно поэтому. Счётчик непрочитанных человек в проде не соберёт: нужен
 * второй участник, который напишет и не будет прочитан, — а проверить надо
 * ещё и обратное, что значка нет на самой кнопке ни при каком числе.
 */
import fs from 'node:fs';
import path from 'node:path';

import { act, fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

const NNBSP = '\u202F'; // узкий неразрывный — разряды тысяч
const NBSP = '\u00A0'; // обычный неразрывный — число и единица

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const ALL_ON = { water: true, hunger: true, message: true, activity: true, meal: true };

function loadWidgets({ visibility = ALL_ON, unread = 0, messengerApi = true } = {}) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };

  window.HEYS = {
    Widgets: {
      emit: () => {},
      on: () => () => {},
      registry: {
        getAvailableTypes: () => [],
        getType: () => null,
        getSize: () => null,
        normalizeSizeId: (id) => id,
        getCategories: () => [],
      },
      state: { isEditMode: () => false },
      data: { getWaterData: () => ({ hasData: true, drunk: 1700, target: 2700 }) },
      VariantsV4: {
        getCatalog: () => [],
        getDefaultVariant: () => null,
        getActiveVariant: () => null,
        getVariantById: () => null,
        useWidgetVariantTile: null,
      },
    },
    FabVisibility: { EVENT: 'heys:fab-visibility-changed', read: () => visibility },
    WaterCustomVolume: { PRESETS_ML: [200, 500] },
    utils: { lsGet: () => ({}) },
    dayUtils: {},
  };
  if (messengerApi) {
    window.HEYS.MessengerAPI = { getFabUnreadCount: () => unread };
  }

  // eslint-disable-next-line no-eval
  eval(uiSrc);
  return window.HEYS.Widgets;
}

function openCard(container) {
  fireEvent.click(container.querySelector('.widgets-quick-fab'));
}

afterEach(() => {
  globalThis.React = originalReact;
  globalThis.ReactDOM = originalReactDOM;
  window.HEYS = originalHEYS;
});

describe('формат чисел · правило продукта', () => {
  it('разряды тысяч — узкий неразрывный U+202F, а не обычный U+00A0', () => {
    const { formatRuNumber } = loadWidgets();
    expect(formatRuNumber(1931)).toBe(`1${NNBSP}931`);
    expect(formatRuNumber(1931)).not.toContain(NBSP);
    expect(formatRuNumber(1234567)).toBe(`1${NNBSP}234${NNBSP}567`);
    // Точки как разделителя разрядов и сокращений «1.9k» нет.
    expect(formatRuNumber(1931)).not.toContain('.');
    expect(formatRuNumber(1931)).not.toMatch(/k/i);
  });

  it('дробная часть — запятая, до тысячи разделителя нет', () => {
    const { formatRuNumber } = loadWidgets();
    expect(formatRuNumber(2.7, { maximumFractionDigits: 1 })).toBe('2,7');
    expect(formatRuNumber(999)).toBe('999');
  });

  it('оба символа записаны escape-ами: сырой невидимый пробел в код не уезжает', () => {
    expect(uiSrc).toContain("const NUM_GROUP_SEP = '\\u202F';");
    expect(uiSrc).toContain("const NUM_UNIT_SEP = '\\u00A0';");
    // Сырых U+202F в исходнике нет вовсе — только escape-последовательности.
    expect(uiSrc.includes(NNBSP)).toBe(false);
  });

  it('единицу от числа отделяет обычный неразрывный, а не узкий', () => {
    const { formatRuNumber, formatRuUnit } = loadWidgets();
    expect(formatRuUnit(formatRuNumber(1931), 'ккал')).toBe(`1${NNBSP}931${NBSP}ккал`);
    expect(formatRuUnit(formatRuNumber(2.7, { maximumFractionDigits: 1 }), 'л')).toBe(
      `2,7${NBSP}л`,
    );
    // Узкий у единицы не появляется: он только для разрядов.
    expect(formatRuUnit(72, 'кг')).not.toContain(NNBSP);
    expect(uiSrc).not.toMatch(/\u202F(?:ккал|л|г|мл|кг|мин|ч|дн)/);
  });

  it('склейка одна на файл — ручных швов в шаблонах не осталось', () => {
    // Раньше единица приклеивалась руками в трёх десятках шаблонов, и ответ
    // дизайнера про пробел стоил бы трёх десятков правок вместо одной.
    expect(uiSrc.match(/\u00A0(?:ккал|л|г|мл|кг|мин|ч|дн)/g)).toBeNull();
    expect((uiSrc.match(/formatRuUnit\(/g) || []).length).toBeGreaterThan(40);
  });

  it('готовое значение функция не переформатирует', () => {
    const { formatRuUnit } = loadWidgets();
    // Иначе смена шва молча меняла бы и сами числа: «2700 мл» → «2 700 мл».
    expect(formatRuUnit(2700, 'мл')).toBe(`2700${NBSP}мл`);
    expect(formatRuUnit('7/30', 'дн.')).toBe(`7/30${NBSP}дн.`);
  });

  it('единицы вплотную — один список, а не полсотни шаблонов', () => {
    const { formatRuUnit } = loadWidgets();
    // Процент сегодня стоит вплотную к числу: контракт про него молчит.
    expect(formatRuUnit(87, '%')).toBe('87%');
    // Граммы и часы вплотную — точечное отступление, названное в самом вызове.
    expect(formatRuUnit(120, 'г', { tight: true })).toBe('120г');
    expect(formatRuUnit(8, 'ч', { tight: true })).toBe('8ч');
    // Ответ дизайнера «процент отделять» меняет одну строку TIGHT_UNITS,
    // а не экран: тем же флагом решение переопределяется и точечно.
    expect(formatRuUnit(87, '%', { tight: false })).toBe(`87${NBSP}%`);
    expect(uiSrc).toContain("const TIGHT_UNITS = new Set(['%']);");
  });

  it('группировка идёт через один формат — своих toLocaleString у чисел не осталось', () => {
    // Дата выгрузки — не число, у неё свой формат; всё остальное через helper.
    const calls = uiSrc.match(/\.toLocaleString\('ru-RU'/g) || [];
    expect(calls).toHaveLength(2); // formatRuNumber + дата выгрузки
    expect(uiSrc).toContain("new Date().toLocaleString('ru-RU')");
  });

  it('табличные цифры стоят у того, что меняется на месте и стоит столбцом', () => {
    for (const sel of [
      '.widget-calories__value {', // ккал тикают на месте (tnum)
      '.widget-calories__label {',
      '.widget-calories__remaining {',
      '.widget-calories__pct {',
      '.widget-calories__activity-foot {',
      '.widget-calories__dinner-note {',
      '.widget-calories__line-meta {',
      '.widget-sleep__value {',
      '.widget-weight__number-week-val {',
      '.widget-weight__progress-pct {',
      '.widget-v4-row__meta {', // строки виджета стоят столбцом
      '.widgets-quick-sheet__meta {', // счётчик воды в карточке
    ]) {
      const i = cssSrc.indexOf(`\n${sel}`);
      expect(i, `правило ${sel} не найдено`).toBeGreaterThan(-1);
      const block = cssSrc.slice(i, cssSrc.indexOf('\n}', i));
      expect(
        /font-variant-numeric:\s*tabular-nums|font-feature-settings:\s*'tnum'/.test(block),
        `${sel} без табличных цифр`,
      ).toBe(true);
    }
  });
});

describe('непрочитанные у мессенджера', () => {
  it('счётчик стоит на строке «Мессенджер» внутри карточки', () => {
    const Widgets = loadWidgets({ unread: 3 });
    const { container } = render(
      RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }),
    );
    openCard(container);
    const rows = [...container.querySelectorAll('.widgets-quick-sheet__row')];
    const messengerRow = rows.find(
      (row) => row.querySelector('.widgets-quick-sheet__row-label')?.textContent === 'Мессенджер',
    );
    expect(messengerRow, 'строки «Мессенджер» нет').toBeTruthy();
    const badge = messengerRow.querySelector('.widgets-quick-sheet__badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('3');
    // И больше нигде: у остальных строк значка нет.
    expect(container.querySelectorAll('.widgets-quick-sheet__badge')).toHaveLength(1);
  });

  it('на плавающей кнопке значка нет ни при каком числе — включая 99+', () => {
    for (const unread of [0, 1, 7, 250]) {
      const Widgets = loadWidgets({ unread });
      const { container, unmount } = render(
        RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }),
      );
      const fab = container.querySelector('.widgets-quick-fab');
      expect(fab.querySelector('.widgets-quick-sheet__badge')).toBeNull();
      expect(fab.textContent.trim()).toBe('');
      unmount();
    }
  });

  it('кнопка остаётся действием и когда «Мессенджер» — единственный пункт', () => {
    const Widgets = loadWidgets({
      visibility: { water: false, hunger: false, message: true, activity: false, meal: false },
      unread: 5,
    });
    const { container } = render(
      RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 0, onOpenCurator: () => {} }),
    );
    const fab = container.querySelector('.widgets-quick-fab');
    expect(fab.getAttribute('aria-label')).toBe('Мессенджер');
    expect(container.querySelector('.widgets-quick-sheet__badge')).toBeNull();
  });

  it('нуля на строке не рисуем, и без MessengerAPI карточка живёт как прежде', () => {
    const zero = loadWidgets({ unread: 0 });
    const first = render(RealReact.createElement(zero.QuickActionsFab, { waterMl: 1700 }));
    openCard(first.container);
    expect(first.container.querySelector('.widgets-quick-sheet__badge')).toBeNull();
    first.unmount();

    const noApi = loadWidgets({ messengerApi: false });
    const second = render(RealReact.createElement(noApi.QuickActionsFab, { waterMl: 1700 }));
    openCard(second.container);
    expect(second.container.querySelectorAll('.widgets-quick-sheet__row')).toHaveLength(4);
    expect(second.container.querySelector('.widgets-quick-sheet__badge')).toBeNull();
  });

  it('счётчик обновляется по событию продукта, своего опроса карточка не заводит', () => {
    const Widgets = loadWidgets({ unread: 1 });
    const { container } = render(
      RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }),
    );
    openCard(container);
    expect(container.querySelector('.widgets-quick-sheet__badge').textContent).toBe('1');
    act(() => {
      window.dispatchEvent(new CustomEvent('heys:messenger-fab-unread', { detail: 12 }));
    });
    expect(container.querySelector('.widgets-quick-sheet__badge').textContent).toBe('12');
    // Источник один — кеш HEYS.MessengerAPI; своего fetch/setInterval здесь нет.
    expect(uiSrc).toContain("HEYS.MessengerAPI?.getFabUnreadCount?.()");
    expect(uiSrc).not.toContain('/messages/unread-count');
  });

  it('CSS: кружок 14 px тоном роли акцента, а не голым hex', () => {
    const i = cssSrc.indexOf('\n.widgets-quick-sheet__badge {');
    expect(i).toBeGreaterThan(-1);
    const block = cssSrc.slice(i, cssSrc.indexOf('\n}', i));
    expect(block).toContain('height: 14px');
    expect(block).toContain('min-width: 14px');
    expect(block).toContain('border-radius: 999px');
    expect(block).toContain('background: var(--v4-act');
    expect(block).toContain('font-variant-numeric: tabular-nums');
  });
});
