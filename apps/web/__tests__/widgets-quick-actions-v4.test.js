/**
 * Карточка быстрых действий на Главной (канвас home-widgets.v4, строки
 * «набор действий», «порядок в карточке», «две грамматики», «чипы воды»,
 * «настройка состава», «включён один пункт», «не включено ни одного»).
 *
 * Почему смоуком, а не глазами. Крайние случаи состава — ноль включённых
 * пунктов и ровно один — человек в проде не соберёт: надо зайти в настройки,
 * выключить четыре переключателя, вернуться на Главную и посмотреть, во что
 * превратилась кнопка. Пять состояний × две грамматики строк — это таблица,
 * а не осмотр.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const ALL_ON = { water: true, hunger: true, message: true, activity: true, meal: true };

function loadFab(visibility) {
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
    // Объёмы человека из настроек воды — строка «чипы воды».
    WaterCustomVolume: { PRESETS_ML: [200, 500] },
    utils: { lsGet: () => ({}) },
    dayUtils: {},
  };

  // eslint-disable-next-line no-eval
  eval(uiSrc);
  return window.HEYS.Widgets.QuickActionsFab;
}

function open(visibility = ALL_ON, props = {}) {
  const Fab = loadFab(visibility);
  const out = render(RealReact.createElement(Fab, { waterMl: 1700, ...props }));
  const button = out.container.querySelector('.widgets-quick-fab');
  if (button) fireEvent.click(button);
  return out;
}

/** Подписи навигационных строк сверху вниз, как они стоят в карточке. */
function rowLabels(container) {
  return [...container.querySelectorAll('.widgets-quick-sheet__row-label')].map((n) => n.textContent);
}

describe('быстрые действия: состав и порядок', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('пять пунктов: снизу вверх вода, еда, голод, активность, мессенджер', () => {
    const { container } = open();
    // Карточка растёт сверху вниз, поэтому навигационные идут в обратном
    // порядке, а вода стоит последней — ближе всего к кнопке.
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Активность', 'Голод и энергия', 'Еда']);
    expect(container.querySelector('.widgets-quick-sheet__title').textContent).toBe('Вода');
  });

  it('четыре навигационные строки несут шеврон, у воды его нет', () => {
    const { container } = open();
    expect(container.querySelectorAll('.widgets-quick-sheet__chevron').length).toBe(4);
    const head = container.querySelector('.widgets-quick-sheet__head');
    expect(head.querySelector('.widgets-quick-sheet__chevron')).toBeNull();
  });

  it('чипы воды — объёмы человека, чипа 250 нет', () => {
    const { container } = open();
    const chips = [...container.querySelectorAll('.widgets-quick-sheet__chip')].map((n) => n.textContent);
    expect(chips).toEqual(['200', '500']);
    expect(chips).not.toContain('250');
  });

  it('выключенный пункт исчезает, порядок остальных не меняется', () => {
    const { container } = open({ ...ALL_ON, hunger: false, activity: false });
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Еда']);
  });

  it('не включено ни одного — кнопки в углу нет вовсе', () => {
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: false, meal: false });
    const { container } = render(RealReact.createElement(Fab, { waterMl: 0 }));
    expect(container.querySelector('.widgets-quick-fab')).toBeNull();
  });

  it('включён один навигационный — кнопка становится этим действием', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: false, meal: true });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onAddMeal: () => calls.push('meal') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    expect(button.getAttribute('aria-label')).toBe('Еда');
    fireEvent.click(button);
    // Стопки нет: тап уводит на экран, карточка не раскрывается.
    expect(calls).toEqual(['meal']);
    expect(container.querySelector('.widgets-quick-sheet')).toBeNull();
  });

  it('повторный тап · правило продукта: второй тап по «Еда» внутри 350 мс не заводит вторую запись', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: false, meal: true });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onAddMeal: () => calls.push('meal') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toEqual(['meal']);
  });

  it('повторный тап · правило продукта: мессенджер — навигация, защиты нет', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: false, message: true, activity: false, meal: false });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onOpenCurator: () => calls.push('message') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    fireEvent.click(button);
    fireEvent.click(button);
    // Контракт («повторный тап · правило продукта»): у навигации защиты нет —
    // оба тапа засчитываются, второй просто открывает мессенджер повторно.
    expect(calls).toEqual(['message', 'message']);
  });

  it('включена одна вода — карточка с одними чипами, без списка', () => {
    const { container } = open({ water: true, hunger: false, message: false, activity: false, meal: false });
    expect(rowLabels(container)).toEqual([]);
    expect(container.querySelector('.widgets-quick-sheet__divider')).toBeNull();
    expect(container.querySelectorAll('.widgets-quick-sheet__chip').length).toBe(2);
  });

  it('вода двумя тапами: чип пишет объём и закрывает карточку', () => {
    const added = [];
    const { container } = open(ALL_ON, { onAddWater: (ml) => added.push(ml) });
    fireEvent.click(container.querySelectorAll('.widgets-quick-sheet__chip')[1]);
    expect(added).toEqual([500]);
    expect(container.querySelector('.widgets-quick-sheet')).toBeNull();
  });
});

