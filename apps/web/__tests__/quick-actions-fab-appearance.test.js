/**
 * Появление и исчезновение кнопки быстрых действий + счётчик блоков Главной.
 *
 * Канвас settings-system.v4, строки контракта:
 *   «когда применяется» — состав меняется по закрытии шторки, анимации
 *     перестройки на экране нет; исключение — появление и исчезновение самой
 *     кнопки при переходе через один и ноль включённых;
 *   «снятый прогон» — прогон перестройки стопки (400 мс, стаггер 52, перелёт
 *     1,045) снят 24 августа и не реализуется;
 *   «появление и исчезновение кнопки» — 220 мс с перелётом до 1,06 на
 *     появление, 160 мс на исчезновение, 220 мс на смену иконки и тона;
 *   «уменьшенное движение» — оба перехода становятся мгновенной сменой
 *     состояния;
 *   «значение справа» — в строке шторки стоит «6 из 7 блоков».
 *
 * Почему смоуком, а не глазами. Оба перехода живут ровно на границе состава:
 * надо зайти в настройки, снять последний чип, вернуться на Главную и успеть
 * посмотреть 160 мс. Собрать это руками нельзя — ни в проде, ни на локалке.
 */
import fs from 'node:fs';
import path from 'node:path';

import { act, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const waterCss = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/400-water-and-hydration.css'),
  'utf8',
);
const widgetsCss = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;
const originalMatchMedia = window.matchMedia;

const ALL_ON = { water: true, hunger: true, message: true, activity: true, meal: true };
const NONE_ON = { water: false, hunger: false, message: false, activity: false, meal: false };

function stubHeys(state, { reducedMotion = false, widgets = [], catalog = [] } = {}) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    createPortal: (node) => node,
  };

  window.HEYS = {
    motion: { prefersReducedMotion: () => reducedMotion },
    Widgets: {
      emit: () => {},
      on: () => () => {},
      registry: {
        getAvailableTypes: () => catalog,
        getType: () => null,
        getSize: () => null,
        normalizeSizeId: (id) => id,
        getCategories: () => [],
      },
      state: { isEditMode: () => false, getWidgets: () => widgets },
      data: { getWaterData: () => ({ hasData: true, drunk: 1700, target: 2700 }) },
      VariantsV4: {
        getCatalog: () => [],
        getDefaultVariant: () => null,
        getActiveVariant: () => null,
        getVariantById: () => null,
        useWidgetVariantTile: null,
      },
    },
    FabVisibility: {
      EVENT: 'heys:fab-visibility-changed',
      read: () => ({ ...state }),
      setVisible: (key, value) => {
        state[key] = !!value;
        window.dispatchEvent(new CustomEvent('heys:fab-visibility-changed'));
      },
    },
    WaterCustomVolume: { PRESETS_ML: [200, 500] },
    utils: { lsGet: () => ({}) },
    dayUtils: {},
  };

  // eslint-disable-next-line no-eval
  eval(uiSrc);
  return window.HEYS.Widgets;
}

/** Смена состава так, как её видит кнопка: чип в настройках → событие. */
function setVisible(patch) {
  act(() => {
    Object.entries(patch).forEach(([key, value]) => {
      window.HEYS.FabVisibility.setVisible(key, value);
    });
  });
}

function wrap(container) {
  return container.querySelector('.widgets-quick-fab-wrap');
}

