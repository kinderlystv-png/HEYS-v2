'use strict';

/**
 * Карточка клиента и обзор периода.
 *
 * Главное, что здесь проверяется: правка полем не превращается в перезапись
 * блоба. Профиль и нормы — общий документ с приложением, и поле, которого
 * куратор не касался, обязано пережить любую правку из коннектора.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../lib/profile');
const { createTools } = require('../lib/tools');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const SESSION = 'session-token';
const NOW = Date.UTC(2026, 7, 1, 12, 54); // 15:54 по Москве

const PROFILE = {
  firstName: 'Александра',
  gender: 'Женский',
  height: 168,
  weight: 61,
  weightGoal: 57,
  sleepHours: 8,
  stepsGoal: 9000,
  plannedSupplements: ['d3'],
  updatedAt: 1000,
};

const NORMS = { proteinPct: 25, carbsPct: 45, harmPct: 30, updatedAt: 500 };

/** Подставной API с пакетным чтением — тот путь, которым ходит кураторский режим. */
function fakeApi({ kv = {} } = {}) {
  const saves = [];
  const state = { ...kv };
  return {
    saves,
    state,
    async getKV(_session, key) {
      return { data: state[key] === undefined ? null : state[key], error: null };
    },
    async getKVMany(_session, keys) {
      const out = {};
      for (const key of keys) if (state[key] !== undefined) out[key] = state[key];
      return { data: out, error: null };
    },
    async mergeSaveKV(_session, key, value, lastSeenUpdatedAt) {
      saves.push({ key, value, lastSeenUpdatedAt });
      state[key] = value;
      return { ok: true, outcome: 'incoming_wins' };
    },
    async upsertKV() { return { ok: true }; },
    async getSharedProducts() { return { data: [], error: null }; },
  };
}

function build(api) {
  return createTools({ api, sessionToken: SESSION, clientId: CLIENT, nowMs: NOW }).tools;
}

// ── Чистая логика патча ──────────────────────────────────────────────────

test('патч профиля меняет только названные поля и не теряет остальные', () => {
  const { value, changed } = profile.applyProfileFields(PROFILE, { weight_goal: 55 }, NOW);
  assert.equal(value.weightGoal, 55);
  assert.equal(value.height, 168, 'нетронутое поле осталось');
  assert.deepEqual(value.plannedSupplements, ['d3'], 'чужие структуры не выброшены');
  assert.equal(value.updatedAt, NOW, 'свежий updatedAt — иначе серверный merge оставит старое значение');
  assert.equal(changed.length, 1);
});

test('неизвестные поля не попадают в профиль, а возвращаются как проигнорированные', () => {
  const { value, changed, ignored } = profile.applyProfileFields(PROFILE, { favourite_color: 'синий' }, NOW);
  assert.equal(changed.length, 0);
  assert.equal(value, PROFILE, 'без изменений блоб не переписывается вовсе');
  assert.deepEqual(ignored, ['favourite_color']);
});

test('значение вне диапазона отклоняется, а не подрезается молча', () => {
  assert.throws(() => profile.applyProfileFields(PROFILE, { height: 900 }, NOW), /50–300/);
  assert.throws(() => profile.applyProfileFields(PROFILE, { deficit_pct_target: -80 }, NOW), /-50–50/);
  assert.throws(() => profile.applyProfileFields(PROFILE, { gender: 'иное' }, NOW), /Мужской или Женский/);
});

test('повторная запись того же значения изменением не считается', () => {
  const { changed } = profile.applyProfileFields(PROFILE, { height: 168 }, NOW);
  assert.equal(changed.length, 0);
});

test('нормы патчатся по своему whitelist', () => {
  const { value, changed } = profile.applyNormsFields(NORMS, { protein_pct: 30, gi_pct: 40 }, NOW);
  assert.equal(value.proteinPct, 30);
  assert.equal(value.giPct, 40);
  assert.equal(value.carbsPct, 45);
  assert.equal(changed.length, 2);
});

test('зоны правятся по номеру, названия и остальные зоны не трогаются', () => {
  const { value, changed } = profile.applyZonePatches(null, [{ zone: 2, hr_from: 105, hr_to: 125 }]);
  assert.equal(value.length, 4);
  assert.equal(value[1].hrFrom, 105);
  assert.equal(value[1].hrTo, 125);
  assert.equal(value[1].name, profile.DEFAULT_ZONES[1].name);
  assert.equal(value[0].hrFrom, profile.DEFAULT_ZONES[0].hrFrom);
  assert.equal(changed.length, 2);
});

