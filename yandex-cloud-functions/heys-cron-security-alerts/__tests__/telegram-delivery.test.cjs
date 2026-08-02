'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  API_FUNCTIONS,
  MEMORY_WARN_THRESHOLD_RATIO,
  buildAlertPayload,
  checkConcurrencyIssues,
  concurrencyWatchBlindResult,
  crossClientRule,
  evaluateMonitorResults,
  histogramPeak,
  meanMemoryPeak,
  sendTelegram,
  syncTelegramDeliveryIncident,
} = require('../index.js').__test;

const MB = 1024 * 1024;
const liveMetrics = require('./fixtures/monitoring-used-memory.json');

function loadFixture() {
  return JSON.parse(JSON.stringify(liveMetrics));
}

test('logged_only is unhealthy and blocks worker heartbeat', () => {
  const state = evaluateMonitorResults([
    { rule: 'cross_client_write_blocked', status: 'logged_only' },
    { rule: 'backup_chain_gap', status: 'clean' },
  ]);

  assert.equal(state.healthy, false);
  assert.deepEqual(state.errors.map((item) => item.status), ['logged_only']);
});

test('successful rule results remain healthy', () => {
  assert.equal(evaluateMonitorResults([{ rule: 'backup_chain_gap', status: 'clean' }]).healthy, true);
});

test('cross-client payload advances only through the highest persisted audit id', () => {
  const payload = buildAlertPayload(
    [{ audit_id: '41' }, { audit_id: '44' }, { audit_id: '43' }],
    'telegram-503',
  );

  assert.equal(payload.max_audit_id, 44);
  assert.equal(payload.telegram_reason, 'telegram-503');
});

test('cross-client rule retries after failed delivery and dedupes after success', () => {
  assert.equal(crossClientRule.cooldownMinutes, 0);
  assert.match(crossClientRule.sql, /\$1::text AS _window_unused/);
  assert.match(crossClientRule.sql, /telegram_sent_at IS NOT NULL/);
  assert.match(crossClientRule.sql, /audit\.id > delivered\.max_audit_id/);
  assert.match(crossClientRule.sql, /cross_client_dayv2_content_dup/);
});

test('logged_only records an operational incident', async () => {
  const calls = [];
  const client = { query: async (...args) => calls.push(args) };
  await syncTelegramDeliveryIncident(client, [
    { rule: 'cross_client_write_blocked', status: 'logged_only' },
  ]);

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /record_ops_incident/);
  assert.match(calls[0][1][0], /cross_client_write_blocked/);
});

test('Markdown rejection retries once as plain text', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChat = process.env.TELEGRAM_CHAT_ID;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Bad Request: parse error' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 91 } }),
    };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';

  try {
    const result = await sendTelegram(
      { label: 'Alert', description: 'Description', key: 'test-rule' },
      [{ id: 1 }],
    );
    assert.equal(calls, 2);
    assert.deepEqual(result, { sent: true, messageId: '91', reason: null });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChat;
  }
});

// ── concurrency_watch: слепота ≠ «чисто» (2026-08-03) ────────────────────
// Регресс, который эти тесты держат: при потере доступа к метрикам правило
// рапортовало `clean`, функция отдавала 200 и штамповала heartbeat.

test('lost IAM token marks every function unreadable instead of clean', async () => {
  const watch = await checkConcurrencyIssues({
    getToken: async () => { throw new Error('permission denied'); },
    readMemory: async () => { throw new Error('must not be called'); },
  });

  assert.deepEqual(watch.issues, []);
  assert.deepEqual(watch.unreadable, API_FUNCTIONS.map((fn) => fn.name));
  assert.match(watch.error, /IAM token unavailable/);

  const blind = concurrencyWatchBlindResult(watch);
  assert.equal(blind.status, 'check_error');
  assert.equal(evaluateMonitorResults([blind]).healthy, false);
});

test('metric read failure for a single function is reported, not swallowed', async () => {
  const blocked = API_FUNCTIONS[1].name;
  const watch = await checkConcurrencyIssues({
    getToken: async () => 'iam-token',
    readMemory: async (name) => {
      if (name === blocked) throw new Error('HTTP 403: permission denied');
      return { peakBytes: 1024 * 1024, points: 3 };
    },
  });

  assert.deepEqual(watch.issues, []);
  assert.deepEqual(watch.unreadable, [blocked]);

  const blind = concurrencyWatchBlindResult(watch);
  assert.ok(blind, 'partial blindness must produce a check_error result');
  assert.match(blind.error, new RegExp(blocked));
  assert.match(blind.error, /403/);
  assert.equal(evaluateMonitorResults([blind]).healthy, false);
});

test('fully readable metrics still produce a clean, healthy result', async () => {
  const watch = await checkConcurrencyIssues({
    getToken: async () => 'iam-token',
    readMemory: async () => ({ peakBytes: 1024 * 1024, points: 5 }),
  });

  assert.deepEqual(watch.unreadable, []);
  assert.deepEqual(watch.noData, []);
  assert.equal(concurrencyWatchBlindResult(watch), null);
  assert.equal(
    evaluateMonitorResults([{ rule: 'concurrency_watch', status: 'clean' }]).healthy,
    true,
  );
});

test('empty metric window is surfaced as no_data, not silently treated as proof of health', async () => {
  const watch = await checkConcurrencyIssues({
    getToken: async () => 'iam-token',
    readMemory: async () => ({ peakBytes: 0, points: 0 }),
  });

  assert.deepEqual(watch.unreadable, []);
  assert.deepEqual(watch.noData, API_FUNCTIONS.map((fn) => fn.name));
});

