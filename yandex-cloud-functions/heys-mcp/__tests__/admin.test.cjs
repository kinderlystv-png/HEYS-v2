'use strict';

/**
 * Административный контур куратора: клиенты, PIN, подписки, триал, лиды,
 * модерация общей базы.
 *
 * Здесь проверяется не «дошёл ли вызов», а границы: необратимое требует
 * подтверждения, отказ требует причины, PIN совпадает со схемой приложения, а
 * ответ с секретом честно помечен.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('../lib/admin');
const { createCuratorContext } = require('../lib/curator');

const JWT = 'curator-jwt-token';
const CURATOR_ID = 'cur-1';
const NOW = Date.UTC(2026, 7, 2, 9, 0);

const CLIENTS = [
  { client_id: 'cid-anton', name: 'Антон', status: 'active' },
  { client_id: 'cid-alexandra', name: 'Александра', status: 'trial' },
];

function fakeApi(overrides = {}) {
  const calls = [];
  const base = {
    calls,
    stats: { calls: 0, ms: 0 },
    async listClients() { return { data: CLIENTS, error: null }; },
    async getKVByCurator() { return { data: null, error: null }; },
    async getKVManyByCurator() { return { data: {}, error: null }; },
    async issueWriteContext() { return 'ctx'; },
    async mergeSaveKVByCurator() { return { ok: true }; },
    async upsertKVByCurator() { return { ok: true }; },
    async getSharedProducts() { return { data: [], error: null }; },
    async createClientWithPin(bearer, payload) {
      calls.push({ fn: 'createClientWithPin', bearer, payload });
      return { ok: true, data: { client_id: 'cid-new' } };
    },
    async setClientPin(bearer, clientId, pin) {
      calls.push({ fn: 'setClientPin', clientId, pin });
      return { ok: true, data: { success: true } };
    },
    async getClientAccessLink(bearer, clientId) {
      calls.push({ fn: 'getClientAccessLink', clientId });
      return { ok: true, data: { link: 'https://t.me/heys_bot?start=abc123' } };
    },
    async extendSubscription(bearer, curatorId, clientId, months) {
      calls.push({ fn: 'extendSubscription', curatorId, clientId, months });
      return { ok: true, data: { new_status: 'active', new_end_date: '2026-11-02' } };
    },
    async cancelSubscription(bearer, curatorId, clientId) {
      calls.push({ fn: 'cancelSubscription', curatorId, clientId });
      return { ok: true, data: { success: true } };
    },
    async getTrialQueue() { return { ok: true, data: { items: [{ id: 'q1', name: 'Пётр', status: 'waiting' }] } }; },
    async getQueueStats() { return { ok: true, data: { waiting: 1 } }; },
    async activateTrial(bearer, clientId, startDate) {
      calls.push({ fn: 'activateTrial', clientId, startDate });
      return { ok: true, data: { trial_ends_at: '2026-08-16' } };
    },
    async rejectTrialRequest(bearer, queueId, reason) {
      calls.push({ fn: 'rejectTrialRequest', queueId, reason });
      return { ok: true, data: { success: true } };
    },
    async getLeads(bearer, status) {
      calls.push({ fn: 'getLeads', status });
      return { ok: true, data: [{ id: 'l1', name: 'Ольга', status: 'new' }] };
    },
    async updateLeadStatus(bearer, leadId, status, reason) {
      calls.push({ fn: 'updateLeadStatus', leadId, status, reason });
      return { ok: true, data: { success: true } };
    },
    async getClientObservability(bearer, clientId, opts) {
      calls.push({ fn: 'getClientObservability', clientId, opts });
      return { ok: true, data: { sessions: [{ id: 's1' }], logins: [{ type: 'pin_success' }, { type: 'pin_failed' }] } };
    },
    async getPendingSharedProducts(bearer, curatorId) {
      calls.push({ fn: 'getPendingSharedProducts', curatorId });
      return { data: [{ id: 'p1', client_id: 'cid-anton', product_data: { name: 'Протеин', brand: 'X' }, created_at: '2026-08-01' }], error: null };
    },
    async moderatePendingProduct(bearer, pendingId, action, reason) {
      calls.push({ fn: 'moderatePendingProduct', pendingId, action, reason });
      return { ok: true, data: { success: true } };
    },
  };
  return Object.assign(base, overrides);
}

function build(api) {
  return createCuratorContext({ api, curatorJwt: JWT, curatorId: CURATOR_ID, curatorName: 'Кин', nowMs: NOW });
}

// ── PIN и телефон: схема совпадает с приложением ─────────────────────────

test('хеш PIN совпадает со схемой приложения sha256(pin:salt)', () => {
  const expected = crypto.createHash('sha256').update('4917:abc', 'utf8').digest('hex');
  assert.equal(admin.hashPin('4917', 'abc'), expected);
  assert.equal(admin.generateSalt().length, 32);
});

test('слабые и кривые PIN отклоняются, сгенерированный проходит правила', () => {
  assert.equal(admin.validatePinStrict('1234'), false);
  assert.equal(admin.validatePinStrict('0000'), false);
  assert.equal(admin.validatePinStrict('12a4'), false);
  assert.equal(admin.validatePinStrict('491'), false);
  assert.equal(admin.validatePinStrict('4917'), true);
  for (let i = 0; i < 50; i += 1) assert.equal(admin.validatePinStrict(admin.generatePin()), true);
});

test('телефон нормализуется по правилам приложения', () => {
  assert.equal(admin.normalizePhone('8 (999) 123-45-67'), '79991234567');
  assert.equal(admin.normalizePhone('+7 999 123 45 67'), '79991234567');
  assert.equal(admin.normalizePhone('9991234567'), '79991234567');
  assert.equal(admin.isValidPhone('123'), false);
  assert.equal(admin.formatPhone('89991234567'), '+7 (999) 123-45-67');
});

// ── Создание клиента ─────────────────────────────────────────────────────

test('создание клиента требует подтверждения и валидного телефона', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_create_client({ name: 'Пётр', phone: '123' }), (e) => e.code === 'invalid_phone');
  await assert.rejects(() => tools.heys_create_client({ name: 'Пётр', phone: '89991234567' }), (e) => {
    assert.equal(e.code, 'confirm_required');
    return true;
  });
  assert.equal(api.calls.length, 0, 'без подтверждения запрос не уходит');
});

test('созданный клиент получает PIN, помеченный как секрет', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  const res = await tools.heys_create_client({ name: 'Пётр', phone: '89991234567', confirm: true });

  const call = api.calls.find((c) => c.fn === 'createClientWithPin');
  assert.equal(call.payload.phone, '79991234567');
  assert.equal(call.payload.pinHash, admin.hashPin(res.structured.pin, call.payload.pinSalt));
  assert.equal(res.structured.contains_secret, true);
  assert.match(res.text, /остал[аось]+сь в истории этого чата/);
});

// ── Доступ клиента ───────────────────────────────────────────────────────

test('смена PIN требует подтверждения и адресуется выбранному клиенту', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  await assert.rejects(
    () => tools.heys_client_access({ client: 'Александра', action: 'reset_pin' }),
    (e) => e.code === 'confirm_required',
  );
  const res = await tools.heys_client_access({ client: 'Александра', action: 'reset_pin', confirm: true });
  const call = api.calls.find((c) => c.fn === 'setClientPin');
  assert.equal(call.clientId, 'cid-alexandra');
  assert.equal(admin.validatePinStrict(res.structured.pin), true);
  assert.equal(res.structured.contains_secret, true);
});

test('ссылка доступа отдаётся с пометкой секрета', async () => {
  const { tools } = build(fakeApi());
  const res = await tools.heys_client_access({ client: 'Антон' });
  assert.match(res.structured.link, /t\.me/);
  assert.equal(res.structured.contains_secret, true);
});

// ── Подписка ─────────────────────────────────────────────────────────────

test('продление проверяет месяцы и уходит адресно', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_manage_subscription({ client: 'Антон', action: 'extend', months: 0 }), (e) => e.code === 'invalid_months');
  const res = await tools.heys_manage_subscription({ client: 'Антон', action: 'extend', months: 3 });
  const call = api.calls.find((c) => c.fn === 'extendSubscription');
  assert.equal(call.clientId, 'cid-anton');
  assert.equal(call.curatorId, CURATOR_ID);
  assert.equal(call.months, 3);
  assert.match(res.text, /2026-11-02/);
});

test('сброс подписки требует подтверждения', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_manage_subscription({ client: 'Антон', action: 'cancel' }), (e) => e.code === 'confirm_required');
  assert.equal(api.calls.filter((c) => c.fn === 'cancelSubscription').length, 0);
  await tools.heys_manage_subscription({ client: 'Антон', action: 'cancel', confirm: true });
  assert.equal(api.calls.filter((c) => c.fn === 'cancelSubscription').length, 1);
});

// ── Триал и лиды ─────────────────────────────────────────────────────────

test('очередь триала показывает список и статистику одним вызовом', async () => {
  const { tools } = build(fakeApi());
  const res = await tools.heys_trial_queue({});
  assert.equal(res.structured.queue.length, 1);
  assert.deepEqual(res.structured.stats, { waiting: 1 });
});

test('отказ по заявке невозможен без причины', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_trial_queue({ action: 'reject', queue_id: 'q1' }), (e) => e.code === 'reason_required');
  await tools.heys_trial_queue({ action: 'reject', queue_id: 'q1', reason: 'нет свободных мест' });
  assert.equal(api.calls.find((c) => c.fn === 'rejectTrialRequest').reason, 'нет свободных мест');
});

test('активация триала адресуется клиенту куратора', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  const res = await tools.heys_trial_queue({ action: 'activate', client: 'Александра' });
  assert.equal(api.calls.find((c) => c.fn === 'activateTrial').clientId, 'cid-alexandra');
  assert.match(res.text, /2026-08-16/);
});

test('лиды читаются и меняют статус', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  const list = await tools.heys_leads({ status: 'new' });
  assert.equal(list.structured.leads.length, 1);
  await tools.heys_leads({ action: 'update', lead_id: 'l1', status: 'rejected', reason: 'дубль' });
  const call = api.calls.find((c) => c.fn === 'updateLeadStatus');
  assert.equal(call.leadId, 'l1');
  assert.equal(call.status, 'rejected');
});

// ── Модерация общей базы ─────────────────────────────────────────────────

test('без pending_id инструмент показывает очередь, с ним — модерирует', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  const list = await tools.heys_moderate_products({});
  assert.equal(list.structured.pending[0].name, 'Протеин');
  assert.equal(api.calls.find((c) => c.fn === 'getPendingSharedProducts').curatorId, CURATOR_ID);

  await tools.heys_moderate_products({ pending_id: 'p1', action: 'approve' });
  assert.equal(api.calls.find((c) => c.fn === 'moderatePendingProduct').action, 'approve');
});

test('отклонение продукта требует причины, гонка не выглядит поломкой', async () => {
  const api = fakeApi({
    async moderatePendingProduct() { return { ok: false, race: true, error: 'already_moderated' }; },
  });
  const { tools } = build(api);
  await assert.rejects(() => tools.heys_moderate_products({ pending_id: 'p1', action: 'reject' }), (e) => e.code === 'reason_required');
  await assert.rejects(
    () => tools.heys_moderate_products({ pending_id: 'p1', action: 'approve' }),
    (e) => {
      assert.equal(e.code, 'already_moderated');
      return true;
    },
  );
});

// ── Диагностика ──────────────────────────────────────────────────────────

test('диагностика считает неудачные входы и ограничивает окно', async () => {
  const api = fakeApi();
  const { tools } = build(api);
  const res = await tools.heys_get_client_health({ client: 'Антон', hours: 100000 });
  assert.equal(res.structured.failed_logins, 1);
  const call = api.calls.find((c) => c.fn === 'getClientObservability');
  assert.equal(call.clientId, 'cid-anton');
  assert.equal(call.opts.since, new Date(NOW - 720 * 3600000).toISOString(), 'окно подрезано до 30 суток');
});