test('перевёрнутый диапазон пульса отклоняется', () => {
  assert.throws(() => profile.applyZonePatches(null, [{ zone: 1, hr_from: 150 }]), /больше верхней/);
  assert.throws(() => profile.applyZonePatches(null, [{ zone: 9, hr_from: 100 }]), /от 1 до 4/);
});

test('возраст считается из даты рождения', () => {
  assert.equal(profile.ageFromBirthDate('1990-08-02', NOW), 35);
  assert.equal(profile.ageFromBirthDate('1990-08-01', NOW), 36);
  assert.equal(profile.ageFromBirthDate('', NOW), null);
});

// ── Инструменты ──────────────────────────────────────────────────────────

test('get_profile отдаёт профиль, нормы и зоны одним чтением', async () => {
  const api = fakeApi({ kv: { heys_profile: { ...PROFILE, birthDate: '1990-01-01' }, heys_norms: NORMS } });
  const res = await build(api).heys_get_profile();
  assert.equal(res.structured.profile.height, 168);
  assert.equal(res.structured.profile.age, 36, 'возраст выводится из даты рождения');
  assert.equal(res.structured.norms.protein_pct, 25);
  assert.equal(res.structured.hr_zones.length, 4, 'без сохранённых зон показываем дефолтные');
  assert.match(res.text, /168 см/);
});

test('update_profile пишет merge-ом с известным updatedAt', async () => {
  const api = fakeApi({ kv: { heys_profile: PROFILE } });
  const res = await build(api).heys_update_profile({ weight_goal: 55, steps_goal: 11000 });
  assert.equal(api.saves.length, 1);
  const save = api.saves[0];
  assert.equal(save.key, 'heys_profile');
  assert.equal(save.lastSeenUpdatedAt, 1000, 'сервер должен видеть, поверх какой версии мы пишем');
  assert.equal(save.value.weightGoal, 55);
  assert.equal(save.value.stepsGoal, 11000);
  assert.equal(save.value.firstName, 'Александра');
  assert.match(res.text, /целевой вес/);
});

test('update_profile без изменений ничего не пишет', async () => {
  const api = fakeApi({ kv: { heys_profile: PROFILE } });
  await assert.rejects(() => build(api).heys_update_profile({ height: 168 }), (e) => {
    assert.equal(e.code, 'nothing_to_update');
    return true;
  });
  assert.equal(api.saves.length, 0);
});

test('update_norms и update_hr_zones пишут в свои ключи', async () => {
  const api = fakeApi({ kv: { heys_norms: NORMS } });
  const tools = build(api);
  await tools.heys_update_norms({ harm_pct: 20 });
  await tools.heys_update_hr_zones({ zones: [{ zone: 4, hr_from: 145 }] });
  assert.deepEqual(api.saves.map((s) => s.key), ['heys_norms', 'heys_hr_zones']);
  assert.equal(api.saves[0].value.harmPct, 20);
  assert.equal(api.saves[1].value[3].hrFrom, 145);
});

// ── Обзор периода ────────────────────────────────────────────────────────

const DAY = (date, extra) => ({ date, meals: [], trainings: [], updatedAt: 1, ...extra });

test('get_period агрегирует дни и называет пустые', async () => {
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-07-30': DAY('2026-07-30', { waterMl: 2000, steps: 8000, weightMorning: 61.2, sleepStart: '23:00', sleepEnd: '07:00' }),
      'heys_dayv2_2026-08-01': DAY('2026-08-01', { waterMl: 1000, steps: 12000, weightMorning: 60.8, trainings: [{ z: [10, 20, 0, 0] }] }),
    },
  });
  const res = await build(api).heys_get_period({ days: 3 });
  const { structured } = res;
  assert.equal(structured.from, '2026-07-30');
  assert.equal(structured.to, '2026-08-01');
  assert.equal(structured.days.length, 3);
  assert.deepEqual(structured.missing_dates, ['2026-07-31']);
  assert.equal(structured.totals.days_with_data, 2);
  assert.equal(structured.totals.avg_steps, 10000);
  assert.equal(structured.totals.avg_water_ml, 1500);
  assert.equal(structured.totals.avg_sleep_hours, 8, 'сон через полночь считается верно');
  assert.equal(structured.totals.training_min, 30);
  assert.equal(structured.totals.weight_first, 61.2);
  assert.equal(structured.totals.weight_last, 60.8);
});

