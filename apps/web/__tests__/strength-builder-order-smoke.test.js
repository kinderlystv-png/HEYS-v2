// strength-builder-order-smoke.test.js — смоук режима порядка (кадр Ж1
// «Порядок · режим перестановки», строки контракта «перестановка — стрелками и
// за ручку» и «связка едет целиком»).
//
// Стережём поведение, а не геометрию (её держит
// strength-builder-order-v4-canvas-contract.test.js): стрелки двигают обычную
// строку; связка едет одним блоком и не рвётся; ручка ⠿ тащит мышью, а
// касание оставляет список прокрутке; «Готово» отдаёт порядок в ту же модель
// тренировки через onPatch, крест ничего не меняет; вход — из шторки ⋯.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadModules() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

/** Состав кадра Ж1: три одиночных и связка A из двух участников. */
function frameExercises() {
  return [
    { name: 'Жим лёжа', restSec: 90, approaches: [work(75, 8, true), work(75, 8, false)] },
    { name: 'Тяга штанги в наклоне', restSec: 90, approaches: [work(60, 8, false)] },
    { name: 'Жим гантелей сидя', restSec: 90, approaches: [work(24, 12, false)] },
    { name: 'Подтягивания', ssGroup: 1, restSec: 90, approaches: [work(0, 10, false), work(0, 10, false), work(0, 10, false)] },
    { name: 'Тяга блока', ssGroup: 1, restSec: 90, approaches: [work(40, 12, false), work(40, 12, false), work(40, 12, false)] }
  ];
}

function names(list) {
  return list.map(function (ex) { return ex.name; });
}

function rowTitles() {
  return Array.from(document.querySelectorAll('.sb-order-row .sb-cat-title b'))
    .map(function (node) { return node.textContent; });
}

/** Ряд строк с настоящей вертикальной геометрией: jsdom сам рисует нули. */
function layoutRows(rowHeight) {
  document.querySelectorAll('[data-order-row]').forEach(function (row, index) {
    row.getBoundingClientRect = function () {
      const top = index * rowHeight;
      return { top: top, bottom: top + rowHeight, height: rowHeight, left: 0, right: 375, width: 375 };
    };
  });
}

/** Настоящий PointerEvent через fireEvent: обновления React уходят внутри act. */
function pointer(target, type, init) {
  fireEvent(target, new window.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true }, init || {})));
}

let HEYS;

beforeEach(() => {
  HEYS = loadModules();
});

afterEach(() => {
  cleanup();
});

