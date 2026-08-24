/**
 * Три сквозных правила продукта (home-widgets.v4.dc.html, строки «safe-area ·
 * правило продукта», «повторный тап · правило продукта», «выделение и
 * копирование · правило продукта») — точечная сверка в двух зонах: home-widgets
 * и gamification. gamification наследует эти правила без местных отличий
 * (gamification.v4.dc.html, строки «safe-area и кнопка назад», «язык,
 * выделение, часовой пояс», «повторный тап и поворот»), кроме tap-guard: экран
 * достижений ничего не пишет, поэтому там защищать нечего (местных отличий у
 * этой строки нет, но сам экран read-only).
 *
 * Почему смоуком. Врезка и выделение проверяются по исходнику CSS/JS — их не
 * увидеть на десктопном браузере без настоящего выреза. Повторный тап —
 * дребезг пальца в пределах 350 мс, который на локалке руками не воспроизвести
 * дважды одинаково; jsdom с двумя synchронными fireEvent.click повторяет его
 * детерминированно.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const widgetsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const gameCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const gameBarSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_gamification_bar_v1.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

describe('safe-area · правило продукта', () => {
  it('лист достижений (game-panel-expanded--v4) вычитает нижнюю врезку из maxHeight', () => {
    expect(gameBarSrc).toContain('readGameSafeAreaInsetBottomPx');
    expect(gameBarSrc).toContain('env(safe-area-inset-bottom, 0px)');
    // maxHeight действительно учитывает safeBottom, а не просто объявляет функцию рядом.
    const calcIdx = gameBarSrc.indexOf('const maxHeight = Math.max(220,');
    expect(calcIdx).toBeGreaterThan(-1);
    expect(gameBarSrc.slice(calcIdx, calcIdx + 160)).toContain('safeBottom');
  });

  it('модалки разбора виджетов (Динамика веса / Оценка дня / Риск-радар) прижимаются к нижней врезке', () => {
    const idx = widgetsCss.indexOf('.widget-relapse-risk__modal-overlay {');
    expect(idx).toBeGreaterThan(-1);
    const block = widgetsCss.slice(idx, idx + 700);
    expect(block).toContain('padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));');
  });

  it('тот же отступ учтён и в мобильном брейкпоинте (≤520px)', () => {
    const idx = widgetsCss.indexOf('@media (max-width: 520px) {\n  .widget-relapse-risk__modal-overlay {');
    expect(idx).toBeGreaterThan(-1);
    const block = widgetsCss.slice(idx, idx + 200);
    expect(block).toContain('padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));');
  });
});

describe('выделение и копирование · правило продукта', () => {
  it('плитка Главной (widget-v4-tile) гасит и выделение, и системный callout долгого нажатия', () => {
    const idx = widgetsCss.indexOf('.widget-v4-tile {');
    expect(idx).toBeGreaterThan(-1);
    const block = widgetsCss.slice(idx, idx + 700);
    expect(block).toContain('-webkit-touch-callout: none;');
    expect(block).toContain('user-select: none;');
  });

  it('лист достижений (game-v4-sheet) не выделяется целиком — в нём нет ничего, что написал человек сам', () => {
    const idx = gameCss.indexOf('.game-v4-sheet {');
    expect(idx).toBeGreaterThan(-1);
    const block = gameCss.slice(idx, idx + 700);
    expect(block).toContain('user-select: none;');
  });
});

describe('повторный тап · правило продукта — home-widgets', () => {
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
        data: { getWaterData: () => ({ hasData: true, drunk: 0, target: 2700 }) },
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

    // eslint-disable-next-line no-eval
    eval(uiSrc);
    return window.HEYS.Widgets.QuickActionsFab;
  }

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('«Еда» и «Активность» пишут запись — второй тап внутри 350 мс проглочен', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: false, message: false, activity: true, meal: false });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onOpenActivity: () => calls.push('activity') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toEqual(['activity']);
  });

  it('«Голод и энергия» — навигация (открывает модалку, ничего не пишет), защиты нет', () => {
    const calls = [];
    const Fab = loadFab({ water: false, hunger: true, message: false, activity: false, meal: false });
    const { container } = render(
      RealReact.createElement(Fab, { waterMl: 0, onOpenHunger: () => calls.push('hunger') }),
    );
    const button = container.querySelector('.widgets-quick-fab');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls).toEqual(['hunger', 'hunger']);
  });

  it('вода — аддитивный ввод: явно исключена контрактом, чипы FAB не оборачиваются в guardEntityQuickAction', () => {
    const idx = uiSrc.indexOf('onAddWater: (ml)');
    expect(idx).toBeGreaterThan(-1);
    expect(uiSrc.slice(idx, idx + 60)).not.toContain('guardEntityQuickAction');
  });
});

describe('повторный тап · правило продукта — gamification: экран ничего не пишет', () => {
  it('GamificationSheet только читает и переключает локальные вкладки — своей guard-логики не заводит', () => {
    const screensSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_gamification_screens_v1.js'), 'utf8');
    expect(screensSrc).not.toMatch(/350/);
  });
});
