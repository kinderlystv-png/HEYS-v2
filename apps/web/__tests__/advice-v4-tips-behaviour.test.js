// Смоук зоны tips: строки контракта «вид карточки совета», «пустое состояние»
// и «доступность» проверяются рендером, а не чтением исходника — стык
// «шторка = диалог с запертым фокусом» иначе не воспроизвести руками.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
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
