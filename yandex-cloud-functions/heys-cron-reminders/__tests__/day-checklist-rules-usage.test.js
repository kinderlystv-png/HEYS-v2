const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const {
  lastMealMinutes,
  hasMorningWeight,
  waterDeficitMl,
} = require('../shared/day-checklist-rules');

test('крон берёт правило «чего ещё ждём» из общего ядра', () => {
  assert.match(SOURCE, /require\('\.\/shared\/day-checklist-rules'\)/);
});

test('крон не держит собственную копию правила', () => {
  // Локальные определения означали бы, что напоминания и чек-лист в
  // мессенджере снова считают одно и то же по-разному.
  assert.doesNotMatch(SOURCE, /function lastMealMinutesOfDay\(/);
  assert.doesNotMatch(SOURCE, /Number\(day\.weightMorning\) > 0/);
  assert.doesNotMatch(SOURCE, /20 \* 60 - wakeAvg/);
});

test('предикаты дают то же решение, что старая локальная проверка', () => {
  // Старое условие завтрака: lastMealMinutesOfDay(day) !== null → не слать.
  const ate = { meals: [{ time: '09:15', items: [{ grams: 100 }] }] };
  const emptyMeal = { meals: [{ time: '09:15', items: [] }] };
  assert.equal(lastMealMinutes(ate), 9 * 60 + 15);
  assert.equal(lastMealMinutes(emptyMeal), null);

  // Старое условие чек-ина: day?.weightMorning && Number(...) > 0 → не слать.
  assert.equal(hasMorningWeight({ weightMorning: 81.2 }), true);
  assert.equal(hasMorningWeight({ weightMorning: 0 }), false);
  assert.equal(hasMorningWeight({}), false);

  // Старый расчёт воды: expected = min(norm, norm × часыОтПробуждения / активныеЧасы).
  const wake = 8 * 60;
  const now = 14 * 60;
  const norm = 2000;
  const expected = Math.min(norm, norm * (Math.max(1, (now - wake) / 60) / Math.max(1, (20 * 60 - wake) / 60)));
  assert.equal(waterDeficitMl({ day: { water: 500 }, waterNorm: norm, nowMinutes: now, wakeMinutes: wake }), expected - 500);
});
