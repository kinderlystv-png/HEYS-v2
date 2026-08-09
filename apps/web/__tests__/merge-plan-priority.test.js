// merge-plan-priority.test.js — merge не даёт назначению перезаписать сессию.
//
// Программа куратора, слой 5 (CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md,
// риск 2.5): «Правка куратора во время сессии затрёт зал». Сценарий — клиент
// офлайн стартует назначенный план (локально plan.status → 'started', ещё не
// синхронизировано); в этот момент куратор через MCP видит remote-версию, где
// план ещё 'assigned' (мой guard в setStrengthWorkout это пропускает), и
// перезаписывает workoutLog. Когда клиент выходит в сеть, обычное правило
// merge (свежесть/richness) могло бы выбрать кураторскую версию и стереть уже
// отмеченные подходы. Точечный приоритет по статусу плана это предотвращает,
// не трогая обычные тренировки без программы куратора.

import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mergeModulePath = path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
const { mergeDayData } = require(mergeModulePath);

const makeDay = (updatedAt, trainings = []) => ({
  date: '2026-08-11',
  updatedAt,
  meals: [],
  trainings,
});

const startedTraining = (approachesDone) => ({
  id: 'tr_1',
  type: 'strength',
  strengthEntryMode: 'workout_builder',
  z: [0, 0, 0, 0],
  workoutLog: { exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '75', reps: 8, done: approachesDone }] }] },
  plan: { id: 'pl_1', status: 'started', dayLabel: 'День B', assignedBy: 'Артём' },
  planSnapshot: { exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '75', reps: 8, done: false }] }] },
  updatedAt: 1000,
});

const curatorRewrittenTraining = () => ({
  id: 'tr_1',
  type: 'strength',
  strengthEntryMode: 'workout_builder',
  z: [0, 0, 0, 0],
  workoutLog: {
    exercises: [
      { id: 'ex1', name: 'Присед', approaches: [{ id: 'ap1', weightKg: '100', reps: 5, done: false }] },
      { id: 'ex2', name: 'Тяга', approaches: [{ id: 'ap2', weightKg: '80', reps: 5, done: false }] },
    ],
  },
  plan: { id: 'pl_1', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' },
  source: 'curator_mcp',
  updatedAt: 5000, // «новее» и «богаче» по обычному правилу — 2 упражнения против 1
});

describe('merge: started/done план не проигрывает более свежей/богатой assigned-записи', () => {
  test('локальная started-сессия побеждает даже если remote новее и «богаче»', () => {
    const local = makeDay(1000, [startedTraining(true)]);
    const remote = makeDay(5000, [curatorRewrittenTraining()]);
    const merged = mergeDayData(remote, local);
    expect(merged.trainings[0].plan.status).toBe('started');
    expect(merged.trainings[0].workoutLog.exercises[0].name).toBe('Жим');
    expect(merged.trainings[0].workoutLog.exercises[0].approaches[0].done).toBe(true);
  });

  test('remote новее по времени, но это не единственный критерий — статус решает', () => {
    // Прямая проверка, что дело не в ts: даже когда remote ts заведомо больше,
    // приоритет статуса всё равно должен победить.
    const local = makeDay(1000, [startedTraining(false)]);
    const remote = makeDay(999999, [curatorRewrittenTraining()]);
    const merged = mergeDayData(remote, local);
    expect(merged.trainings[0].plan.status).toBe('started');
  });

  test('done тоже побеждает assigned — тренировка уже закончена клиентом', () => {
    const finished = startedTraining(true);
    finished.plan = { ...finished.plan, status: 'done' };
    const local = makeDay(1000, [finished]);
    const remote = makeDay(5000, [curatorRewrittenTraining()]);
    const merged = mergeDayData(remote, local);
    expect(merged.trainings[0].plan.status).toBe('done');
  });

  test('skipped тоже побеждает assigned — клиент осознанно отказался', () => {
    const skipped = startedTraining(false);
    skipped.plan = { ...skipped.plan, status: 'skipped', skipReason: 'Мало сил' };
    const local = makeDay(1000, [skipped]);
    const remote = makeDay(5000, [curatorRewrittenTraining()]);
    const merged = mergeDayData(remote, local);
    expect(merged.trainings[0].plan.status).toBe('skipped');
  });

  test('обе версии assigned — куратор переназначил план дважды, обычное правило решает', () => {
    const localAssigned = { ...curatorRewrittenTraining(), updatedAt: 1000 };
    const remoteAssigned = { ...curatorRewrittenTraining(), updatedAt: 5000 };
    remoteAssigned.workoutLog = { exercises: [{ id: 'ex3', name: 'Новый план', approaches: [{ id: 'ap3', weightKg: '50', reps: 10, done: false }] }] };
    const local = makeDay(1000, [localAssigned]);
    const remote = makeDay(5000, [remoteAssigned]);
    const merged = mergeDayData(remote, local);
    // Приоритет плана не участвует (оба assigned) — побеждает более свежий remote, как раньше.
    expect(merged.trainings[0].workoutLog.exercises[0].name).toBe('Новый план');
  });

  test('обычная тренировка без plan мержится как раньше — приоритет плана не вмешивается', () => {
    const localPlain = {
      id: 'tr_2', type: 'strength', strengthEntryMode: 'workout_builder', z: [0, 0, 0, 0],
      workoutLog: { exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '60', reps: 8, done: false }] }] },
      updatedAt: 1000,
    };
    const remotePlain = {
      id: 'tr_2', type: 'strength', strengthEntryMode: 'workout_builder', z: [0, 0, 0, 0],
      workoutLog: {
        exercises: [
          { id: 'ex1', name: 'Жим', approaches: [{ id: 'ap1', weightKg: '60', reps: 8, done: true }] },
          { id: 'ex2', name: 'Тяга', approaches: [{ id: 'ap2', weightKg: '50', reps: 10, done: false }] },
        ],
      },
      updatedAt: 5000,
    };
    const local = makeDay(1000, [localPlain]);
    const remote = makeDay(5000, [remotePlain]);
    const merged = mergeDayData(remote, local);
    // Ни одна запись не участвует в программе куратора — свежий remote побеждает, как всегда.
    expect(merged.trainings[0].workoutLog.exercises.length).toBe(2);
  });

  test('план против записи без plan вовсе — план с started побеждает', () => {
    // Гипотетический край: remote потерял plan (старый клиент/баг записи) —
    // приоритет started (1) выше «нет плана» (-1), started не должен проиграть.
    const local = makeDay(1000, [startedTraining(true)]);
    const remotePlanless = {
      id: 'tr_1', type: 'strength', strengthEntryMode: 'workout_builder', z: [0, 0, 0, 0],
      workoutLog: { exercises: [{ id: 'ex1', name: 'Другое', approaches: [{ id: 'ap1', weightKg: '90', reps: 3, done: false }] }] },
      updatedAt: 5000,
    };
    const remote = makeDay(5000, [remotePlanless]);
    const merged = mergeDayData(remote, local);
    expect(merged.trainings[0].plan.status).toBe('started');
  });
});
