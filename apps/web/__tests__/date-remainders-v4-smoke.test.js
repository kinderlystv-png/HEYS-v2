// Смоук зоны date-remainders: стыки капсулы даты и шторки календаря, которые
// руками не собрать — ночное окно 00:00–03:00 и переход в 03:00 без перезагрузки,
// чужой день, выходной, клетка одновременно выбранная и сегодняшняя.
// Проверяется рендером, а не чтением исходника: какие классы реально приезжают
// в DOM в каждом стыке. Тон и геометрия этих классов проверены отдельно —
// date-picker-v4-capsule.test.js и date-picker-sheet-v4-structure.test.js.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.HEYS = window.HEYS || {};
  loadScript('heys_day_utils.js');
  loadScript('heys_day_pickers.js');
});

let roots = [];

function renderPicker(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (next) => act(() => {
    root.render(React.createElement(window.HEYS.DatePicker, {
      onSelect: () => {},
      ...next,
    }));
  });
  render(props);
  roots.push({ root, host });
  return { host, render };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const { root, host } of roots) {
    act(() => root.unmount());
    host.remove();
  }
  roots = [];
  vi.useRealTimers();
});

function capsule(host) {
  const root = host.querySelector('.date-picker--v4');
  const trigger = host.querySelector('.date-picker-trigger');
  return {
    rootClass: root ? root.className : '',
    triggerClass: trigger ? trigger.className : '',
    label: (host.querySelector('.date-picker-main') || {}).textContent || '',
    hasInlineToday: !!host.querySelector('.date-picker-inline-today'),
    navs: [...host.querySelectorAll('.date-picker-day-nav')],
  };
}

describe('date-remainders · ночь до 03:00', () => {
  // Контракт «ночь до 03:00»: открытым остаётся вчерашний день, капсула
  // называет его одной строкой, тон нейтральный (не терракота чужого дня),
  // кнопки «Сегодня» нет, правая стрелка живая.
  it('01:30 — ночная капсула: одна строка, нейтральный тон, без «Сегодня»', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 1, 30, 0));
    const { host } = renderPicker({ valueISO: '2026-08-20' });
    const view = capsule(host);

    expect(view.label).toBe('Ночь на 21 августа');
    expect(view.triggerClass).toContain('date-picker-trigger--night');
    expect(view.triggerClass).not.toContain('date-picker-trigger--not-today');
    // Модификатор чужого дня красит капсулу И кружки тинтом — ночью его нет.
    expect(view.rootClass).not.toContain('date-picker--past');
    expect(view.hasInlineToday).toBe(false);
    // Правая стрелка живая: календарное «сегодня» уже 21-е.
    expect(view.navs[1].className).not.toContain('date-picker-day-nav--disabled');
    expect(view.navs[1].getAttribute('aria-disabled')).toBe(null);
  });

  it('03:00 — капсула перестаёт быть ночной без перемонтирования', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 2, 59, 0));
    const { host } = renderPicker({ valueISO: '2026-08-20' });
    expect(capsule(host).triggerClass).toContain('date-picker-trigger--night');
    const nodeBefore = host.querySelector('.date-picker-trigger-lbl');

    // Порог 03:00 срабатывает по таймеру, а не по перерисовке хоста.
    act(() => {
      vi.setSystemTime(new Date(2026, 7, 21, 3, 0, 30));
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    const after = capsule(host);
    expect(after.triggerClass).not.toContain('date-picker-trigger--night');
    expect(after.label).toBe('Вчера, 20 августа');
    expect(host.querySelector('.date-picker-trigger-lbl')).toBe(nodeBefore);
  });

  it('после 03:00 тот же день зовётся «Сегодня, 21 августа»', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 3, 0, 30));
    const { host } = renderPicker({ valueISO: '2026-08-21' });
    const view = capsule(host);
    expect(view.label).toBe('Сегодня, 21 августа');
    expect(view.triggerClass).toContain('date-picker-trigger--today');
    expect(view.hasInlineToday).toBe(false);
  });
});