describe('быстрые действия: появление и исчезновение кнопки', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
    window.matchMedia = originalMatchMedia;
  });

  it('первая отрисовка переходом не считается — кнопка просто стоит', () => {
    const Widgets = stubHeys({ ...ALL_ON });
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }));
    expect(container.querySelector('.widgets-quick-fab')).toBeTruthy();
    expect(wrap(container).className).not.toMatch(/is-entering|is-leaving|is-swapping/);
  });

  it('последний пункт снят — кнопка сжимается 160 мс и только потом уходит', () => {
    const state = { ...ALL_ON };
    const Widgets = stubHeys(state);
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }));

    setVisible({ water: false, hunger: false, message: false, activity: false, meal: false });
    // Кнопка ещё на экране и уже сжимается — исчезновение отыгрывается.
    expect(container.querySelector('.widgets-quick-fab')).toBeTruthy();
    expect(wrap(container).className).toContain('is-leaving');

    act(() => { vi.advanceTimersByTime(160); });
    // Строка «не включено ни одного»: кнопки в углу нет вовсе.
    expect(container.querySelector('.widgets-quick-fab')).toBeNull();
  });

  it('первый включённый пункт — кнопка вырастает 220 мс', () => {
    const state = { ...NONE_ON };
    const Widgets = stubHeys(state);
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 0 }));
    expect(container.querySelector('.widgets-quick-fab')).toBeNull();

    setVisible({ water: true });
    expect(wrap(container).className).toContain('is-entering');

    act(() => { vi.advanceTimersByTime(220); });
    expect(wrap(container).className).not.toContain('is-entering');
    expect(container.querySelector('.widgets-quick-fab')).toBeTruthy();
  });

  it('переход через один включённый — смена иконки и тона 220 мс', () => {
    // Была одна вода (кнопка носит тон воды), включили еду — кнопка стала «+».
    const state = { ...NONE_ON, water: true };
    const Widgets = stubHeys(state);
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 900 }));
    expect(container.querySelector('.widgets-quick-fab--water')).toBeTruthy();

    setVisible({ meal: true });
    expect(wrap(container).className).toContain('is-swapping');
    expect(container.querySelector('.widgets-quick-fab--water')).toBeNull();

    act(() => { vi.advanceTimersByTime(220); });
    expect(wrap(container).className).not.toContain('is-swapping');
  });

  it('перестройка состава без перехода через один и ноль ничего не анимирует', () => {
    // Строка «когда применяется»: «Анимации перестройки на экране нет».
    const state = { ...ALL_ON };
    const Widgets = stubHeys(state);
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }));

    setVisible({ hunger: false, activity: false });
    expect(wrap(container).className).not.toMatch(/is-entering|is-leaving|is-swapping/);
  });

  it('уменьшенное движение — оба перехода мгновенные, без выдержки 160 мс', () => {
    const state = { ...ALL_ON };
    const Widgets = stubHeys(state, { reducedMotion: true });
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }));

    setVisible({ water: false, hunger: false, message: false, activity: false, meal: false });
    // Ни класса перехода, ни доживающей кнопки: состояние сменилось разом.
    expect(container.querySelector('.widgets-quick-fab')).toBeNull();
  });
});

/**
 * Строка «второй адрес правки»: «тот же список правится карандашом в
 * раскрытой карточке быстрых действий … скрытый там пункт гасит чип здесь,
 * включённый чип здесь возвращает строку туда. Поле одно, состояний два не
 * бывает».
 *
 * Почему смоуком. Расхождение двух адресов одного списка видно не сразу, а
 * через шторку настроек: убрал строку в карточке, зашёл в настройки — а чип
 * горит. Пройти это глазами значит четыре экрана на каждую проверку.
 */
describe('быстрые действия: правка карточки пишет в поле настроек', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('минус в карточке гасит чип в настройках, чип возвращает строку', () => {
    const state = { ...ALL_ON };
    const Widgets = stubHeys(state);
    const { container } = render(RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }));

    act(() => { container.querySelector('.widgets-quick-fab').click(); });
    act(() => { container.querySelector('.widgets-quick-pencil').click(); });
    // Первая строка сверху — «Мессенджер» (карточка растёт вверх).
    act(() => { container.querySelector('.widgets-quick-minus').click(); });
    act(() => { vi.advanceTimersByTime(160); });

    // Второго состояния нет: настройки читают ровно то же поле.
    expect(window.HEYS.FabVisibility.read().message).toBe(false);
    expect(state.message).toBe(false);

    act(() => { container.querySelector('.widgets-quick-chip').click(); });
    expect(window.HEYS.FabVisibility.read().message).toBe(true);
  });
});

