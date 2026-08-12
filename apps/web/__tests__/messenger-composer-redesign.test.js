import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/1000-messenger.css'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

function clientMessage(body) {
  return { id: `c-${body}`, sender_role: 'client', body, created_at: new Date().toISOString() };
}

describe('плашка «время и граммы»', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('показывается клиенту и не показывается куратору', () => {
    const { shouldShowFoodHint } = loadMessengerComponentInternals();

    expect(shouldShowFoodHint([], 'client')).toBe(true);
    expect(shouldShowFoodHint([], 'curator')).toBe(false);
  });

  it('«Скрыть» убирает её до конца сессии', () => {
    const { shouldShowFoodHint } = loadMessengerComponentInternals();

    expect(shouldShowFoodHint([], 'client', { dismissedForSession: true })).toBe(false);
  });

  it('исчезает, когда десять сообщений подряд написаны с временем и граммами', () => {
    const { shouldShowFoodHint } = loadMessengerComponentInternals();
    const learned = Array.from({ length: 10 }, (_, i) => clientMessage(`Приём в 1${i % 10}:20, творог 150 г`));

    expect(shouldShowFoodHint(learned, 'client')).toBe(false);
    expect(localStorage.getItem('heys_messenger_food_hint_dismissed')).toBe('1');
  });

  it('девяти сообщений мало, и одно неполное сбрасывает счёт', () => {
    const { shouldShowFoodHint } = loadMessengerComponentInternals();
    const nine = Array.from({ length: 9 }, () => clientMessage('Обед в 13:00, рис 200 г'));
    expect(shouldShowFoodHint(nine, 'client')).toBe(true);

    const withGap = [...nine, clientMessage('Поел салат')];
    expect(shouldShowFoodHint(withGap, 'client')).toBe(true);
  });

  it('возвращается, если куратор снова переспрашивает вес или время', () => {
    const { shouldShowFoodHint } = loadMessengerComponentInternals();
    localStorage.setItem('heys_messenger_food_hint_dismissed', '1');

    const asking = [{
      id: 'k1',
      sender_role: 'curator',
      body: 'А сколько грамм было в порции?',
      created_at: new Date().toISOString(),
    }];
    expect(shouldShowFoodHint(asking, 'client')).toBe(true);
  });

  it('быстрые вставки отдают текущее время и шаблон веса', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 8, 40));
    const { FoodHintCard } = loadMessengerComponentInternals();
    const onInsertTime = vi.fn();
    const onInsertGrams = vi.fn();

    const { getByText } = render(RealReact.createElement(FoodHintCard, {
      onInsertTime,
      onInsertGrams,
      onHide: () => {},
    }));

    fireEvent.click(getByText('Сейчас · 08:40'));
    expect(onInsertTime).toHaveBeenCalledWith('08:40');

    fireEvent.click(getByText('Час назад'));
    expect(onInsertTime).toHaveBeenLastCalledWith('07:40');

    fireEvent.click(getByText('Вес 000 г'));
    expect(onInsertGrams).toHaveBeenCalledTimes(1);
  });

  it('текст начинается с выделенных «Время и вес в граммах»', () => {
    const { FoodHintCard } = loadMessengerComponentInternals();
    const { container } = render(RealReact.createElement(FoodHintCard, {}));

    expect(container.querySelector('.messenger-food-hint__text b').textContent)
      .toBe('Время и вес в граммах');
  });
});

describe('ряд ввода и отправка', () => {
  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('кнопки композера стоят в ряд, а не колонкой', () => {
    const actions = cssSource.match(/\.messenger-input-actions \{[^}]*\}/)[0];
    expect(actions).toMatch(/flex-direction:\s*row/);
  });

  it('поле начинается с одной строки', () => {
    const input = cssSource.match(/\n\.messenger-input \{[^}]*\}/)[0];
    expect(input).toMatch(/min-height:\s*44px/);
    expect(input).not.toMatch(/min-height:\s*100px/);
    expect(messengerSource).toMatch(/rows: 1,/);
  });

  it('на мобильном поле 16px, чтобы iOS не зумил страницу', () => {
    expect(cssSource).toMatch(/@media \(max-width: 767px\) \{\s*\.messenger-input \{\s*font-size:\s*16px/);
  });

  it('кнопка отправки — круг 44 без градиента', () => {
    const send = cssSource.match(/\n\.messenger-send \{[^}]*\}/)[0];
    expect(send).toMatch(/width:\s*44px/);
    expect(send).toMatch(/border-radius:\s*50%/);
    expect(send).toMatch(/background:\s*#1d70b7/);
    expect(send).not.toMatch(/linear-gradient/);
  });

  it('в композере не осталось эмодзи-иконок', () => {
    const composerBlock = messengerSource.slice(messengerSource.indexOf("className: 'messenger-composer'"));
    expect(composerBlock).not.toMatch(/[📷🎙➤]/u);
  });

  it('«своё время» раскрывает степпер с шагом 5 минут', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 13, 5));
    const { FoodHintCard } = loadMessengerComponentInternals();
    const onInsertTime = vi.fn();

    const { container, getByText, getByLabelText } = render(
      RealReact.createElement(FoodHintCard, { onInsertTime }),
    );
    expect(container.querySelector('.messenger-food-hint__stepper')).toBeNull();

    fireEvent.click(getByText('Своё время'));
    const field = getByLabelText('Время приёма');
    expect(field.value).toBe('13:05');

    fireEvent.click(getByLabelText('Раньше на 5 минут'));
    expect(getByLabelText('Время приёма').value).toBe('13:00');

    fireEvent.click(getByText('Готово'));
    expect(onInsertTime).toHaveBeenCalledWith('13:00');
    expect(container.querySelector('.messenger-food-hint__stepper')).toBeNull();

    vi.useRealTimers();
  });

  it('время переходит через полночь в обе стороны', () => {
    const { shiftTimeLabel } = loadMessengerComponentInternals();

    expect(shiftTimeLabel('00:05', -10)).toBe('23:55');
    expect(shiftTimeLabel('23:55', 10)).toBe('00:05');
    expect(shiftTimeLabel('13:05', -60)).toBe('12:05');
  });

  it('FAB — вторичная приподнятая поверхность (--v4-float) со stroke-иконкой', () => {
    const fab = cssSource.match(/\.fab-group \.message-fab \{[^}]*\}/)[0];
    expect(fab).toMatch(/background:\s*var\(--v4-float/);
    expect(fab).not.toMatch(/linear-gradient/);
    expect(messengerSource).toMatch(/className: 'message-fab-icon' \},\s*React\.createElement\(Icon, \{ name: 'chat'/);
  });
});