// ── concurrency_watch: метрика памяти читается как байты (2026-08-03) ─────
// Регресс, который эти тесты держат: serverless.functions.used_memory_bytes —
// гистограмма, значение ряда это счётчик попаданий, а величина памяти лежит в
// метке `bin`. Старый код читал счётчики как байты → peak по всем функциям
// выходил 0.0MB, и порог не мог быть превышен ни при какой нагрузке.
// Фикстура — живой ответ Monitoring API (heys-api-rpc, окно 60 мин).

test('histogram bin label carries the memory value, series value is only a hit counter', () => {
  const fixture = loadFixture();

  // Как читал старый код: максимум по doubleValues, будто это байты.
  let legacyPeakBytes = 0;
  for (const metric of fixture.histogram.metrics) {
    for (const raw of metric.timeseries.doubleValues) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > legacyPeakBytes) legacyPeakBytes = value;
    }
  }
  assert.ok(
    legacyPeakBytes < 2,
    `счётчики попаданий не байты: старое чтение дало ${legacyPeakBytes}`,
  );
  assert.ok(legacyPeakBytes / MB < 0.001, 'старое чтение округлялось в 0.0MB');

  const histogram = histogramPeak(fixture.histogram);
  assert.equal(histogram.ceilBytes, 250000000, 'верхняя корзина с попаданиями');
  assert.equal(histogram.floorBytes, 100000000, 'доказанный низ пика = ступень ниже');
  assert.ok(histogram.observations > 0);
  assert.ok(histogram.bins >= 30, 'лестница корзин пришла целиком');
});

test('sum/count of the same histogram yields real megabytes per invocation', () => {
  const fixture = loadFixture();
  const mean = meanMemoryPeak(fixture.sum, fixture.count);

  assert.equal(mean.points, 6, 'в фикстуре 6 точек, где были вызовы');
  const peakMB = mean.peakBytes / MB;
  // Живой замер: пик поточечного среднего у heys-api-rpc ≈ 129.7 МиБ.
  assert.ok(peakMB > 100 && peakMB < 200, `ожидали ~130MB, получили ${peakMB.toFixed(1)}MB`);
});

test('combined peak on live data is a real ratio, not zero, and stays under the threshold', () => {
  const fixture = loadFixture();
  const peakBytes = Math.max(
    meanMemoryPeak(fixture.sum, fixture.count).peakBytes,
    histogramPeak(fixture.histogram).floorBytes,
  );
  const limitMB = 512; // heys-api-rpc
  const ratio = peakBytes / MB / limitMB;

  assert.ok(ratio > 0.2, `штатная нагрузка должна давать заметный ratio, получили ${ratio}`);
  assert.ok(
    ratio < MEMORY_WARN_THRESHOLD_RATIO,
    `штатная нагрузка не должна алертить: ratio ${ratio} при пороге ${MEMORY_WARN_THRESHOLD_RATIO}`,
  );
});

test('a hit in the limit-touching bucket crosses the threshold', () => {
  const fixture = loadFixture();
  // Тот же живой ответ, но попадания перенесены в корзину 1e9. Для 512-МиБ
  // функции это значит «вызов взял больше 5e8 байт», то есть ≥93% лимита.
  for (const metric of fixture.histogram.metrics) {
    if (metric.labels.bin === '250000000') metric.labels.bin = '1000000000';
  }
  const histogram = histogramPeak(fixture.histogram);
  assert.equal(histogram.floorBytes, 500000000);

  const ratio = histogram.floorBytes / MB / 512;
  assert.ok(ratio > 0.9, `ожидали ~93% лимита, получили ${(ratio * 100).toFixed(1)}%`);
  assert.ok(ratio >= MEMORY_WARN_THRESHOLD_RATIO, 'правило обязано сработать');
});

test('threshold turns a real peak into an issue with byte-derived fields', async () => {
  const nearLimit = 0.95 * 512 * MB;
  const watch = await checkConcurrencyIssues({
    getToken: async () => 'iam-token',
    readMemory: async (name) => (name === 'heys-api-rpc'
      ? { peakBytes: nearLimit, points: 4, meanPeakBytes: nearLimit, floorBytes: 500000000, ceilBytes: 1000000000 }
      : { peakBytes: 120 * MB, points: 4, meanPeakBytes: 120 * MB, floorBytes: 100000000, ceilBytes: 250000000 }),
  });

  assert.deepEqual(watch.unreadable, []);
  assert.equal(watch.issues.length, 1);
  const issue = watch.issues[0];
  assert.equal(issue.function, 'heys-api-rpc');
  assert.equal(issue.peak_mb, 486);
  assert.equal(issue.limit_mb, 512);
  assert.equal(issue.ratio_pct, 95);
  // Верх корзины обрезан лимитом: 1e9 байт экземпляр на 512МиБ взять не может.
  assert.equal(issue.hist_ceil_mb, 512);
  assert.equal(issue.hist_floor_mb, 477);
});

test('normal load produces no issue at the calibrated threshold', async () => {
  // Худшее из живых суточных наблюдений: heys-api-auth, 116.5МиБ из 256 = 45.5%.
  const watch = await checkConcurrencyIssues({
    getToken: async () => 'iam-token',
    readMemory: async () => ({
      peakBytes: 116.5 * MB, points: 8, meanPeakBytes: 116.5 * MB,
      floorBytes: 100000000, ceilBytes: 250000000,
    }),
  });

  assert.deepEqual(watch.issues, []);
  assert.deepEqual(watch.noData, []);
  assert.equal(concurrencyWatchBlindResult(watch), null);
});