describe('быстрые действия: снятый прогон стопки', () => {
  it('в CSS нет ни 400 мс, ни стаггера 52, ни перелёта 1,045', () => {
    // Строка «снятый прогон»: вердикт «—», реализации не требует.
    expect(waterCss).not.toContain('--fab-slot-stagger-ms');
    expect(waterCss).not.toContain('--fab-slot-anim-ms');
    expect(waterCss).not.toContain('scale(1.045)');
  });

  it('появление и исчезновение одиночной кнопки — 220 с перелётом 1,06 и 160', () => {
    const popIn = waterCss.match(/@keyframes fab-slot-pop-in \{[\s\S]*?\n\}/)[0];
    expect(popIn).toContain('scale(1.06)');
    expect(waterCss).toContain('animation: fab-slot-pop-in 220ms');
    expect(waterCss).toMatch(/\.fab-group--messenger-only\.fab-group--layout-animate \.fab-slot \{[\s\S]*?160ms/);
  });

  it('стопка на прочих вкладках состояния меняет мгновенно', () => {
    // Прогон снят только у стопки: правило появления оставлено одиночной
    // кнопке, поэтому всё, что ещё анимируется под layout-animate, обязано
    // адресоваться messenger-only. Иначе прогон вернётся через общий селектор.
    const rules = waterCss.match(/[^}\n][^}]*\.fab-group--layout-animate[^{}]*\{[^}]*\}/g) || [];
    const animated = rules.filter((rule) => /transition:|animation:/.test(rule));
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((rule) => {
      expect(rule).toContain('.fab-group--messenger-only');
    });
  });

  it('уменьшенное движение гасит переход, который animate-always прикрывает', () => {
    // Группу помечает animate-always чужой JS, поэтому глобальный killer сюда
    // не достаёт: гашение стоит в самом модуле.
    const reduce = waterCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
    expect(reduce.some((block) => block.includes('.fab-group--messenger-only'))).toBe(true);
  });

  it('кнопка Главной анимируется теми же 220/1,06/160', () => {
    const grow = widgetsCss.match(/@keyframes widgets-quick-fab-grow \{[\s\S]*?\n\}/)[0];
    expect(grow).toContain('scale(1.06)');
    expect(widgetsCss).toContain('animation: widgets-quick-fab-grow 220ms');
    expect(widgetsCss).toContain('animation: widgets-quick-fab-shrink 160ms');
    // Строка «уменьшенное движение»: animate-always на обёртке нет, значит
    // глобальный killer гасит все три перехода сам.
    expect(widgetsCss).not.toMatch(/widgets-quick-fab-wrap[^\n{]*animate-always/);
  });
});

describe('счётчик блоков Главной для строки настроек', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('«N из M блоков»: поставленные типы из каталога доступных', () => {
    const Widgets = stubHeys({ ...ALL_ON }, {
      widgets: [{ type: 'calories' }, { type: 'water' }, { type: 'sleep' }],
      catalog: [
        { type: 'calories' }, { type: 'water' }, { type: 'sleep' },
        { type: 'steps' }, { type: 'weight' }, { type: 'macros' }, { type: 'fiber' },
      ],
    });
    expect(Widgets.getVisibleBlocksSummary()).toEqual({
      visible: 3,
      total: 7,
      text: '3 из 7 блоков',
    });
  });

  it('стоящий на экране, но снятый с каталога блок не даёт «7 из 6»', () => {
    const Widgets = stubHeys({ ...ALL_ON }, {
      widgets: [{ type: 'calories' }, { type: 'streak' }],
      catalog: [{ type: 'calories' }, { type: 'water' }],
    });
    const summary = Widgets.getVisibleBlocksSummary();
    expect(summary.visible).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.visible).toBeLessThanOrEqual(summary.total);
  });

  it('пустой экран — «0 из M блоков», а не пусто', () => {
    const Widgets = stubHeys({ ...ALL_ON }, { widgets: [], catalog: [{ type: 'calories' }] });
    expect(Widgets.getVisibleBlocksSummary().text).toBe('0 из 1 блоков');
  });
});