describe('date-remainders · ночная капсула · цвет sand и blue', () => {
  const CSS_FILES = [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
  ];
  const SURFACE = { sand: '#f7efe2', blue: '#eef3f9' };
  const TINT = { sand: '#f6e6dd', blue: '#fbe6e2' };

  beforeAll(() => {
    for (const rel of CSS_FILES) {
      const style = document.createElement('style');
      style.textContent = fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');
      document.head.appendChild(style);
    }
  });

  function applySet(id) {
    document.documentElement.setAttribute('data-theme-id', id);
    document.documentElement.setAttribute('data-theme', id);
  }

  function normColor(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return 'none';
    const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!rgb) return raw;
    const hex = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }

  it('01:30 — нейтральный --v4-surface на песочной и синей, не тинт чужого дня', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 1, 30, 0));
    for (const id of ['sand', 'blue']) {
      applySet(id);
      const { host } = renderPicker({ valueISO: '2026-08-20' });
      const trigger = host.querySelector('.date-picker-trigger');
      const nav = host.querySelector('.date-picker-day-nav');
      expect(trigger.className).toContain('date-picker-trigger--night');
      expect(host.querySelector('.date-picker--past')).toBeNull();
      expect(normColor(getComputedStyle(trigger).backgroundColor)).toBe(SURFACE[id]);
      expect(normColor(getComputedStyle(nav).backgroundColor)).toBe(SURFACE[id]);
      expect(normColor(getComputedStyle(trigger).backgroundColor)).not.toBe(TINT[id]);
    }
  });
});

describe('date-remainders · чужой день и выходной', () => {
  // Контракт «вид чужого дня»: заливка капсулы и ОБОИХ КРУЖКОВ — тинт, текст
  // остаётся чернилами, справа «Сегодня»; обе стрелки живые.
  it('чужой день: модификатор на корне, «Сегодня» внутри, обе стрелки живые', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-07' });
    const view = capsule(host);

    expect(view.label).toBe('пт, 7 августа');
    expect(view.triggerClass).toContain('date-picker-trigger--not-today');
    expect(view.rootClass).toContain('date-picker--past');
    expect(view.hasInlineToday).toBe(true);
    for (const nav of view.navs) {
      expect(nav.className).not.toContain('date-picker-day-nav--disabled');
    }
  });

  // Контракт «выходной»: красится ТОЛЬКО сокращение дня недели; число и месяц
  // в чернилах. Красный тон живёт на .date-picker-weekend-abbr, чернила — на
  // .date-picker-main--past, поэтому здесь сверяется, что подсвечена ровно
  // аббревиатура и ничего больше.
  it('выходной: красным помечена только аббревиатура дня', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-15' }); // суббота
    const main = host.querySelector('.date-picker-main--past');
    const abbr = host.querySelector('.date-picker-weekend-abbr');

    expect(abbr).not.toBeNull();
    expect(abbr.textContent).toBe('сб');
    expect(main.textContent).toBe('сб, 15 августа');
    // Число и месяц лежат текстом прямо в .date-picker-main, а не во втором
    // помеченном узле: иначе красным ушла бы вся строка.
    expect(host.querySelectorAll('.date-picker-weekend-abbr').length).toBe(1);
  });

  it('сегодняшний выходной остаётся словом «Сегодня» и без аббревиатуры', () => {
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0)); // суббота
    const { host } = renderPicker({ valueISO: '2026-08-15' });
    expect(capsule(host).label).toBe('Сегодня, 15 августа');
    expect(host.querySelector('.date-picker-weekend-abbr')).toBeNull();
  });
});

