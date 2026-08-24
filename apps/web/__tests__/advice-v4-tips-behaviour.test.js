// Смоук зоны tips: строки контракта «вид карточки совета», «пустое состояние»
// и «доступность» проверяются рендером, а не чтением исходника — стык
// «шторка = диалог с запертым фокусом» иначе не воспроизвести руками.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach, beforeAll, beforeEach } from 'vitest';
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

  // Двенадцатая сборка контракта переписала строку «панель оценки»: свайп влево
  // теперь открывает панель оценки, а не помечает совет прочитанным. Строка
  // «жесты» («влево — прочитано») осталась от прежней редакции и с новой строкой
  // спорит; верна новая, потому что она полная и объясняет себя, а «жесты»
  // только перечисляет. «Прочитано» при этом не пропало — оно живёт кнопкой в
  // детали совета и строкой «Прочитать все», и этот тест держит именно это.
  it('свайп влево открывает панель оценки и совет остаётся в списке', () => {
    const bySwipe = mountAdviceState();
    swipe(() => bySwipe.api, swipeAdvice.id, -140);
    const result = snapshot(() => bySwipe.api);
    const state = bySwipe.api.adviceSwipeState[swipeAdvice.id];

    expect(state).toEqual({ x: -96, direction: 'left', rating: true });
    // Совет остаётся в списке: ни прочитанным, ни скрытым он не стал.
    expect(result.dismissed).toEqual([]);
    expect(result.hidden).toEqual([]);
    expect(result.lastAction).toBe(null);
    expect(result.readLs).toBe(null);
  });

  it('повторный конец жеста закрывает панель оценки, не пряча совет', () => {
    const box = mountAdviceState();
    swipe(() => box.api, swipeAdvice.id, -140);
    act(() => { box.api.handleAdviceSwipeEnd(swipeAdvice.id); });

    expect(box.api.adviceSwipeState[swipeAdvice.id]).toEqual({ x: 0, direction: null });
    expect(snapshot(() => box.api).dismissed).toEqual([]);
  });

  it('«Прочитано» из детали помечает совет прочитанным', () => {
    const byButton = mountAdviceState();
    act(() => { byButton.api.markAdviceDetailRead(swipeAdvice); });
    const buttonResult = snapshot(() => byButton.api);

    expect(buttonResult.dismissed).toEqual([swipeAdvice.id]);
    expect(buttonResult.lastAction).toBe('read');
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

// Строка контракта tips «панель оценки» (двенадцатая сборка): свайп влево сужает
// карточку на 96 px справа — сама она не сдвигается; в освободившемся месте
// панель «Полезно?»; под карточкой ровно две кнопки; после ответа карточка
// возвращается на место, а совет остаётся в списке. Проверяется рендером: у
// строки главное — геометрия и то, что ничего не исчезает, а исходником этого
// не увидеть.
describe('tips v4: панель оценки по свайпу влево', () => {
  const rated = { ...advice, id: 'rate-1' };

  function renderCardWithRating(extra) {
    return renderNode(
      window.HEYS.dayAdviceListUI.renderManualAdviceList(
        detailProps({
          adviceRelevant: [rated],
          badgeAdvices: [rated],
          getSortedGroupedAdvices: () => ({ sorted: [rated], groups: { training: [rated] } }),
          adviceDetailModalOpen: false,
          adviceDetailModalAdvice: null,
          adviceSwipeState: { [rated.id]: { x: -96, direction: 'left', rating: true } },
          ...extra,
        }),
      ),
    );
  }

  it('карточка сужается на 96 px и не сдвигается, панель встаёт справа', () => {
    const host = renderCardWithRating();

    const card = host.querySelector('.advice-list-item-v4');
    expect(card.style.marginRight).toBe('96px');
    // Сдвига нет: полоса состояния и текст остаются на своих местах.
    expect(card.style.transform).toBe('translateX(0px)');

    const panel = host.querySelector('.advice-v4-rate-panel');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toBe('Полезно?');
  });

  it('под карточкой ровно две кнопки и строка-пояснение', () => {
    const host = renderCardWithRating();

    const actions = host.querySelector('.advice-v4-rate-actions');
    const buttons = actions.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Помогло');
    expect(buttons[1].textContent).toBe('Не показывать такие');
    // Ряд кнопок живёт вне рамки карточки — иначе её обрезка съедала бы углы.
    expect(actions.closest('.advice-list-item-frame')).toBeNull();

    expect(host.querySelector('.advice-v4-rate-note').textContent).toBe(
      'Оба ответа меняют, что вы увидите дальше. Совет остаётся в списке.',
    );
  });

  it('без свайпа ни панели, ни кнопок нет', () => {
    const host = renderCardWithRating({ adviceSwipeState: {} });
    expect(host.querySelector('.advice-v4-rate-panel')).toBeNull();
    expect(host.querySelector('.advice-v4-rate-actions')).toBeNull();
    expect(host.querySelector('.advice-list-item-v4').style.marginRight).toBe('0px');
  });

  it('оба ответа пишут оценку и закрывают панель, совет из списка не уходит', () => {
    for (const [index, positive] of [[0, true], [1, false]]) {
      const rates = [];
      const closed = [];
      const host = renderCardWithRating({
        rateAdvice: (item, value) => rates.push([item.id, value]),
        handleAdviceSwipeEnd: (id) => closed.push(id),
      });
      const btn = host.querySelectorAll('.advice-v4-rate-actions button')[index];
      act(() => { btn.click(); });

      expect(rates).toEqual([[rated.id, positive]]);
      expect(closed).toEqual([rated.id]);
      // Карточка на месте: ни «Помогло», ни «Не показывать такие» её не убирают.
      expect(host.querySelector('.advice-list-item-v4')).toBeTruthy();
    }
  });

  // Строка «повторный тап»: защита стоит на оценке совета. Панель уходит не
  // мгновенно (карточка возвращается 180 мс), и второй тап по той же кнопке
  // успевает пройти — окно 350 мс его гасит.
  it('второй тап по кнопке в течение 350 мс второй оценки не создаёт', () => {
    const rates = [];
    const host = renderCardWithRating({
      rateAdvice: (item, value) => rates.push([item.id, value]),
      handleAdviceSwipeEnd: () => {},
    });
    const helped = host.querySelectorAll('.advice-v4-rate-actions button')[0];
    act(() => { helped.click(); });
    act(() => { helped.click(); });
    expect(rates).toEqual([[rated.id, true]]);
  });
});

// Строка контракта tips «не сохранено»: плашка встаёт в шторке над списком, без
// кнопки «Повторить». Поднимает её очередь оценок — список советов локальный
// (строка «офлайн»), «не ушедшей» бывает только оценка.
describe('tips v4: плашка «оценка не ушла»', () => {
  function renderDrawer() {
    return renderNode(
      window.HEYS.dayAdviceListUI.renderManualAdviceList(
        detailProps({ adviceDetailModalOpen: false, adviceDetailModalAdvice: null }),
      ),
    );
  }

  afterEach(() => { delete window.HEYS.cloud; });

  it('очередь с оценкой поднимает плашку над списком и без кнопки', () => {
    window.HEYS.cloud = {
      getPendingItemsDetail: () => ({ queue: [{ k: 'heys_advice_outcomes_v1' }], inflight: [] }),
    };
    const host = renderDrawer();

    const plate = host.querySelector('.advice-v4-panel--sync');
    expect(plate).toBeTruthy();
    expect(plate.getAttribute('role')).toBe('status');
    expect(plate.querySelector('.advice-v4-panel__title').textContent)
      .toBe('Оценка не ушла — нет связи');
    expect(plate.querySelector('.advice-v4-panel__hint--sync').textContent)
      .toBe('Она сохранена на телефоне и отправится сама. Ничего делать не нужно.');
    expect(plate.querySelector('button')).toBeNull();

    // Над списком, а не под ним.
    const list = host.querySelector('.advice-list-items');
    expect(plate.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('очередь без оценок плашку не поднимает', () => {
    window.HEYS.cloud = {
      getPendingItemsDetail: () => ({ queue: [{ k: 'heys_advice_read_today' }], inflight: [] }),
    };
    expect(renderDrawer().querySelector('.advice-v4-panel--sync')).toBeNull();
  });
});