test('get_period не возвращает позиции приёмов — за ними идут в get_day', async () => {
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-08-01': DAY('2026-08-01', {
        meals: [{ id: 'm1', name: 'Обед', time: '13:00', items: [{ id: 'it1', name: 'Овсянка', grams: 100, kcal100: 300, protein100: 12 }] }],
      }),
    },
  });
  const res = await build(api).heys_get_period({ days: 1 });
  const [day] = res.structured.days;
  assert.equal(day.meals, 1, 'приёмы считаются числом');
  assert.equal(day.kcal, 300);
  assert.equal(day.items, undefined);
});

test('слишком длинный период отклоняется, а не режется молча', async () => {
  const api = fakeApi();
  await assert.rejects(() => build(api).heys_get_period({ from: '2026-01-01', to: '2026-08-01' }), (e) => {
    assert.equal(e.code, 'invalid_range');
    return true;
  });
});

test('период читается одним пакетным запросом, а не по дню на вызов', async () => {
  let batches = 0;
  const api = fakeApi();
  const inner = api.getKVMany.bind(api);
  api.getKVMany = async (session, keys) => { batches += 1; return inner(session, keys); };
  await build(api).heys_get_period({ days: 7 });
  assert.equal(batches, 1);
});

// ── Форма ответа пакетного чтения ────────────────────────────────────────
// Ответ SQL-функции приходит в нескольких обёртках. Незнакомая форма обязана
// стать ошибкой: пустая карта здесь читалась бы как «клиент ничего не ведёт».

const heysApi = require('../lib/heys-api');

test('пакетное чтение понимает известные обёртки ответа', () => {
  const rows = [{ k: 'heys_profile', v: { height: 168 } }];
  assert.deepEqual(heysApi.extractBatchItems({ success: true, items: rows }, 'fn'), rows);
  assert.deepEqual(heysApi.extractBatchItems(rows, 'fn'), rows);
  assert.deepEqual(heysApi.extractBatchItems([{ fn: { items: rows } }], 'fn'), rows);
  assert.deepEqual(heysApi.extractBatchItems({ fn: { items: rows } }, 'fn'), rows);
  assert.deepEqual(heysApi.extractBatchItems([], 'fn'), [], 'пустой набор — валидный ответ');
});

test('незнакомая форма ответа отличается от пустого набора', () => {
  assert.equal(heysApi.extractBatchItems({ success: true }, 'fn'), null);
  assert.equal(heysApi.extractBatchItems([{ unexpected: 1 }], 'fn'), null);
  assert.equal(heysApi.extractBatchItems(null, 'fn'), null);
});

test('строки KV сводятся в карту по ключу', () => {
  assert.deepEqual(
    heysApi.rowsToMap([{ k: 'a', v: 1 }, { key: 'b', value: 2 }, null, { v: 3 }]),
    { a: 1, b: 2 },
  );
});

// ── Планирование и тренировочные модули: только чтение ───────────────────

test('планирование считает просроченное и сегодняшнее, ничего не записывая', async () => {
  const api = fakeApi({
    kv: {
      heys_planning_tasks: [
        { id: 't1', title: 'Замерить обхваты', status: 'todo', dueDate: '2026-07-25' },
        { id: 't2', title: 'Прислать фото', status: 'todo', dueDate: '2026-08-01' },
        { id: 't3', title: 'Купить весы', status: 'done', dueDate: '2026-07-01' },
        { id: 't4', title: 'Без срока', status: 'todo' },
      ],
      heys_planning_projects: [{ id: 'p1' }],
      heys_planning_goals_v1: [{ id: 'g1' }, { id: 'g2' }],
    },
  });
  const res = await build(api).heys_get_planning({});

  assert.equal(res.structured.totals.tasks_active, 3);
  assert.equal(res.structured.totals.overdue, 1);
  assert.equal(res.structured.totals.due_today, 1);
  assert.equal(res.structured.overdue[0].title, 'Замерить обхваты');
  assert.equal(res.structured.due_today[0].id, 't2');
  assert.equal(api.saves.length, 0, 'чтение не пишет');
});

