/**
 * Главная: слой быстрых действий и ширина строк каталога.
 *
 * Кадр «Быстрые действия · раскрыто» (home-widgets.v4.dc.html) рисует
 * затемнение ДО карандаша и кнопки — они поверх него, в полном тоне. В
 * продукте затемнение с карточкой уезжали в body, а кнопка с карандашом
 * оставались во вкладке, у которой `.wrap { isolation: isolate }`. Весь слой
 * вкладки — отдельный контекст наложения с `z-index: auto`, поэтому свой
 * `z-index: 1001` кнопке не помогал: портал перекрывал её целиком. Карандаш от
 * этого не просто гас — нажатие по нему приходило в затемнение и закрывало
 * карточку, то есть в режим правки списка было не войти вовсе (кадр «Быстрые
 * действия · правка · режим» недостижим).
 *
 * Кадры «Каталог · нет места · 09–14» и «Каталог · значки вместо эмодзи ·
 * 09–14»: строки каталога идут одна под другой во всю ширину. В продукте
 * стояло `grid-template-columns: 1fr 1fr`, а `1fr` — это `minmax(auto, 1fr)`:
 * собственная минимальная ширина строки растягивала дорожки до 302 и 291 px
 * при контейнере 343, и вторая колонка уезжала за правый край экрана 375.
 *
 * Смоуком, а не глазами: обе поломки видны только в раскрытом состоянии и
 * обе — про порядок слоёв и раскладку, которые пара «макет — приложение»
 * показывает, а регресс потом ловить нечем.
 */
import fs from 'node:fs';
import path from 'node:path';

import { act, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { requireRule } from './helpers/css-rule.mjs';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const widgetsCss = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'),
  'utf8',
);

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const ALL_ON = { water: true, hunger: true, message: true, activity: true, meal: true };

