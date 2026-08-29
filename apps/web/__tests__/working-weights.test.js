// Растут ли рабочие веса — косвенный довод перестройки.
//
// Метрика намеренно осторожна: контракт называет этот довод косвенным, потому
// что рост весов в первые месяцы во многом нервная адаптация. Ошибиться здесь
// значит не снизить норму человеку, которому её надо снизить, — то есть
// оставить его без результата, объяснив это ростом мышц, которого не было.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_working_weights_v1.js'),
  'utf8'
);

let WW;
beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  WW = window.HEYS.WorkingWeights;
});

const ex = (name, weights) => ({
  name,
  approaches: weights.map((w) => ({ weightKg: String(w), reps: 8 }))
});

const day = (date, exercises) => ({
  date,
  trainings: exercises
    ? [{ type: 'strength', workoutLog: { exercises } }]
    : []
});

// 28 дней: первая половина — «рано», вторая — «поздно».
const window28 = (early, late) => [
  ...Array.from({ length: 14 }, (_, i) => day('2026-08-' + String(i + 1).padStart(2, '0'), i % 3 === 0 ? early : null)),
  ...Array.from({ length: 14 }, (_, i) => day('2026-08-' + String(i + 15).padStart(2, '0'), i % 3 === 0 ? late : null))
];

describe('рабочие веса · чтение подходов', () => {
  it('рабочий вес — вес снаряда, повторы в него не входят', () => {
    expect(WW.maxWeightOfExercise(ex('жим', [60, 65, 62]))).toBe(65);
  });

  it('запятая в весе читается как разделитель, а не ломает число', () => {
    expect(WW.maxWeightOfExercise({ approaches: [{ weightKg: '62,5' }] })).toBe(62.5);
  });

  it('упражнение без подходов берёт вес из самой записи', () => {
    expect(WW.maxWeightOfExercise({ weightKg: '40', sets: 3 })).toBe(40);
  });

  it('вес собственного тела не выдаёт себя за ноль килограммов', () => {
    // Ноль означает «веса нет», и такое упражнение в сравнение не идёт.
    expect(WW.maxWeightOfExercise(ex('подтягивания', [0, 0]))).toBe(0);
  });
});

describe('рабочие веса · растут или нет', () => {
  it('те же упражнения выросли — довод есть', () => {
    const r = WW.analyze({
      days: window28([ex('жим', [60]), ex('тяга', [90])], [ex('жим', [70]), ex('тяга', [95])])
    });
    expect(r.available).toBe(true);
    expect(r.growing).toBe(true);
    expect(r.grew).toBe(2);
  });

  it('одного упражнения мало — довод остаётся косвенным, а не единичным', () => {
    // Рекорд в одном движении может быть чем угодно: удачным днём, разминкой
    // потяжелее, сменой хвата. Довод и так слабый, строить его на одной точке
    // нельзя.
    const r = WW.analyze({ days: window28([ex('жим', [60])], [ex('жим', [70])]) });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('no_shared_exercises');
    expect(WW.MIN_SHARED_EXERCISES).toBe(2);
  });

  it('тоннаж вырос лишним подходом, а вес нет — довода нет', () => {
    // Объём не нагрузка: добавленный подход не говорит о прогрессе.
    const r = WW.analyze({ days: window28([ex('жим', [60, 60])], [ex('жим', [60, 60, 60])]) });
    expect(r.growing).toBe(false);
  });

  it('сменил программу — сравнивать нечего, и это не «не растут»', () => {
    const r = WW.analyze({ days: window28([ex('жим', [60])], [ex('тяга', [90])]) });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('no_shared_exercises');
  });

  it('дрожание вокруг нуля за рост не считается', () => {
    // 60 → 60,5 это меньше процента: шум весов, а не прогресс.
    const r = WW.analyze({
      days: window28([ex('жим', [60]), ex('тяга', [90])], [ex('жим', [60.5]), ex('тяга', [90])])
    });
    expect(r.available).toBe(true);
    expect(r.growing).toBe(false);
  });

  it('одно выросло сильно, а остальные упали — довода нет', () => {
    // Иначе рекорд в одном упражнении оправдывал бы застой во всех.
    const r = WW.analyze({
      days: window28(
        [ex('жим', [60]), ex('тяга', [90]), ex('присед', [100])],
        [ex('жим', [90]), ex('тяга', [80]), ex('присед', [90])]
      )
    });
    expect(r.grew).toBe(1);
    expect(r.fell).toBe(2);
    expect(r.growing).toBe(false);
  });

  it('короткое окно — метрика молчит, а не говорит «не растут»', () => {
    const r = WW.analyze({ days: [day('2026-08-01', [ex('жим', [60])])] });
    expect(r.available).toBe(false);
    expect(r.reason).toBe('short_window');
  });

  it('окно — четыре недели, как называет пилюля довода', () => {
    expect(WW.WINDOW_DAYS).toBe(28);
    const r = WW.analyze({
      days: window28([ex('жим', [60]), ex('тяга', [90])], [ex('жим', [70]), ex('тяга', [95])])
    });
    expect(r.weeks).toBe(4);
  });

  it('не силовые тренировки в счёт не идут', () => {
    const days = window28([ex('жим', [60]), ex('тяга', [90])], [ex('жим', [70]), ex('тяга', [95])]).map((d) => ({
      ...d,
      trainings: (d.trainings || []).map((t) => ({ ...t, type: 'cardio' }))
    }));
    expect(WW.analyze({ days }).available).toBe(false);
  });
});
