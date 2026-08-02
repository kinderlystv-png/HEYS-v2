const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtime = require('../index.js')._test;
const { STATUS_DONE, STATUS_MISSING, STATUS_SKIPPED } = require('../shared/day-checklist-rules');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CURATOR_ID = '33333333-3333-4333-8333-333333333333';

// 2 августа 2026, 15:00 MSK.
const NOW = new Date('2026-08-02T12:00:00Z');
const TODAY = '2026-08-02';

function fakeConn(ownershipRows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: ownershipRows };
    },
  };
}

function itemByKey(body, key) {
  return body.items.find((it) => it.key === key);
}

test('клиент видит только свой день, client_id из запроса игнорируется', async () => {
  const conn = fakeConn([]);
  const scope = await runtime.resolveDayScopeClientId(
    conn,
    { kind: 'client', id: CLIENT_ID },
    { client_id: OTHER_CLIENT_ID },
  );
  assert.deepEqual(scope, { clientId: CLIENT_ID });
  assert.equal(conn.calls.length, 0, 'для клиента лишних запросов быть не должно');
});

test('куратору нужен client_id и владение клиентом', async () => {
  const noId = await runtime.resolveDayScopeClientId(fakeConn([]), { kind: 'curator', id: CURATOR_ID }, {});
  assert.equal(noId.error.statusCode, 400);
  assert.equal(noId.error.body.error, 'client_id_required');

  const foreign = await runtime.resolveDayScopeClientId(
    fakeConn([]),
    { kind: 'curator', id: CURATOR_ID },
    { client_id: OTHER_CLIENT_ID },
  );
  assert.equal(foreign.error.statusCode, 403);
  assert.equal(foreign.error.body.error, 'curator_does_not_own_client');

  const owned = await runtime.resolveDayScopeClientId(
    fakeConn([{ '?column?': 1 }]),
    { kind: 'curator', id: CURATOR_ID },
    { client_id: CLIENT_ID },
  );
  assert.deepEqual(owned, { clientId: CLIENT_ID });
});

test('за один запрос берутся день, нормы, профиль и неделя пробуждений', () => {
  const keys = runtime.dayChecklistKeys(TODAY, NOW);
  assert.ok(keys.includes(`heys_dayv2_${TODAY}`));
  assert.ok(keys.includes('heys_norms'));
  assert.ok(keys.includes('heys_profile'));
  assert.ok(keys.includes('heys_dayv2_2026-07-27'));
  assert.equal(new Set(keys).size, keys.length, 'ключ сегодняшнего дня не должен дублироваться');
});

test('пустой день сегодня: еда и вес ждутся, вода без норм неактуальна', () => {
  const body = runtime.buildDayChecklistResponse({ date: TODAY, today: TODAY, rows: [], now: NOW });
  assert.equal(body.success, true);
  assert.equal(body.date, TODAY);
  assert.equal(itemByKey(body, 'meal').status, STATUS_MISSING);
  assert.equal(itemByKey(body, 'weight').status, STATUS_MISSING);
  assert.equal(itemByKey(body, 'water').status, STATUS_SKIPPED);
  assert.equal(body.completeness, 0);
});

test('заполненный день закрывает пункты и поднимает completeness', () => {
  const rows = [
    {
      k: `heys_dayv2_${TODAY}`,
      v: { meals: [{ time: '09:10', items: [{ grams: 120 }] }], weightMorning: 81.4, water: 1500 },
    },
    { k: 'heys_norms', v: { water: 2000 } },
    { k: 'heys_profile', v: { dailyKcal: 2100 } },
  ];
  const body = runtime.buildDayChecklistResponse({ date: TODAY, today: TODAY, rows, now: NOW });
  assert.equal(itemByKey(body, 'meal').status, STATUS_DONE);
  assert.equal(itemByKey(body, 'meal').done_at_local, '09:10');
  assert.equal(itemByKey(body, 'weight').status, STATUS_DONE);
  assert.equal(itemByKey(body, 'water').status, STATUS_DONE);
  assert.equal(body.completeness, 1);
});

test('без нормы калорий воды не ждём — как и напоминание', () => {
  // getNorms в кроне возвращает null, когда абсолютной нормы kcal нет,
  // и водный сценарий пропускается. Чек-лист обязан молчать так же.
  const rows = [{ k: 'heys_norms', v: { water: 2000 } }, { k: 'heys_profile', v: {} }];
  const body = runtime.buildDayChecklistResponse({ date: TODAY, today: TODAY, rows, now: NOW });
  assert.equal(itemByKey(body, 'water').status, STATUS_SKIPPED);
});