describe('режим порядка · стрелки', () => {
  function renderOrder(onApply, onCancel) {
    render(React.createElement(HEYS.StrengthCatalogUI.OrderScreen, {
      exercises: frameExercises(),
      onApply: onApply || vi.fn(),
      onCancel: onCancel || vi.fn()
    }));
  }

  it('обычная строка едет на шаг вверх и вниз, крайние стрелки погашены', () => {
    const onApply = vi.fn();
    renderOrder(onApply);
    expect(rowTitles()).toEqual(['Жим лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Связка A']);
    expect(screen.getAllByLabelText('Выше')[0].disabled).toBe(true);
    expect(screen.getAllByLabelText('Ниже')[3].disabled).toBe(true);

    fireEvent.click(screen.getAllByLabelText('Ниже')[1]);
    expect(rowTitles()).toEqual(['Жим лёжа', 'Жим гантелей сидя', 'Тяга штанги в наклоне', 'Связка A']);

    fireEvent.click(screen.getAllByLabelText('Выше')[2]);
    expect(rowTitles()).toEqual(['Жим лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Связка A']);

    fireEvent.click(screen.getAllByLabelText('Выше')[2]);
    fireEvent.click(screen.getByText('Готово'));
    expect(names(onApply.mock.calls[0][0])).toEqual([
      'Жим лёжа', 'Жим гантелей сидя', 'Тяга штанги в наклоне', 'Подтягивания', 'Тяга блока'
    ]);
  });

  it('связка едет целиком: участники остаются рядом и в своей группе', () => {
    const onApply = vi.fn();
    renderOrder(onApply);
    const group = screen.getByText('Связка A').closest('.sb-order-row');
    expect(group.classList.contains('is-group')).toBe(true);
    expect(within(group).getByText(/Подтягивания ⇄ Тяга блока · 6 подходов/)).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText('Выше')[3]);
    fireEvent.click(screen.getAllByLabelText('Выше')[2]);
    expect(rowTitles()).toEqual(['Жим лёжа', 'Связка A', 'Тяга штанги в наклоне', 'Жим гантелей сидя']);

    fireEvent.click(screen.getByText('Готово'));
    const next = onApply.mock.calls[0][0];
    expect(names(next)).toEqual([
      'Жим лёжа', 'Подтягивания', 'Тяга блока', 'Тяга штанги в наклоне', 'Жим гантелей сидя'
    ]);
    expect(next[1].ssGroup).toBe(1);
    expect(next[2].ssGroup).toBe(1);
    // Данные подходов едут за упражнением, а не переписываются.
    expect(next[2].approaches[0].weightKg).toBe('40');
    expect(next[0].approaches[0].done).toBe(true);
  });

  it('крест закрывает режим без изменения порядка', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    renderOrder(onApply, onCancel);
    fireEvent.click(screen.getAllByLabelText('Ниже')[0]);
    fireEvent.click(screen.getByLabelText('Отменить'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('режим порядка · ручка ⠿', () => {
  function renderOrder(onApply) {
    render(React.createElement(HEYS.StrengthCatalogUI.OrderScreen, {
      exercises: frameExercises(),
      onApply: onApply || vi.fn(),
      onCancel: vi.fn()
    }));
  }

  it('мышью строка тащится за ручку: карточка на переносе, полоса вставки, итог по отпусканию', () => {
    const onApply = vi.fn();
    renderOrder(onApply);
    layoutRows(60);
    const handle = document.querySelectorAll('.sb-order-handle')[0];
    pointer(handle, 'pointerdown', { button: 0, pointerType: 'mouse', clientY: 10 });

    // Пока держим — переносимая карточка стоит на своём месте, номер и ручка — акцентом.
    const preview = document.querySelector('.sb-order-row.is-drop-target');
    expect(preview).toBeTruthy();
    expect(within(preview).getByText('переносится сюда')).toBeTruthy();
    expect(preview.querySelector('.sb-order-handle').classList.contains('is-accent')).toBe(true);
    expect(preview.querySelector('.sb-ex-num').classList.contains('is-accent')).toBe(true);
    expect(document.querySelector('.sb-order-insert')).toBeTruthy();

    // Ведём ниже третьей строки — карточка переезжает между третьей и связкой.
    layoutRows(60);
    pointer(window, 'pointermove', { clientY: 175 });
    expect(rowTitles()).toEqual(['Тяга штанги в наклоне', 'Жим гантелей сидя', 'Жим лёжа', 'Связка A']);

    pointer(window, 'pointerup', {});
    expect(document.querySelector('.sb-order-row.is-drop-target')).toBeNull();
    expect(document.querySelector('.sb-order-insert')).toBeNull();
    expect(rowTitles()).toEqual(['Тяга штанги в наклоне', 'Жим гантелей сидя', 'Жим лёжа', 'Связка A']);

    fireEvent.click(screen.getByText('Готово'));
    expect(names(onApply.mock.calls[0][0])).toEqual([
      'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Жим лёжа', 'Подтягивания', 'Тяга блока'
    ]);
  });

  it('связка тащится одним блоком', () => {
    const onApply = vi.fn();
    renderOrder(onApply);
    layoutRows(60);
    const handle = document.querySelectorAll('.sb-order-handle')[3];
    pointer(handle, 'pointerdown', { button: 0, pointerType: 'mouse', clientY: 190 });
    layoutRows(60);
    pointer(window, 'pointermove', { clientY: 5 });
    pointer(window, 'pointerup', {});
    expect(rowTitles()).toEqual(['Связка A', 'Жим лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя']);
    fireEvent.click(screen.getByText('Готово'));
    expect(names(onApply.mock.calls[0][0])).toEqual([
      'Подтягивания', 'Тяга блока', 'Жим лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя'
    ]);
  });

  it('касание ручки не начинает перенос — пальцу оставлены стрелки', () => {
    renderOrder();
    const handle = document.querySelectorAll('.sb-order-handle')[0];
    pointer(handle, 'pointerdown', { button: 0, pointerType: 'touch', clientY: 10 });
    expect(document.querySelector('.sb-order-row.is-drop-target')).toBeNull();
    expect(document.querySelector('.sb-order-insert')).toBeNull();
    pointer(window, 'pointermove', { clientY: 400 });
    pointer(window, 'pointerup', {});
    expect(rowTitles()).toEqual(['Жим лёжа', 'Тяга штанги в наклоне', 'Жим гантелей сидя', 'Связка A']);
  });
});

describe('режим порядка · вход из шторки и запись в тренировку', () => {
  it('шторка ⋯ → «Порядок упражнений» → стрелка → «Готово» — onPatch получает новый порядок', () => {
    const onPatch = vi.fn();
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: { exercises: frameExercises() } },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: onPatch,
      onPatchSession: () => {},
      onClose: () => {}
    }));
    fireEvent.click(screen.getByLabelText('Ещё'));
    fireEvent.click(screen.getByText('Порядок упражнений'));
    expect(screen.getByText('Тот же список · режим порядка')).toBeTruthy();
    expect(screen.getByText('стрелки для пальца, ⠿ — мышью')).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText('Ниже')[0]);
    fireEvent.click(screen.getByText('Готово'));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(names(onPatch.mock.calls[0][0])).toEqual([
      'Тяга штанги в наклоне', 'Жим лёжа', 'Жим гантелей сидя', 'Подтягивания', 'Тяга блока'
    ]);
    // Список сессии перенумерован по новому порядку: первым стоит бывшая вторая строка.
    expect(screen.queryByText('Тот же список · режим порядка')).toBeNull();
    const firstNum = document.querySelector('.sb-list .sb-ex .sb-ex-num');
    expect(firstNum.textContent).toBe('1');
    expect(firstNum.closest('.sb-ex').textContent).toContain('Тяга штанги в наклоне');
  });

  it('вход «Порядок упражнений» погашен, пока в списке меньше двух строк', () => {
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: { exercises: frameExercises().slice(0, 1) } },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {}
    }));
    fireEvent.click(screen.getByLabelText('Ещё'));
    expect(screen.getByText('Порядок упражнений').closest('button').disabled).toBe(true);
  });
});