describe('date-remainders · шторка календаря', () => {
  function openSheet(host) {
    act(() => {
      host.querySelector('.date-picker-trigger-lbl').dispatchEvent(
        new window.MouseEvent('click', { bubbles: true }),
      );
    });
    return document.querySelector('.date-picker-sheet');
  }

  it('клетка бывает выбранной и сегодняшней одновременно', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-21' });
    const sheet = openSheet(host);
    expect(sheet).not.toBeNull();

    const both = sheet.querySelectorAll('.date-picker-day.selected.today');
    expect(both.length).toBe(1);
    expect(both[0].querySelector('.day-number').textContent).toBe('21');
    // Заливку даёт .selected (--c2), начертание и тон — .today: ни одно из
    // состояний не выключает другое.
    expect(sheet.querySelectorAll('.date-picker-day.selected').length).toBe(1);
    expect(sheet.querySelectorAll('.date-picker-day.today').length).toBe(1);
  });

  it('выбранный чужой день и сегодняшний — две разные клетки', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-07' });
    const sheet = openSheet(host);

    const selected = sheet.querySelector('.date-picker-day.selected');
    const today = sheet.querySelector('.date-picker-day.today');
    expect(selected.querySelector('.day-number').textContent).toBe('7');
    expect(today.querySelector('.day-number').textContent).toBe('21');
    expect(selected).not.toBe(today);
    expect(selected.className).not.toContain('today');
    expect(today.className).not.toContain('selected');
  });

  it('лист несёт ручку, а будущие дни погашены', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-21' });
    const sheet = openSheet(host);

    expect(sheet.querySelector('.date-picker-sheet-handle')).not.toBeNull();
    const future = sheet.querySelectorAll('.date-picker-day.future.disabled');
    expect(future.length).toBe(10); // 22–31 августа
    expect(future[0].getAttribute('aria-disabled')).toBe('true');
  });

  it('ночью 21-е ещё открыто и будущим не помечается', () => {
    // Стык: в 01:30 «эффективное сегодня» — 20-е, но календарное — 21-е.
    // Клетка 21-го обязана остаться доступной, иначе из ночи некуда шагнуть.
    vi.setSystemTime(new Date(2026, 7, 21, 1, 30, 0));
    const { host } = renderPicker({ valueISO: '2026-08-20' });
    const sheet = openSheet(host);

    const cells = [...sheet.querySelectorAll('.date-picker-day')];
    const cell21 = cells.find((el) => (el.querySelector('.day-number') || {}).textContent === '21');
    expect(cell21.className).not.toContain('disabled');
    expect(cell21.getAttribute('aria-disabled')).toBe(null);
  });
});

// Строка «откуда данные»: «точки в календаре — из локальной истории, а месяц
// догружается из облака при открытии шторки: пришедшие дни дорисовываются
// точками на месте».
//
// Почему смоуком. Стык виден только на человеке, у которого часть месяца лежит
// в облаке, а локально её нет, и который в этот момент открывает шторку. Руками
// это состояние не собрать: локальная история чистится вместе с сессией.
describe('date-remainders · откуда данные', () => {
  function openSheet(host) {
    act(() => {
      host.querySelector('.date-picker-trigger-lbl').dispatchEvent(
        new window.MouseEvent('click', { bubbles: true }),
      );
    });
    return document.querySelector('.date-picker-sheet');
  }

  function dots(sheet) {
    return sheet.querySelectorAll('.date-picker-day.has-data').length;
  }

  let fetched;
  let resolveFetch;
  let local;

  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    fetched = [];
    // Локально известен один день месяца; облако принесёт второй.
    local = new Map([['2026-08-05', { kcal: 1800, target: 2000, ratio: 0.9 }]]);
    window.HEYS.cloud = {
      fetchDays: (dates) => {
        fetched.push(dates);
        return new Promise((resolve) => {
          resolveFetch = () => {
            local.set('2026-08-12', { kcal: 2100, target: 2000, ratio: 1.05 });
            resolve();
          };
        });
      },
    };
  });

  afterEach(() => {
    delete window.HEYS.cloud;
  });

  it('при закрытой капсуле в облако не ходим — сетка не показана', () => {
    renderPicker({
      valueISO: '2026-08-21',
      getActiveDaysForMonth: () => new Map(local),
    });

    expect(fetched).toHaveLength(0);
  });

  it('открытие шторки догружает месяц целиком, точки дорисовываются на месте', async () => {
    const { host } = renderPicker({
      valueISO: '2026-08-21',
      getActiveDaysForMonth: () => new Map(local),
    });

    const sheet = openSheet(host);
    // Точка сразу одна — из локальной истории, без ожидания облака.
    expect(dots(sheet)).toBe(1);

    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toHaveLength(31);
    expect(fetched[0][0]).toBe('2026-08-01');
    expect(fetched[0][30]).toBe('2026-08-31');

    await act(async () => {
      resolveFetch();
      await Promise.resolve();
    });

    // Пришедший из облака день дорисован точкой, шторка не перерисована заново.
    expect(dots(document.querySelector('.date-picker-sheet'))).toBe(2);
  });

  it('перелистывание месяца в открытой шторке догружает новый месяц', () => {
    const { host } = renderPicker({
      valueISO: '2026-08-21',
      getActiveDaysForMonth: () => new Map(local),
    });
    const sheet = openSheet(host);
    expect(fetched).toHaveLength(1);

    act(() => {
      sheet.querySelectorAll('.date-picker-sheet-month-nav')[0].dispatchEvent(
        new window.MouseEvent('click', { bubbles: true }),
      );
    });

    expect(fetched).toHaveLength(2);
    expect(fetched[1][0]).toBe('2026-07-01');
  });
});

