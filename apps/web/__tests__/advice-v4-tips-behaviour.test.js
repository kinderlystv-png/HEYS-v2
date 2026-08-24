// Смоук зоны tips: строки контракта «вид карточки совета», «пустое состояние»
// и «доступность» проверяются рендером, а не чтением исходника — стык
// «шторка = диалог с запертым фокусом» иначе не воспроизвести руками.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const SRC = path.resolve(__dirname, '..', 'day/_advice.js');

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  const code = fs.readFileSync(SRC, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
});

function renderNode(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return host;
}

const advice = {
  id: 'a1',
  type: 'tip',
  text: 'После тренировки нужен белок',
  category: 'training',
  icon: '💡',
  details: 'Порция от 25 до 40 г белка.',
};

// Общая заготовка пропсов детали: тесты ниже отличаются одним-двумя полями,
// а весь остальной набор — обязательные заглушки renderManualAdviceList.
function detailProps(extra) {
  return {
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
    lastDismissedAdvice: null,
    adviceSwipeState: {},
    expandedAdviceId: null,
    trackClick: () => {},
    rateAdvice: () => {},
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
    clearLastDismissed: () => {},
    adviceDetailModalOpen: true,
    adviceDetailModalAdvice: advice,
    openAdviceDetailModal: () => {},
    closeAdviceDetailModal: () => {},
    openAdviceTechnicalDetails: () => {},
    closeAdviceTechnicalDetails: () => {},
    ADVICE_CATEGORY_NAMES: { training: 'Тренировки' },
    ewsWarnings: [],
    AdviceCard: window.HEYS.dayComponents.AdviceCard,
    retryAdviceMarksSync: () => {},
    medicalDisclaimerSessionDismissed: true,
    ...extra,
  };
}

describe('tips v4: карточка, пустое состояние, доступность', () => {
  it('drawer is a modal dialog and cards carry a Детали entry row with chevron', () => {
    const host = renderNode(
      window.HEYS.dayAdviceListUI.renderManualAdviceList({
        React,
        adviceTrigger: 'manual',
        adviceRelevant: [advice],
        badgeAdvices: [advice],
        totalAdviceCount: 5,
        toastVisible: true,
        dismissToast: () => {},
        getSortedGroupedAdvices: () => ({ sorted: [advice], groups: { training: [advice] } }),
        dismissedAdvices: new Set(),
        hiddenUntilTomorrow: new Set(),
        lastDismissedAdvice: null,
        adviceSwipeState: {},
        expandedAdviceId: null,
        trackClick: () => {},
        rateAdvice: () => {},
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
        clearLastDismissed: () => {},
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
      })
    );

    const dialog = host.querySelector('.advice-list-container--v4');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Советы, 5');
    expect(document.activeElement).toBe(dialog);

    const entry = host.querySelector('.advice-card-footnote-link');
    expect(entry).toBeTruthy();
    expect(entry.textContent).toContain('Детали');
    expect(entry.querySelector('svg')).toBeTruthy();
    expect(entry.querySelector('svg').getAttribute('width')).toBe('14');

    // Пояснения вторичным тоном в карточке нет
    expect(host.querySelector('.advice-list-details')).toBeNull();
    expect(host.querySelector('.advice-expand-arrow')).toBeNull();

    // Счётчик в шапке есть и не читается отдельным узлом
    const count = host.querySelector('.advice-list-title__count');
    expect(count.getAttribute('aria-hidden')).toBe('true');
    expect(count.textContent.trim()).toBe('5');

    // Фокус заперт: Tab с последнего элемента возвращает на первый
    const items = Array.from(dialog.querySelectorAll('button'));
    expect(items.length).toBeGreaterThan(0);
    items[items.length - 1].focus();
    act(() => {
      dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[0]);
  });

  it('empty state renders a floating plate, not the drawer', () => {
    const host = renderNode(
      window.HEYS.dayAdviceListUI.renderEmptyAdviceToast({
        React,
        adviceTrigger: 'manual_empty',
        toastVisible: true,
        dismissToast: () => {},
        medicalDisclaimerSessionDismissed: true,
      })
    );
    expect(host.querySelector('.advice-list-overlay')).toBeNull();
    expect(host.querySelector('.advice-list-container--v4')).toBeNull();
    const plate = host.querySelector('.advice-v4-empty-toast');
    expect(plate).toBeTruthy();
    expect(plate.getAttribute('role')).toBe('status');
    expect(plate.textContent).toContain('Пока всё по плану — советов нет');
  });

  it('detail keeps three tiers and a close button', () => {
    const host = renderNode(
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
        lastDismissedAdvice: null,
        adviceSwipeState: {},
        expandedAdviceId: null,
        trackClick: () => {},
        rateAdvice: () => {},
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
        clearLastDismissed: () => {},
        adviceDetailModalOpen: true,
        adviceDetailModalAdvice: advice,
        openAdviceDetailModal: () => {},
        closeAdviceDetailModal: () => {},
        openAdviceTechnicalDetails: () => {},
        closeAdviceTechnicalDetails: () => {},
        ADVICE_CATEGORY_NAMES: { training: 'Тренировки' },
        ewsWarnings: [],
        AdviceCard: window.HEYS.dayComponents.AdviceCard,
        retryAdviceMarksSync: () => {},
        medicalDisclaimerSessionDismissed: true,
      })
    );
    expect(host.querySelector('.advice-v4-detail__close')).toBeTruthy();
    expect(host.querySelector('.advice-v4-detail__title').textContent)
      .toContain('После тренировки нужен белок');
  });
});

