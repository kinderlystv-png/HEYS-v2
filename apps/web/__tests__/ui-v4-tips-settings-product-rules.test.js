// Три сквозных дефекта из построчной сверки контракта v4 с кодом, зоны
// settings-system и tips: врезки экрана, запрет выделения текста, защита от
// повторного тапа. Контракт — home-widgets.v4.dc.html, строки «safe-area ·
// правило продукта», «повторный тап · правило продукта», «выделение и
// копирование · правило продукта»; местные отличия — settings-system.v4.dc.html
// и tips.v4.dc.html, строка «язык, выделение, часовой пояс».
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const ADVICE_SRC_PATH = path.resolve(__dirname, '..', 'day/_advice.js');
const WATER_CSS_PATH = path.resolve(__dirname, '..', 'styles/modules/400-water-and-hydration.css');
const BASE_CSS_PATH = path.resolve(__dirname, '..', 'styles/modules/000-base-and-gamification.css');
const APP_SHELL_PATH = path.resolve(__dirname, '..', 'heys_app_shell_v1.js');

function ruleBlock(cssSource, selectorLine) {
  const idx = cssSource.indexOf(selectorLine);
  expect(idx, `selector "${selectorLine}" not found`).toBeGreaterThanOrEqual(0);
  const close = cssSource.indexOf('}', idx);
  return cssSource.slice(idx, close);
}

describe('tips: врезка нижней шторки советов (safe-area · правило продукта)', () => {
  const css = fs.readFileSync(WATER_CSS_PATH, 'utf8');

  it('оверлей списка советов v4 зануляет padding намеренно (низ отдан контейнеру)', () => {
    const overlayBlock = ruleBlock(css, '.advice-list-overlay:has(.advice-list-container--v4) {');
    expect(overlayBlock).toContain('padding: 0;');
  });

  it('контейнер шторки советов добавляет env(safe-area-inset-bottom) к нижнему отступу', () => {
    const containerBlock = ruleBlock(css, '.advice-list-container--v4 {');
    expect(containerBlock).toMatch(/padding:\s*18px 16px calc\(16px \+ env\(safe-area-inset-bottom,\s*0px\)\)/);
  });
});

describe('settings-system: врезка шторки настроек (safe-area · правило продукта)', () => {
  const css = fs.readFileSync(BASE_CSS_PATH, 'utf8');

  // Форма шторки (popover от шапки vs нижний лист) — открытый вопрос
  // дизайнеру (UI_V4_FINDINGS.md), не решается этой правкой. Но нижняя
  // граница карточки настроек — там, где она есть, — обязана считаться от
  // safe-area-inset-bottom независимо от формы; это уже так через max-height.
  it('обёртка и карточка настроек резервируют env(safe-area-inset-bottom) в max-height', () => {
    const wrapBlock = ruleBlock(css, '.tab-settings-menu.tab-settings-menu--v4-sheet {');
    const cardBlock = ruleBlock(css, '.tab-settings-menu.tab-settings-menu--v4-sheet .hdr-settings-sheet__card {');
    expect(wrapBlock).toContain('env(safe-area-inset-bottom, 0px)');
    expect(cardBlock).toContain('env(safe-area-inset-bottom, 0px)');
  });
});

describe('tips: запрет выделения текста (выделение и копирование · правило продукта)', () => {
  const css = fs.readFileSync(WATER_CSS_PATH, 'utf8');

  it('заголовок карточки совета в списке не выделяется', () => {
    expect(ruleBlock(css, '.advice-list-text {')).toContain('user-select: none;');
  });

  it('подпись группы (категории) не выделяется', () => {
    expect(ruleBlock(css, '.advice-group-header {')).toContain('user-select: none;');
  });

  it('текст всплывающего совета (тот же текст, что заголовок карточки) не выделяется', () => {
    expect(ruleBlock(css, '.advice-v4-toast-card__text {')).toContain('user-select: none;');
  });

  // Местное отличие tips (contract «язык, выделение, часовой пояс»): текстом
  // совета в детали делятся — запрет там ставить нельзя.
  it('текст совета в детали остаётся выделяемым — им делятся', () => {
    expect(ruleBlock(css, '.advice-v4-detail__title {')).not.toContain('user-select');
  });
});

describe('settings-system: строка «Язык» — отсутствует по контракту, не дефект', () => {
  it('переключателя языка в настройках нет (общее правило «язык · правило продукта»)', () => {
    const shellSrc = fs.readFileSync(APP_SHELL_PATH, 'utf8');
    expect(shellSrc).not.toMatch(/label:\s*'Язык'/);
  });
});

describe('settings-system: чип быстрых действий — переключатель, защита от повторного тапа не нужна', () => {
  // Контракт «повторный тап · правило продукта»: «У переключателей и
  // навигации защиты тоже нет». Контракт «доступность» settings-system:
  // «чипы быстрых действий — группа чекбоксов». Добавлять сюда таймер-лок
  // значило бы нарушить контракт, а не починить дефект.
  it('чип оформлен как checkbox (переключатель), а не как одноразовое действие', () => {
    const shellSrc = fs.readFileSync(APP_SHELL_PATH, 'utf8');
    const idx = shellSrc.indexOf("hdr-settings-sheet__fab-chip");
    expect(idx).toBeGreaterThanOrEqual(0);
    const nearby = shellSrc.slice(idx, idx + 700);
    expect(nearby).toContain("role: 'checkbox'");
    expect(nearby).toContain('toggleDraftVisible');
  });
});

// --- Поведенческие смоуки: защита от повторного тапа на оценке совета ---

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  const code = fs.readFileSync(ADVICE_SRC_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
});