/**
 * Правка списка в карточке (строки «правка списка», «два состояния
 * карандаша», «режим правки», «скрытые чипами», «нижняя граница правки»,
 * «области нажатия в карточке», «закрытие»).
 *
 * Почему смоуком. Режим правки — это стык трёх состояний: раскрытая карточка,
 * включённый карандаш и набор скрытых пунктов. Человек в проде не соберёт
 * «остался один включённый и два скрытых»: надо раскрыть карточку, войти в
 * правку, снять три строки и посмотреть, что стало с минусами и чипами.
 */
describe('быстрые действия: правка списка', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  /** Живой набор видимости: правка в карточке пишет в то же поле настроек. */
  function openEditable(initial = ALL_ON, props = {}) {
    const state = { ...initial };
    const Fab = loadFab(state);
    window.HEYS.FabVisibility = {
      EVENT: 'heys:fab-visibility-changed',
      read: () => ({ ...state }),
      setVisible: (key, value) => {
        state[key] = !!value;
        window.dispatchEvent(new CustomEvent('heys:fab-visibility-changed'));
      },
    };
    const out = render(RealReact.createElement(Fab, { waterMl: 1700, ...props }));
    fireEvent.click(out.container.querySelector('.widgets-quick-fab'));
    return { ...out, state };
  }

  const pencil = (c) => c.querySelector('.widgets-quick-pencil');

  it('карандаш есть только у раскрытой карточки', () => {
    const Fab = loadFab(ALL_ON);
    const { container } = render(RealReact.createElement(Fab, { waterMl: 0 }));
    expect(pencil(container)).toBeNull();
    fireEvent.click(container.querySelector('.widgets-quick-fab'));
    expect(pencil(container)).toBeTruthy();
  });

  it('карандаш карточку не закрывает — только переключает режим правки', () => {
    const { container } = openEditable();
    expect(container.querySelectorAll('.widgets-quick-minus').length).toBe(0);
    fireEvent.click(pencil(container));
    expect(container.querySelector('.widgets-quick-sheet')).toBeTruthy();
    expect(pencil(container).getAttribute('aria-pressed')).toBe('true');
    // Пять включённых пунктов — пять минусов (четыре навигационных и вода).
    expect(container.querySelectorAll('.widgets-quick-minus').length).toBe(5);
    fireEvent.click(pencil(container));
    expect(container.querySelector('.widgets-quick-sheet')).toBeTruthy();
    expect(container.querySelectorAll('.widgets-quick-minus').length).toBe(0);
  });

  it('в режиме правки шевроны гаснут, а не читаются', () => {
    const { container } = openEditable();
    fireEvent.click(pencil(container));
    expect(container.querySelector('.widgets-quick-sheet').className).toContain('is-editing');
    expect(container.querySelector('.widgets-quick-sheet__meta').getAttribute('aria-hidden')).toBe('true');
  });

  it('скрытый пункт уходит из списка и возвращается чипом на своё место', async () => {
    const { container, state } = openEditable();
    fireEvent.click(pencil(container));
    const minus = [...container.querySelectorAll('.widgets-quick-minus')]
      .find((el) => el.getAttribute('aria-label') === 'Убрать Активность');
    expect(minus).toBeTruthy();
    fireEvent.click(minus);
    // Строка сначала сжимается 160 мс и только потом уходит из набора.
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(state.activity).toBe(false);
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Голод и энергия', 'Еда']);
    const chip = container.querySelector('.widgets-quick-chip');
    expect(chip.getAttribute('aria-label')).toBe('Вернуть в список: Активность');
    fireEvent.click(chip);
    expect(state.activity).toBe(true);
    // Порядок списка фиксирован кодом: пункт встаёт на своё место, не в конец.
    expect(rowLabels(container)).toEqual(['Мессенджер', 'Активность', 'Голод и энергия', 'Еда']);
  });

  it('чипы скрытых живут только внутри режима правки', async () => {
    const { container } = openEditable();
    fireEvent.click(pencil(container));
    fireEvent.click([...container.querySelectorAll('.widgets-quick-minus')]
      .find((el) => el.getAttribute('aria-label') === 'Убрать Мессенджер'));
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(container.querySelectorAll('.widgets-quick-chip').length).toBe(1);
    fireEvent.click(pencil(container));
    expect(container.querySelectorAll('.widgets-quick-chip').length).toBe(0);
    // Карандаш остаётся: скрытый пункт вернуть больше неоткуда.
    expect(pencil(container)).toBeTruthy();
  });

  it('нижняя граница правки: у последней оставшейся строки минуса нет', () => {
    const { container } = openEditable({
      water: true, hunger: false, message: false, activity: false, meal: false,
    });
    fireEvent.click(pencil(container));
    expect(container.querySelectorAll('.widgets-quick-minus').length).toBe(0);
  });
});