// Строка контракта tips «доступность»: «жесты влево и вправо дублируются
// действиями в детали совета — свайп не единственный способ». Свайп нельзя
// выполнить с клавиатуры и со скринридером, поэтому смоук гоняет оба пути через
// живой хук состояния и сверяет итог, а не разметку: кнопка обязана приводить
// ровно туда же, куда жест, иначе через пару правок пути разъедутся.
describe('tips v4: действия детали дублируют свайпы', () => {
  const swipeAdvice = { ...advice, id: 'sw1' };

  function mountAdviceState() {
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
      });
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(React.createElement(Probe)); });
    return box;
  }

  function touch(x) {
    return { touches: [{ clientX: x, clientY: 0 }], preventDefault() {}, stopPropagation() {} };
  }

  // Жест: старт, протяжка за порог 100 px, отпускание.
  function swipe(api, id, toX) {
    act(() => {
      api().handleAdviceSwipeStart(id, touch(0));
      api().handleAdviceSwipeMove(id, touch(toX));
    });
    act(() => { api().handleAdviceSwipeEnd(id); });
  }

  function snapshot(api) {
    return {
      dismissed: [...api().dismissedAdvices].sort(),
      hidden: [...api().hiddenUntilTomorrow].sort(),
      lastAction: api().lastDismissedAdvice?.action || null,
      lastId: api().lastDismissedAdvice?.id || null,
      readLs: window.localStorage.getItem('heys_advice_read_today'),
      hiddenLs: window.localStorage.getItem('heys_advice_hidden_today'),
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('«Прочитано» из детали даёт то же состояние, что свайп влево', () => {
    const bySwipe = mountAdviceState();
    swipe(() => bySwipe.api, swipeAdvice.id, -140);
    const swipeResult = snapshot(() => bySwipe.api);

    window.localStorage.clear();

    const byButton = mountAdviceState();
    act(() => { byButton.api.markAdviceDetailRead(swipeAdvice); });
    const buttonResult = snapshot(() => byButton.api);

    expect(swipeResult.dismissed).toEqual([swipeAdvice.id]);
    expect(swipeResult.lastAction).toBe('read');
    expect(buttonResult).toEqual(swipeResult);
  });

  it('«Скрыть до завтра» из детали даёт то же состояние, что свайп вправо', () => {
    const bySwipe = mountAdviceState();
    swipe(() => bySwipe.api, swipeAdvice.id, 140);
    const swipeResult = snapshot(() => bySwipe.api);

    window.localStorage.clear();

    const byButton = mountAdviceState();
    act(() => { byButton.api.hideAdviceDetailUntilTomorrow(swipeAdvice); });
    const buttonResult = snapshot(() => byButton.api);

    expect(swipeResult.hidden).toEqual([swipeAdvice.id]);
    expect(swipeResult.dismissed).toEqual([swipeAdvice.id]);
    expect(swipeResult.lastAction).toBe('hidden');
    expect(buttonResult).toEqual(swipeResult);
  });

  // Контракт про закрытие детали молчит, кадр «Совет · деталь» этих кнопок не
  // рисует вовсе. Деталь закрывается, потому что карточка уходит из списка, а
  // отмена (строка «отмена с таймером») живёт панелью в самой шторке — под
  // открытой деталью её не видно и не нажать.
  it('после действия деталь закрывается, отмена остаётся доступной', () => {
    const box = mountAdviceState();
    act(() => { box.api.openAdviceDetailModal(swipeAdvice); });
    expect(box.api.adviceDetailModalOpen).toBe(true);

    act(() => { box.api.markAdviceDetailRead(swipeAdvice); });
    expect(box.api.adviceDetailModalOpen).toBe(false);
    expect(box.api.lastDismissedAdvice?.id).toBe(swipeAdvice.id);
  });

  it('вход в оба действия — кнопки в потоке фокуса, а не div с обработчиком', () => {
    const calls = [];
    const host = renderNode(
      window.HEYS.dayAdviceListUI.renderManualAdviceList(
        detailProps({
          markAdviceDetailRead: (item) => calls.push(['read', item?.id]),
          hideAdviceDetailUntilTomorrow: (item) => calls.push(['hide', item?.id]),
        })
      )
    );

    const detail = host.querySelector('.advice-v4-detail');
    expect(detail.getAttribute('role')).toBe('dialog');
    expect(detail.getAttribute('aria-modal')).toBe('true');
    // Фокус переезжает в деталь, иначе ловушка шторки не выпустит Tab к кнопкам
    expect(document.activeElement).toBe(detail);

    const read = host.querySelector('.advice-v4-detail__action--read');
    const hide = host.querySelector('.advice-v4-detail__action--hide');
    for (const btn of [read, hide]) {
      expect(btn).toBeTruthy();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('type')).toBe('button');
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('tabindex')).toBeNull();
    }
    // Подписи — словами жестов из строки «жесты»: влево прочитано, вправо скрыть
    expect(read.textContent).toContain('Прочитано');
    expect(hide.textContent).toContain('Скрыть до завтра');
    // Иконка внутри кнопки не читается отдельным узлом
    expect(read.querySelector('svg').getAttribute('aria-hidden')).toBe('true');

    // Ловушка фокуса детали не выпускает Tab обратно в шторку
    const items = Array.from(detail.querySelectorAll('button'));
    items[items.length - 1].focus();
    act(() => {
      detail.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[0]);

    act(() => { read.click(); });
    act(() => { hide.click(); });
    expect(calls).toEqual([['read', advice.id], ['hide', advice.id]]);
  });

  // Кнопки детали доходят до состояния только через явную карту пропсов в
  // heys_day_tab_render_v1.js (ctx.adviceState → renderDayPage). Забыть там
  // строку — значит получить кнопки-бутафории, которые в jsdom-тесте выше
  // работают, а в приложении молчат. Поэтому карта проверяется отдельно.
  it('карта пропсов дневника проводит оба действия детали', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_tab_render_v1.js'),
      'utf8',
    );
    expect(src).toContain('markAdviceDetailRead: adviceState.markAdviceDetailRead');
    expect(src).toContain(
      'hideAdviceDetailUntilTomorrow: adviceState.hideAdviceDetailUntilTomorrow',
    );
  });
});