test('у прошедшего дня все сроки уже наступили', () => {
  const past = '2026-08-01';
  const body = runtime.buildDayChecklistResponse({ date: past, today: TODAY, rows: [], now: NOW });
  assert.equal(body.date, past);
  assert.equal(itemByKey(body, 'meal').status, STATUS_MISSING);
  assert.equal(itemByKey(body, 'weight').status, STATUS_MISSING);
});

test('раннее утро сегодня не помечает день проваленным', () => {
  const earlyMorning = new Date('2026-08-02T04:10:00Z'); // 07:10 MSK
  const body = runtime.buildDayChecklistResponse({ date: TODAY, today: TODAY, rows: [], now: earlyMorning });
  assert.equal(itemByKey(body, 'meal').status, STATUS_SKIPPED);
  assert.equal(itemByKey(body, 'weight').status, STATUS_SKIPPED);
  assert.equal(body.completeness, null);
});

test('среднее пробуждение сдвигает срок веса', () => {
  const wakeRows = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(NOW.getTime() - i * 24 * 3600 * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    wakeRows.push({ k: `heys_dayv2_${iso}`, v: { sleepEnd: '06:00' } });
  }
  const body = runtime.buildDayChecklistResponse({ date: TODAY, today: TODAY, rows: wakeRows, now: NOW });
  assert.equal(itemByKey(body, 'weight').due_from, '07:00');
});

test('роутер знает действие day-checklist', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(source, /case 'day-checklist':/);
  assert.match(source, /handleDayChecklist\(identity, query\)/);
});

test('правило чек-листа не продублировано в функции', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(source, /require\('\.\/shared\/day-checklist-rules'\)/);
  assert.doesNotMatch(source, /weightMorning/, 'предикаты дня живут только в общем ядре');
});

test('копия правила совпадает с общим модулем', () => {
  const mirror = fs.readFileSync(path.join(__dirname, '..', 'shared', 'day-checklist-rules.js'), 'utf8');
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'shared', 'day-checklist-rules.js'),
    'utf8',
  );
  assert.equal(mirror, source, 'зеркало устарело — пересинхронизируйте shared/day-checklist-rules.js');
});

test('состав разбора проверяется перед записью', () => {
  const { validateAppliedSummary } = runtime;

  assert.deepEqual(validateAppliedSummary(null), { ok: true, value: null });
  assert.equal(validateAppliedSummary('строка').ok, false);
  assert.equal(validateAppliedSummary({ items: 'нет' }).ok, false);
  assert.equal(validateAppliedSummary({ items: [{ name: 1 }] }).ok, false);
  assert.equal(validateAppliedSummary({ items: [{ name: 'Овсянка', grams: 'много' }] }).ok, false);
  assert.equal(validateAppliedSummary({ items: Array.from({ length: 41 }, () => ({ name: 'x' })) }).ok, false);

  const good = { items: [{ name: 'Овсянка', grams: 60, kcal: 220 }], total: { kcal: 220 } };
  assert.deepEqual(validateAppliedSummary(good), { ok: true, value: good });
});

test('отметить внесённым может только куратор и только со ссылкой на сообщение', async () => {
  const asClient = await runtime.handleSetApplied({ kind: 'client', id: CLIENT_ID }, { message_id: 'm1' });
  assert.equal(asClient.statusCode, 403);
  assert.equal(asClient.body.error, 'curator_only');

  const noId = await runtime.handleSetApplied({ kind: 'curator', id: CURATOR_ID }, {});
  assert.equal(noId.statusCode, 400);
  assert.equal(noId.body.error, 'message_id_required');

  const badSummary = await runtime.handleSetApplied(
    { kind: 'curator', id: CURATOR_ID },
    { message_id: 'm1', summary: { items: [{ name: 'x', kcal: 'нет' }] } },
  );
  assert.equal(badSummary.statusCode, 400);
  assert.equal(badSummary.body.error, 'invalid_applied_summary');
});

test('роутер знает действие set-applied', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(source, /case 'set-applied':/);
  assert.match(source, /handleSetApplied\(identity, body\)/);
});

test('миграция добавляет поля и ослабляет CHECK на applied_at', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'scripts', 'db', 'migrations', '2026-08-02_messenger_applied_summary.sql'),
    'utf8',
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS applied_summary JSONB/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ/);
  // Старый CHECK требовал intent_type — текстовое сообщение внести было нельзя.
  assert.match(migration, /CHECK \(applied_at IS NULL OR sender_role = 'client'\)/);
  assert.match(migration, /apply_message_as_curator/);
  assert.doesNotMatch(migration.split('===== ROLLBACK =====')[0], /^BEGIN;/m);
});