/**
 * Общая шкала темпа (строки «вода» и «одна шкала на весь продукт»).
 *
 * Почему смоуком. Зоны 8 / 25 % вниз и 110 / 130 % вверх, первый час после
 * подъёма и конец окна «отбой минус час» человек в проде не соберёт: нужно
 * подделать время суток и чек-ин. Таблица случаев — ровно то, что не
 * проверяется глазами на локалке.
 */
describe('общая шкала темпа: вода на Главной', () => {
  let pace;

  beforeEach(() => {
    loadFab(ALL_ON);
    pace = window.HEYS.Widgets.v4PaceState;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  // Подъём 07:00, отбой 23:00 → бодрствование 16 ч, окно воды 15 ч.
  const ctx = (hhmm) => ({
    sleepEnd: '07:00',
    sleepStart: '23:00',
    nowMinutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)),
  });

  it('первый час после подъёма не красим', () => {
    expect(pace(0, 2700, ctx('07:30'))).toBe('neutral');
  });

  it('в графике — шалфей, а не «нейтрально»', () => {
    // 15:00 → прошло 8 ч из 15 ч окна, ожидаемое ≈ 1440 мл.
    expect(pace(1440, 2700, ctx('15:00'))).toBe('good');
  });

  it('отставание до 8 % нормы — ещё шалфей', () => {
    // 8 % от 2700 = 216 мл; берём 200 мл отставания.
    expect(pace(1240, 2700, ctx('15:00'))).toBe('good');
  });

  it('отставание 8–25 % нормы — предупреждение', () => {
    expect(pace(1000, 2700, ctx('15:00'))).toBe('warn');
  });

  it('отставание больше 25 % нормы — красный', () => {
    expect(pace(500, 2700, ctx('15:00'))).toBe('bad');
  });

  it('конец окна — отбой минус час: к 22:00 ждём всю норму', () => {
    expect(pace(2700, 2700, ctx('22:00'))).toBe('good');
    expect(pace(1800, 2700, ctx('22:00'))).toBe('bad');
  });

  it('перебор: больше 110 % — предупреждение, больше 130 % — красный', () => {
    expect(pace(3000, 2700, ctx('15:00'))).toBe('warn');
    expect(pace(3600, 2700, ctx('15:00'))).toBe('bad');
  });
});

