'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const correlate = require('../lib/mcp-correlate');

const transcript = `# 2026-08-17

## 21:33

**Кин:** Запиши 250 мл воды
**Claude:** [Автозапись инструмента] Вода за 2026-08-17: 1450 мл (+250).
[mcp session=82e5c67303be seq=1 ts=2026-08-17T18:33:12.000Z]
`;

test('parseMark читает session, seq и необязательный ts', () => {
  assert.deepEqual(
    correlate.parseMark('[mcp session=82e5c67303be seq=1 ts=2026-08-17T18:33:12.000Z]'),
    { sessionId: '82e5c67303be', seq: 1, ts: '2026-08-17T18:33:12.000Z' },
  );
  assert.deepEqual(
    correlate.parseMark('[mcp session=a2418c691812 seq=7]'),
    { sessionId: 'a2418c691812', seq: 7, ts: null },
  );
  assert.equal(correlate.parseMark('нет метки'), null);
});

test('соседний read с другим session_id попадает в окно write', () => {
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  const { rows } = correlate.correlate({
    exchanges,
    calls: [
      { t: 'mcp_call', ts: '2026-08-17T18:33:10.000Z', tool: 'heys_get_day', session_id: 'aaaaaaaaaaaa', seq: 1, duration_ms: 80 },
      { t: 'mcp_call', ts: '2026-08-17T18:33:12.500Z', tool: 'heys_add_water', session_id: '82e5c67303be', seq: 1, duration_ms: 1400 },
      { t: 'mcp_call', ts: '2026-08-17T18:33:14.000Z', tool: 'tasks_read', session_id: '649098607d25', seq: 1, duration_ms: 200 },
    ],
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tools, ['heys_get_day', 'heys_add_water', 'tasks_read']);
  assert.equal(rows[0].total_ms, 1680);
  assert.equal(rows[0].kin, 'Запиши 250 мл воды');
});

test('вызов четырьмя часами раньше в цепочку write не попадает', () => {
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  const { rows, unattached } = correlate.correlate({
    exchanges,
    calls: [
      { ts: '2026-08-17T17:21:00.000Z', tool: 'heys_list_clients', session_id: 'a2418c691812', seq: 1, duration_ms: 122 },
      { ts: '2026-08-17T18:33:12.500Z', tool: 'heys_add_water', session_id: '82e5c67303be', seq: 1, duration_ms: 1400 },
    ],
  });

  assert.deepEqual(rows[0].tools, ['heys_add_water']);
  assert.equal(unattached.length, 1);
  assert.equal(unattached[0].tool, 'heys_list_clients');
});

test('два write за минуту не делят одни и те же вызовы', () => {
  const text = `
## 21:33
**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]

## 21:34
**Кин:** Приём
**Claude:** ок
[mcp session=bbbbbbbbbbbb seq=1 ts=2026-08-17T18:34:00.000Z]
`;
  const { rows } = correlate.correlate({
    exchanges: correlate.parseExchanges(text, { date: '2026-08-17' }).exchanges,
    calls: [
      { ts: '2026-08-17T18:33:01.000Z', tool: 'heys_add_water', duration_ms: 10 },
      { ts: '2026-08-17T18:33:58.000Z', tool: 'heys_log_meal', duration_ms: 20 },
    ],
  });

  assert.deepEqual(rows[0].tools, ['heys_add_water']);
  assert.deepEqual(rows[1].tools, ['heys_log_meal']);
});

test('метка без ts опирается на заголовок ## ЧЧ:ММ по Москве', () => {
  const text = `## 21:33\n**Кин:** Вода\n**Claude:** ок\n[mcp session=aaaaaaaaaaaa seq=1]\n`;
  const { exchanges } = correlate.parseExchanges(text, { date: '2026-08-17' });
  assert.equal(exchanges[0].pinMs, Date.parse('2026-08-17T18:33:00.000Z'));
});

test('блоки ## без метки считаются отдельно', () => {
  const text = `
## 09:00
**Кин:** Старый обмен без метки
**Claude:** ок

## 21:33
**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]
`;
  const parsed = correlate.parseExchanges(text, { date: '2026-08-17' });
  assert.equal(parsed.blocksWithoutMark, 1);
  assert.equal(parsed.exchanges.length, 1);
});

test('parseLogText достаёт mcp_call из JSON и из текста yc logs', () => {
  const json = JSON.stringify([
    { t: 'mcp_call', tool: 'heys_add_water', ts: '2026-08-17T18:33:12.000Z' },
  ]);
  assert.equal(correlate.parseLogText(json)[0].tool, 'heys_add_water');

  const yc = '2026-08-17 18:33:12 TRACE {"t":"mcp_call","tool":"tasks_read","duration_ms":200}\nnoise';
  assert.equal(correlate.parseLogText(yc)[0].tool, 'tasks_read');
});