test('статус тренировочных модулей собирается из тренировок дня', async () => {
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-07-30': DAY('2026-07-30', {
        trainings: [{ type: 'fingers', fingersLog: { programId: 'maxhangs_7s', holds: [1, 2, 3] } }],
      }),
      'heys_dayv2_2026-08-01': DAY('2026-08-01', {
        trainings: [
          { type: 'mobility', mobilityLog: { partial: true } },
          { type: 'fingers', fingersLog: { programId: 'repeaters' } },
        ],
      }),
    },
  });
  const res = await build(api).heys_get_training_status({ days: 3 });

  assert.equal(res.structured.by_type.fingers.count, 2);
  assert.equal(res.structured.by_type.fingers.last_date, '2026-08-01');
  assert.equal(res.structured.by_type.mobility.count, 1);
  const first = res.structured.sessions.find((s) => s.date === '2026-07-30');
  assert.equal(first.program_id, 'maxhangs_7s');
  assert.equal(first.holds, 3);
  assert.equal(api.saves.length, 0, 'чтение не пишет');
});

test('пустой период тренировок отвечает прямо', async () => {
  const res = await build(fakeApi()).heys_get_training_status({ days: 5 });
  assert.match(res.text, /тренировок не записано/);
  assert.deepEqual(res.structured.by_type, {});
  // Без тренировок модель нагрузки даёт нули, а не молчит.
  assert.equal(res.structured.load.cardio.ctl, 0);
  assert.equal(res.structured.load.strength_tonnage, null);
});

test('тренировка без типа попадает в список, а не выпадает молча', async () => {
  // Живой случай 2026-08-08: heys_log_training до сегодняшнего дня не писал type,
  // поэтому такие тренировки выпадали из sessions — инструмент отвечал
  // «последняя 01.08» рядом с усталостью за более поздние сессии, которые
  // модель нагрузки прекрасно видела. Ответ противоречил сам себе.
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-07-31': DAY('2026-07-31', { trainings: [{ z: [40, 0, 0, 0], time: '12:00' }] }),
    },
  });
  const res = await build(api).heys_get_training_status({ days: 5 });

  assert.equal(res.structured.sessions.length, 1);
  assert.equal(res.structured.sessions[0].type, null);
  assert.equal(res.structured.by_type['без типа'].count, 1);
  assert.equal(res.structured.by_type['без типа'].last_date, '2026-07-31');
  // И она же учтена в нагрузке — два взгляда на одни данные не расходятся.
  assert.ok(res.structured.load.cardio.ctl > 0);
});

test('нагрузка считается по всему 42-дневному окну, а не по периоду отчёта', async () => {
  // Тренировка за 40 дней до конца периода — вне отчётных 3 дней, но внутри
  // окна тренированности. Если окно схлопнется до days, CTL станет нулевым.
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-06-25': DAY('2026-06-25', { trainings: [{ z: [0, 0, 60, 0], time: '10:00' }] }),
    },
  });
  const res = await build(api).heys_get_training_status({ days: 3 });

  assert.equal(res.structured.load.window_days, 42);
  assert.ok(res.structured.load.cardio.ctl > 0, 'тренировка из окна должна попасть в тренированность');
  // Блоб в окне ровно один — уверенность низкая, а не «42 дня истории».
  assert.equal(res.structured.load.cardio.daysOfHistory, 1);
  assert.equal(res.structured.load.cardio.confidence, 'low');
  assert.match(res.text, /тренированность/);
});

test('силовой тоннаж считается отдельным рядом, а не смешивается с кардио', async () => {
  const api = fakeApi({
    kv: {
      'heys_dayv2_2026-07-30': DAY('2026-07-30', {
        trainings: [{
          type: 'strength', strengthEntryMode: 'workout_builder',
          workoutLog: { exercises: [{ approaches: [{ weightKg: '60', reps: 10, done: true }] }] },
        }],
      }),
    },
  });
  const res = await build(api).heys_get_training_status({ days: 3 });

  // Силовая в кардио-ряд не попадает — у неё другие единицы.
  assert.equal(res.structured.load.cardio.ctl, 0);
  assert.ok(res.structured.load.strength_tonnage.ctl > 0);
});
