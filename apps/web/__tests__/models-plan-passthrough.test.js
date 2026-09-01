// models-plan-passthrough.test.js — ensureDay не стирает поля программы куратора.
//
// heys_models_v1.js собирает тренировку перечислением полей (та же ловушка,
// что раньше была с _curatorEdits — см. комментарий в исходнике). MCP пишет
// `plan`/`planSnapshot` в облако (Слой 2 CURATOR_TRAINING_PROGRAM_PROTOCOL),
// но клиент открывает день именно через ensureDay: без явного passthrough оба
// поля молча исчезали бы на первой же загрузке, и вся серверная часть плана
// была бы бесполезна.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

let models;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_models_v1.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
  models = global.HEYS.models;
});

function planTraining(overrides) {
  return Object.assign({
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    z: [0, 0, 0, 0],
    workoutLog: { version: 1, exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '75', reps: 8, done: false }] }] },
    plan: { id: 'pl_1', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём', assignedAt: 1000 },
    planSnapshot: { exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '75', reps: 8, done: false }] }] },
  }, overrides);
}

describe('ensureDay: plan и planSnapshot переживают нормализацию', () => {
  it('assigned план сохраняет оба поля', () => {
    const day = models.ensureDay({ trainings: [planTraining()] }, {});
    const t = day.trainings[0];
    expect(t.plan).toBeTruthy();
    expect(t.plan.status).toBe('assigned');
    expect(t.plan.dayLabel).toBe('День B');
    expect(t.plan.assignedBy).toBe('Артём');
    expect(t.planSnapshot.exercises[0].name).toBe('Жим');
  });

  it('assigned план с пустым live workout сохраняется по непустому snapshot текущей ревизии', () => {
    const day = models.ensureDay({
      trainings: [planTraining({ workoutLog: { version: 1, exercises: [] } })],
    }, {});
    expect(day.trainings).toHaveLength(1);
    expect(day.trainings[0].workoutLog.exercises).toEqual([]);
    expect(day.trainings[0].plan.status).toBe('assigned');
    expect(day.trainings[0].planSnapshot.exercises[0].name).toBe('Жим');
  });

  it.each(['started', 'skipped', 'moved'])('%s план с пустым live workout не исчезает при ensureDay', (status) => {
    const day = models.ensureDay({
      trainings: [planTraining({
        workoutLog: { version: 1, zoneMinutes: [0, 0, 0, 0], exercises: [] },
        plan: { id: 'pl_1', status, assignedBy: 'Артём', assignedAt: 1000 },
      })],
    }, {});
    expect(day.trainings).toHaveLength(1);
    expect(day.trainings[0].plan.status).toBe(status);
    expect(day.trainings[0].workoutLog.exercises).toEqual([]);
  });

  it('assigned пустышка без состава в snapshot не становится валидной тренировкой', () => {
    const day = models.ensureDay({
      trainings: [planTraining({
        workoutLog: { version: 1, exercises: [] },
        planSnapshot: { exercises: [] },
      })],
    }, {});
    expect(day.trainings).toEqual([]);
  });

  it('planSnapshot — независимая копия, а не ссылка на живой workoutLog', () => {
    const day = models.ensureDay({ trainings: [planTraining()] }, {});
    const t = day.trainings[0];
    t.workoutLog.exercises[0].approaches[0].done = true;
    expect(t.planSnapshot.exercises[0].approaches[0].done).toBe(false);
  });

  it('обычная тренировка без plan не получает поле из воздуха', () => {
    const day = models.ensureDay({
      trainings: [{ type: 'strength', strengthEntryMode: 'workout_builder', z: [0, 0, 0, 0], workoutLog: planTraining().workoutLog }],
    }, {});
    expect('plan' in day.trainings[0]).toBe(false);
    expect('planSnapshot' in day.trainings[0]).toBe(false);
  });

  it('запись факта поверх плана (status done) тоже переживает нормализацию', () => {
    const day = models.ensureDay({
      trainings: [planTraining({ plan: { id: 'pl_1', status: 'done', dayLabel: 'День B', assignedBy: 'Артём', assignedAt: 1000 } })],
    }, {});
    expect(day.trainings[0].plan.status).toBe('done');
    // Снимок остаётся — иначе отчёту «план против факта» нечего сравнивать.
    expect(day.trainings[0].planSnapshot).toBeTruthy();
  });

  it('второй проход ensureDay не теряет план повторно', () => {
    const once = models.ensureDay({ trainings: [planTraining()] }, {});
    const twice = models.ensureDay(once, {});
    expect(twice.trainings[0].plan.status).toBe('assigned');
    expect(twice.trainings[0].planSnapshot).toBeTruthy();
  });
});

describe('ensureDay: skipReason/skippedAt тоже переживают нормализацию', () => {
  it('пропуск с причиной сохраняется целиком через object spread', () => {
    const day = models.ensureDay({
      trainings: [planTraining({
        plan: { id: 'pl_1', status: 'skipped', dayLabel: 'День B', assignedBy: 'Артём', assignedAt: 1000, skipReason: 'Мало сил', skippedAt: 2000 },
      })],
    }, {});
    const plan = day.trainings[0].plan;
    expect(plan.status).toBe('skipped');
    expect(plan.skipReason).toBe('Мало сил');
    expect(plan.skippedAt).toBe(2000);
  });
});