function mountAdviceState(overrides = {}) {
  const box = { api: null };
  function Probe() {
    box.api = window.HEYS.dayAdviceState.useAdviceState({
      React,
      day: {},
      date: '2026-08-24',
      prof: {},
      pIndex: {},
      prodSig: '',
      dayTot: {},
      normAbs: {},
      optimum: 2000,
      waterGoal: 2000,
      uiState: {},
      haptic: () => {},
      U: {},
      lsGet: () => null,
      currentStreak: 0,
      currentMinute: 0,
      setShowConfetti: () => {},
      HEYS: window.HEYS,
      ...overrides,
    });
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(React.createElement(Probe)); });
  return box;
}

describe('tips: защита от повторного тапа на оценке всплывающего совета (день/_advice.js: handleToastRate)', () => {
  const advice = { id: 'toast-1', type: 'tip', text: 'Пейте воду', category: 'water', icon: '💧' };

  it('второй тап на той же оценке в течение 350 мс игнорируется, тап после окна засчитывается', async () => {
    const calls = [];
    window.HEYS.currentClientId = 'client-toast-1';
    window.HEYS.advice = {
      useAdviceEngine: () => ({
        primary: null,
        relevant: [],
        adviceCount: 0,
        allAdvices: [],
        badgeAdvices: [],
        trace: null,
        markShown: null,
        markRead: null,
        markHidden: null,
        rateAdvice: (a, positive) => calls.push([a.id, positive]),
        trackClick: null,
        scheduleAdvice: null,
        scheduledCount: 0,
      }),
    };

    // box.api переустанавливается на каждый рендер — берём его свежим на
    // каждом шаге, а не единожды деструктурированной ссылкой (та осталась
    // бы указывать на снапшот до setDisplayedAdvice).
    const box = mountAdviceState();
    act(() => { box.api.setDisplayedAdvice(advice); });

    const fakeEvent = () => ({ stopPropagation() {} });
    act(() => {
      box.api.handleToastRate(true, fakeEvent());
      box.api.handleToastRate(true, fakeEvent());
      box.api.handleToastRate(false, fakeEvent());
    });
    expect(calls).toEqual([['toast-1', true]]);

    // окно 350 мс истекло — следующий тап это уже новая оценка
    await new Promise((resolve) => setTimeout(resolve, 380));
    act(() => { box.api.handleToastRate(false, fakeEvent()); });
    expect(calls).toEqual([['toast-1', true], ['toast-1', false]]);

    delete window.HEYS.currentClientId;
    delete window.HEYS.advice;
  });
});

describe('tips: панель «Прочитано» после свайпа — защита исчезновением панели, не таймером', () => {
  const advice = { id: 'swipe-1', type: 'tip', text: 'Белок после тренировки', category: 'training', icon: '💡' };

  function renderListWithPanel(props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        window.HEYS.dayAdviceListUI.renderManualAdviceList({
          React,
          adviceTrigger: 'manual',
          adviceRelevant: [advice],
          badgeAdvices: [advice],
          totalAdviceCount: 1,
          toastVisible: true,
          dismissToast: () => {},
          getSortedGroupedAdvices: () => ({ sorted: [advice], groups: { training: [advice] } }),
          dismissedAdvices: new Set(),
          hiddenUntilTomorrow: new Set(),
          adviceSwipeState: {},
          expandedAdviceId: null,
          trackClick: () => {},
          handleAdviceSwipeStart: () => {},
          handleAdviceSwipeMove: () => {},
          handleAdviceSwipeEnd: () => {},
          handleAdviceLongPressStart: () => {},
          handleAdviceLongPressEnd: () => {},
          registerAdviceCardRef: () => {},
          handleAdviceListTouchStart: () => {},
          handleAdviceListTouchMove: () => {},
          handleAdviceListTouchEnd: () => {},
          handleDismissAll: () => {},
          dismissAllAnimation: false,
          toastsEnabled: true,
          toggleToastsEnabled: () => {},
          scheduleAdvice: () => {},
          undoLastDismiss: () => {},
          adviceDetailModalOpen: false,
          adviceDetailModalAdvice: null,
          openAdviceDetailModal: () => {},
          closeAdviceDetailModal: () => {},
          openAdviceTechnicalDetails: () => {},
          closeAdviceTechnicalDetails: () => {},
          ADVICE_CATEGORY_NAMES: { training: 'Тренировки' },
          ewsWarnings: [],
          AdviceCard: window.HEYS.dayComponents.AdviceCard,
          retryAdviceMarksSync: () => {},
          medicalDisclaimerSessionDismissed: true,
          ...props,
        })
      );
    });
    return host;
  }

  it('тап «Полезно» после реального (не в тот же тик) повторного тапа не создаёт вторую оценку', async () => {
    const calls = [];
    let cleared = 0;
    const host = renderListWithPanel({
      lastDismissedAdvice: { id: advice.id, action: 'read' },
      rateAdvice: (a, positive) => calls.push([a.id, positive]),
      clearLastDismissed: () => { cleared += 1; },
    });

    const useful = host.querySelector('.advice-v4-panel__btn--useful');
    expect(useful).toBeTruthy();
    await act(async () => {
      useful.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      // rateAdvice/clearLastDismissed в handler'е отложены на setTimeout(0) —
      // ждём реальный макротаск, как это происходит между двумя настоящими
      // тапами человека (там между ними всегда есть хотя бы один тик).
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(calls).toEqual([[advice.id, true]]);
    expect(cleared).toBe(1);
  });
});