function stubHeys(state) {
  globalThis.React = RealReact;
  globalThis.ReactDOM = {
    createRoot: () => ({ render: () => {}, unmount: () => {} }),
    // Портал возвращаем на месте: тест смотрит порядок узлов внутри слоя,
    // а не то, в какой контейнер React его положил.
    createPortal: (node) => node,
  };

  window.HEYS = {
    motion: { prefersReducedMotion: () => false },
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
      state: { isEditMode: () => false, getWidgets: () => [] },
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

/** Правило CSS по селектору: последнее объявление свойства в блоке. */
// Селектор ищется от начала строки, а не подстрокой: короткий селектор целиком
// лежит внутри длинного с предком, и поиск подстрокой брал первое совпадение —
// чужое правило. Ненайденное роняет тест с именем селектора: пустая строка
// читалась как «не сошлось», а означала «не смотрели» (helpers/css-rule).
function cssProp(selector, prop) {
  // Комментарии внутри блока убираем: иначе объявление сразу после комментария
  // не опознаётся как начало строки.
  const body = requireRule(widgetsCss, selector).body.replace(/\/\*[\s\S]*?\*\//g, ';');
  const values = [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))];
  return values.length ? values[values.length - 1][1].trim() : null;
}

describe('Главная: слой быстрых действий поверх затемнения', () => {
  beforeEach(() => {
    globalThis.React = RealReact;
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('кнопка и карандаш лежат в том же слое, что затемнение, и после него', () => {
    const Widgets = stubHeys({ ...ALL_ON });
    const { container } = render(
      RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }),
    );

    act(() => {
      container.querySelector('.widgets-quick-fab').click();
    });

    const layer = container.querySelector('.widgets-quick-portal');
    expect(layer, 'слой быстрых действий не собран').toBeTruthy();
    const scrim = layer.querySelector(':scope > .widgets-quick-scrim');
    const wrap = layer.querySelector(':scope > .widgets-quick-fab-wrap');
    expect(scrim, 'затемнение не в слое').toBeTruthy();
    expect(wrap, 'кнопка с карандашом не в слое — она снова под затемнением').toBeTruthy();
    // Кадр рисует затемнение раньше карандаша и кнопки: порядок узлов и есть
    // порядок наложения внутри слоя.
    const order = [...layer.children];
    expect(order.indexOf(scrim)).toBeLessThan(order.indexOf(wrap));
    expect(wrap.querySelector('.widgets-quick-pencil'), 'карандаша нет').toBeTruthy();
  });

  it('карандаш переводит карточку в режим правки', () => {
    // Пока кнопка лежала под затемнением, это нажатие закрывало карточку.
    const Widgets = stubHeys({ ...ALL_ON });
    const { container } = render(
      RealReact.createElement(Widgets.QuickActionsFab, { waterMl: 1700 }),
    );

    act(() => {
      container.querySelector('.widgets-quick-fab').click();
    });
    act(() => {
      container.querySelector('.widgets-quick-pencil').click();
    });

    expect(container.querySelector('.widgets-quick-sheet.is-editing')).toBeTruthy();
    expect(container.querySelector('.widgets-quick-pencil.is-editing')).toBeTruthy();
  });

  it('ступень слоя — ступень кнопки, а не на единицу ниже', () => {
    // Ступень ниже равна ступени нижней навигации, и кто окажется выше,
    // зависело бы от порядка узлов в body.
    expect(cssProp('.widgets-quick-portal', 'z-index')).toBe('var(--v4-z-fab, 1001)');
  });
});

describe('Главная: вжатая плитка под пальцем', () => {
  const variantsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');

  it('вжатие включается вместе с подсказкой, а не с открытием листа', () => {
    // Кадр «Смена вида · удержание»: подсказка уже висит, и плитка под пальцем
    // уже сжата и обведена. Пока `setHolding(true)` стоял только в таймере
    // долгого нажатия, вжатую плитку не показывали вовсе — она включалась в тот
    // же миг, что и лист поверх неё.
    const hintTimer = /lpHintTimerRef\.current = setTimeout\(\(\) => \{([\s\S]*?)\}, HOLD_HINT_MS\);/
      .exec(variantsSrc);
    expect(hintTimer, 'таймер подсказки не найден').toBeTruthy();
    expect(hintTimer[1]).toContain('setVariantHoldHintActive(true)');
    expect(hintTimer[1]).toContain('setHolding(true)');
    // Палец увели — вжатие снимается вместе с подсказкой.
    const cancel = /const cancelLongPress = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/
      .exec(variantsSrc);
    expect(cancel, 'cancelLongPress не найден').toBeTruthy();
    expect(cancel[1]).toContain('setHolding(false)');
  });

  it('обводка вжатой плитки — роль набора и скругление плитки', () => {
    // Строка 13 кадра: «сдвиг scale(.965), рамка inset 0 0 0 2px var(--acs)».
    // Литерал вместо роли оставлял обводку терракотовой на синем наборе, а
    // прямые углы читались как чужая рамка поверх карточки.
    for (const selector of ['.widget-wd--holding', '.widget-v4-tile--holding']) {
      expect(cssProp(selector, 'transform'), selector).toBe('scale(0.965)');
      expect(cssProp(selector, 'box-shadow'), selector)
        .toBe('inset 0 0 0 2px var(--v4-act, #c67139)');
      expect(cssProp(selector, 'border-radius'), selector)
        .toBe('var(--widget-radius-lg, 16px)');
    }
  });
});

describe('Главная: калории в переборе', () => {
  /** Все правила, в чей список селекторов входит данный селектор. */
  function blocksWithSelector(selector) {
    const blocks = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(widgetsCss))) {
      const selectors = match[1]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(',')
        .map((one) => one.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (selectors.includes(selector)) blocks.push(match[2]);
    }
    return blocks;
  }

  it('герой перебора остаётся 34 px и красным, а не кеглем прибавки', () => {
    // Кадр «Калории · состояние · Перебор», строка 03: «−120» — 600 34px
    // тоном var(--val-bad). Оба селектора перебора стояли в одном списке с
    // прибавкой от активности, и её 9px/700 доставались им обоим: герой 2×2
    // рисовался девятью пикселями, а красный ему не доставался вовсе — в
    // списке остались размер и вес, но не цвет, ради которого он был написан.
    const hero = '.widget-calories__hero-value .widget-calories__value--lg.widget-v4-val--bad';
    const blocks = blocksWithSelector(hero);
    expect(blocks.length, 'правило перебора для героя не найдено').toBeGreaterThan(0);
    const joined = blocks.join(';');
    expect(joined, 'цвет перебора не задан').toMatch(/color\s*:\s*var\(--v4-bad-text/);
    expect(joined, 'герою перебора снова задают кегль').not.toMatch(/font-size\s*:/);
    // Кегль прибавки от активности остаётся при ней.
    expect(blocksWithSelector('.widget-calories__line-meta--gain').join(';'))
      .toMatch(/font-size\s*:\s*9px/);
  });
});

describe('Главная: каталог виджетов — одна колонка', () => {
  it('дорожка каталога одна и сжимается до контейнера', () => {
    const columns = cssProp('.widget-v4-catalog__grid', 'grid-template-columns');
    expect(columns, 'правило дорожек каталога не найдено').toBeTruthy();
    // minmax(0, 1fr): без нуля дорожка снова вырастет по минимальной ширине
    // строки и уедет за правый край экрана.
    expect(columns).toBe('minmax(0, 1fr)');
  });
});