describe('date-remainders · правила продукта', () => {
  function openSheet(host) {
    act(() => {
      host.querySelector('.date-picker-trigger-lbl').dispatchEvent(
        new window.MouseEvent('click', { bubbles: true }),
      );
    });
    return document.querySelector('.date-picker-sheet');
  }

  function cellByDay(sheet, day) {
    return [...sheet.querySelectorAll('.date-picker-day')]
      .find((el) => (el.querySelector('.day-number') || {}).textContent === day);
  }

  // Контракт «safe-area и кнопка назад»: аппаратная кнопка/жест назад
  // закрывают шторку календаря, а не выходят с экрана.
  it('аппаратная кнопка назад закрывает шторку календаря', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const { host } = renderPicker({ valueISO: '2026-08-21' });
    const sheet = openSheet(host);
    expect(sheet).not.toBeNull();

    act(() => {
      window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
    });

    expect(document.querySelector('.date-picker-sheet')).toBeNull();
  });

  // Контракт «повторный тап и поворот»: у клетки календаря нет местного
  // исключения (в отличие от стрелок), поэтому действует общее окно 350 мс —
  // повторный тап на том же нажатии игнорируется, следующий осознанный проходит.
  it('клетка календаря: повторный тап в 350 мс не удваивает выбор, следующий тап проходит', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const onSelect = vi.fn();
    let sheet = openSheet(renderPicker({ valueISO: '2026-08-21', onSelect }).host);

    const cell15 = cellByDay(sheet, '15');
    act(() => {
      cell15.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      cell15.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-08-15');

    // Выбор закрыл шторку — открываем заново уже после окна защиты.
    act(() => { vi.advanceTimersByTime(400); });
    sheet = document.querySelector('.date-picker-sheet');
    expect(sheet).toBeNull();
    const { host } = roots[roots.length - 1];
    sheet = openSheet(host);
    const cell10 = cellByDay(sheet, '10');
    act(() => { cell10.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('2026-08-10');
  });

  // Местное отличие контракта: у стрелок даты защиты нет вовсе — быстрое
  // листание на неделю назад делают именно частыми тапами, каждый засчитан.
  it('стрелки даты: защиты нет — каждый быстрый тап засчитывается', () => {
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const onSelect = vi.fn();
    const { host } = renderPicker({ valueISO: '2026-08-21', onSelect });
    const prevBtn = host.querySelectorAll('.date-picker-day-nav')[0];

    act(() => {
      prevBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      prevBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      prevBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});

// Тон метки календаря контракт задаёт ЧЕТЫРЬМЯ разными процентами — по одному
// на набор («тон метки»: песочная 45 · синяя 50 · тёмная 42 · сине-тёмная 42),
// потому что подложка клетки в каждом наборе своя. Одного числа тут быть не
// может, поэтому проверка построчная: сама метка берёт процент из переменной,
// а переменная переопределена под каждый набор.
describe('date-remainders · CSS, палитро-зависимые строки', () => {
  const baseCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
    'utf8',
  );

  it('«тон метки» — свой процент в каждом из четырёх наборов', () => {
    expect(baseCss).toMatch(/\.date-picker-sheet \{\s*--dp-mark-alpha: 45%/);
    expect(baseCss).toMatch(/\[data-theme-id="blue"\] \.date-picker-sheet \{\s*--dp-mark-alpha: 50%/);
    expect(baseCss).toMatch(/\[data-theme-id="sand-dark"\] \.date-picker-sheet,/);
    expect(baseCss).toMatch(/\[data-theme-id="blue-dark"\] \.date-picker-sheet \{\s*--dp-mark-alpha: 42%/);

    const cycle = baseCss.match(/\.date-picker-sheet \.date-picker-day\.has-cycle::before \{[^}]+\}/)?.[0] || '';
    const refeed = baseCss.match(/\.date-picker-sheet \.date-picker-day\.has-refeed::after \{[^}]+\}/)?.[0] || '';
    expect(cycle).toContain('var(--dp-mark-alpha)');
    expect(refeed).toContain('var(--dp-mark-alpha)');
    // Контракт «тон метки»: 3 px у цикла — полоса по верхнему краю клетки.
    expect(cycle).toContain('height: 3px');
    expect(refeed).toContain('height: 3px');
    // Прежний песочный литерал чернил вместо роли — тёмные наборы получали
    // тёмную метку на тёмной клетке.
    expect(cycle).not.toContain('#201e1d');
    expect(refeed).not.toContain('#201e1d');
  });

  it('образцы легенды повторяют метку, а не свои прежние 2 px и 32 %', () => {
    const swatch = baseCss.match(/\.date-picker-sheet \.legend-swatch--cycle \{[^}]+\}/)?.[0] || '';
    expect(swatch).toContain('width: 3px');
    expect(swatch).toContain('var(--dp-mark-alpha)');
  });

  // nutrition-tab, «границы блока воды»: карточка целиком — радиус 18, поля
  // 12/14/13. Своей геометрии у .water-review не было, её давала .compact-card
  // (радиус 16, поля 14/16).
  it('«границы блока воды» — своя геометрия карточки', () => {
    const rule = baseCss.match(/\.water-review\.compact-card \{[^}]+\}/)?.[0] || '';
    expect(rule).toContain('border-radius: 18px');
    expect(rule).toContain('padding: 12px 14px 13px');
  });

  // nutrition-tab, «капсула даты»: стрелка вперёд с сегодняшнего дня гаснет
  // до 40 %. date-remainders владеет капсулой, но числа не называет.
  it('«капсула даты» — погашенная стрелка на 40 %', () => {
    expect(baseCss).toMatch(
      /\.date-picker--v4 \.date-picker-day-nav--disabled,[\s\S]{0,120}opacity: 0\.4;/,
    );
  });

  // Контракт «язык, выделение, часовой пояс» → home-widgets «выделение и
  // копирование · правило продукта»: капсула и шторка календаря — системные
  // подписи, не текст человека, поэтому не выделяются нигде по умолчанию.
  it('«выделение и копирование» — капсула и шторка календаря не выделяются', () => {
    const capsuleRule = baseCss.match(/\.date-picker \{[^}]+\}/)?.[0] || '';
    expect(capsuleRule).toContain('user-select: none');
    const sheetRule = baseCss.match(/\.date-picker-sheet \{[^}]+\}/)?.[0] || '';
    expect(sheetRule).toContain('user-select: none');
  });
});