/**
 * Строка «стопка на прошлом дне» (решение владельца 24 августа): быстрые
 * действия пишут в тот день, который открыт капсулой; кнопка на прошлом дне
 * не прячется и предупреждения не показывает.
 *
 * Почему смоуком по исходнику. Проверка требует открытой капсулой вчерашней
 * даты и записи в неё — на локалке это ручной проход по календарю, а результат
 * (в какой ключ дня легла вода) глазами вообще не виден. Здесь же видно
 * главное: дата берётся из selectedDate, а не из «сегодня», и никакого гейта
 * по дате у кнопки нет.
 *
 * Третья часть строки — «XP за прошлый день не начисляется» — этим файлом не
 * закрывается: начисление живёт в heys_gamification_v1.js по getToday(), и
 * события heysWaterAdded / heysMealAdded даты не несут. См. протокол экрана.
 */
describe('стопка на прошлом дне', () => {
  it('вода пишется в день, открытый капсулой, а не в сегодня', () => {
    const idx = uiSrc.indexOf('const handleAddWater = useCallback(');
    expect(idx).toBeGreaterThan(-1);
    const block = uiSrc.slice(idx, uiSrc.indexOf('const handleRemoveWater', idx));
    expect(block).toContain('const dateKey = selectedDate || new Date()');
    expect(block).toContain('`heys_dayv2_${dateKey}`');
    expect(block).toMatch(/\}, \[selectedDate\]\);\s*$/);
  });

  it('убавление воды идёт в тот же день', () => {
    const idx = uiSrc.indexOf('const handleRemoveWater = useCallback(');
    expect(idx).toBeGreaterThan(-1);
    const block = uiSrc.slice(idx, idx + 4000);
    expect(block).toContain('const dateKey = selectedDate || new Date()');
  });

  it('«Еда» и «Активность» уводят на открытый день, своей даты не подставляют', () => {
    const idx = uiSrc.indexOf('const goToDayAndRun = useCallback(');
    const block = uiSrc.slice(idx, uiSrc.indexOf('}, [setTab]);', idx));
    expect(block).not.toContain('setSelectedDate');
    expect(block).not.toMatch(/new Date\(\)/);
    expect(uiSrc).toContain("onAddMeal: () => goToDayAndRun('diary', 'addMeal', [])");
    expect(uiSrc).toContain("onOpenActivity: () => goToDayAndRun('activity', 'addActivity', [])");
  });

  it('кнопка на прошлом дне не прячется и предупреждения не показывает', () => {
    const idx = uiSrc.indexOf('const renderMobileFabs = () => {');
    expect(idx).toBeGreaterThan(-1);
    const block = uiSrc.slice(idx, uiSrc.indexOf('\n    };', idx));
    // Единственное условие — мобильный экран и не режим расстановки.
    expect(block).toMatch(/if \(!isMobile \|\| isEditMode\) return null;/);
    expect(block).not.toContain('selectedDate');
    expect(block).not.toContain('isPastDay');
    expect(block).not.toContain('isToday');
    // Ни подтверждения, ни предупреждения о прошлом дне в карточке нет.
    expect(uiSrc).not.toMatch(/прошл\w+ день/i);
    expect(uiSrc).not.toMatch(/confirm\(/);
  });
});
