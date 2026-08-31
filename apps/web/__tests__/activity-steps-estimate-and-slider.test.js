// activity-steps-estimate-and-slider.test.js — карточка шагов в день без факта.
//
// Живой экран 31 августа показал два дефекта разом (скриншот владельца):
//   • «оценка 0 / 6 500» и рядом «165 ккал» — полоса брала day.steps (ноль),
//     а калории считались по подставленной медиане. Числа спорили друг с другом;
//   • «поставьте факт ползунком» — а тянуть нечего: захват висел на
//     .steps-slider-thumb, который прозрачен и при нуле стоит в левом краю.
//
// Оба проверяются источником и предикатами: поднимать весь дневной экран с
// облаком и профилем ради двух чисел дороже, чем прочитать сами переходы.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const read = (name) => fs.readFileSync(path.join(WEB_DIR, name), 'utf8');
const TAB_SRC = read('heys_day_tab_impl_v1.js');
const STEPS_UI_SRC = read('heys_day_steps_ui.js');
const TDEE_SRC = read('heys_tdee_v1.js');

describe('Оценённые шаги показываются тем же числом, которым считали', () => {
  it('TDEE отдаёт наружу подставленное значение, а не только признак', () => {
    // steps: медиана, stepsEstimated: true — оба в результате расчёта.
    expect(TDEE_SRC).toContain('steps: stepsResolved.steps');
    expect(TDEE_SRC).toContain('stepsEstimated: stepsResolved.stepsEstimated');
  });

  it('дневной экран это значение забирает', () => {
    const start = TAB_SRC.indexOf('const {\n            tdeeResult,');
    expect(start).toBeGreaterThan(-1);
    const body = TAB_SRC.slice(start, start + 1200);
    expect(body).toContain('stepsResolved');
  });

  it('карточка получает оценку, когда факта нет, и факт, когда он есть', () => {
    expect(TAB_SRC).toContain(
      'const shownSteps = stepsEstimated ? (Number(stepsResolved) || 0) : stepsValue;',
    );
    expect(TAB_SRC).toContain('stepsValue: shownSteps,');
    expect(TAB_SRC).toContain('stepsPercent: shownStepsPercent,');
  });

  it('процент считается той же формулой, что и при перетаскивании', () => {
    // Пока формул было две, они могли разъехаться молча.
    expect(STEPS_UI_SRC).toContain('const percentOf = (steps)');
    expect(STEPS_UI_SRC).toContain('const stepsPercent = percentOf(stepsValue);');
    expect(STEPS_UI_SRC).not.toContain('const computePercent =');
    expect(STEPS_UI_SRC).toContain("const pct = percentOf(val) + '%';");
  });

  it('подставленное значение фактом не становится — в день пишется только правка', () => {
    // shownSteps идёт в отрисовку; в setDay уезжает то, что человек поставил сам.
    const start = STEPS_UI_SRC.indexOf('const finalSteps = latestStepsRef.current || 0;');
    expect(start).toBeGreaterThan(-1);
    expect(STEPS_UI_SRC.slice(start, start + 400)).toContain('steps: finalSteps');
    expect(TAB_SRC).not.toContain('steps: shownSteps');
  });

  it('пересчёт карточки видит смену показанного числа', () => {
    // Иначе memo удержит старую полосу, когда медиана изменилась.
    expect(TAB_SRC).toMatch(/\[showActivityContent, shownSteps, stepsGoal, shownStepsPercent/);
  });
});

describe('Полосу шагов можно тянуть', () => {
  const ACTIVITY_SRC = read('heys_day_activity_v1.js');

  it('захват стоит на полосе, а не на прозрачной точке', () => {
    const start = ACTIVITY_SRC.indexOf("className: 'steps-slider',");
    expect(start).toBeGreaterThan(-1);
    const body = ACTIVITY_SRC.slice(start, start + 200);
    expect(body).toContain('onMouseDown: handleStepsDrag');
    expect(body).toContain('onTouchStart: handleStepsDrag');
  });

  it('на самой точке обработчика больше нет — иначе он сработает дважды', () => {
    const start = ACTIVITY_SRC.indexOf("className: 'steps-slider-thumb',");
    expect(start).toBeGreaterThan(-1);
    const body = ACTIVITY_SRC.slice(start, start + 240);
    expect(body).not.toContain('handleStepsDrag');
  });

  it('обработчик находит полосу от любого элемента внутри неё', () => {
    // closest от самой .steps-slider возвращает её же — прежний вызов от
    // ползунка тоже продолжает работать.
    expect(STEPS_UI_SRC).toContain("e.currentTarget.closest('.steps-slider')");
  });

  it('первое же нажатие ставит значение, а не ждёт движения', () => {
    const tail = STEPS_UI_SRC.slice(STEPS_UI_SRC.indexOf('document.addEventListener(\'mousemove\', onMove);'));
    expect(tail).toContain('pendingStepsRef.current = computeSteps(clientX);');
    expect(tail).toContain('flushStepsDOM();');
  });
});
