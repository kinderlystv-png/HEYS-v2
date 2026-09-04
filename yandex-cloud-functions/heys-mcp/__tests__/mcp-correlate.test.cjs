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

test('parseMark читает session, seq и необязательные conn и ts', () => {
  assert.deepEqual(
    correlate.parseMark('[mcp session=82e5c67303be seq=1 conn=91aa77bc0011 ts=2026-08-17T18:33:12.000Z]'),
    { sessionId: '82e5c67303be', seq: 1, connId: '91aa77bc0011', ts: '2026-08-17T18:33:12.000Z' },
  );
  // Метки до 21.08 псевдонима подключения не несут — читаются как раньше.
  assert.deepEqual(
    correlate.parseMark('[mcp session=82e5c67303be seq=1 ts=2026-08-17T18:33:12.000Z]'),
    { sessionId: '82e5c67303be', seq: 1, connId: null, ts: '2026-08-17T18:33:12.000Z' },
  );
  assert.deepEqual(
    correlate.parseMark('[mcp session=a2418c691812 seq=7]'),
    { sessionId: 'a2418c691812', seq: 7, connId: null, ts: null },
  );
  assert.equal(correlate.parseMark('нет метки'), null);
});

test('вызов с другого инстанса остаётся подтверждённым по псевдониму подключения', () => {
  const marked = `## 18:33
**Кин:** добавь воды
**Claude:** записал.
[mcp session=82e5c67303be seq=1 conn=91aa77bc0011 ts=2026-08-17T18:33:12.000Z]
`;
  const { exchanges } = correlate.parseExchanges(marked, { date: '2026-08-17' });
  const merged = correlate.mergeSameTurnExchanges(exchanges);
  const calls = [
    // тот же инстанс
    { tool: 'heys_add_water', ts: '2026-08-17T18:33:12.000Z', session_id: '82e5c67303be', seq: 1, conn_id: '91aa77bc0011', role: 'curator', duration_ms: 900 },
    // холодный старт в середине обмена: session другой, подключение то же
    { tool: 'heys_get_day', ts: '2026-08-17T18:33:20.000Z', session_id: 'ffffffffffff', seq: 1, conn_id: '91aa77bc0011', role: 'curator', duration_ms: 300 },
    // чужое подключение в том же окне подтверждённым не становится
    { tool: 'heys_get_day', ts: '2026-08-17T18:33:25.000Z', session_id: 'aaaaaaaaaaaa', seq: 1, conn_id: '000000000000', role: 'curator', duration_ms: 300 },
  ];
  const { rows } = correlate.correlate({ exchanges: merged, calls });
  const enriched = correlate.enrichRowsWithAttribution(rows, correlate.knownSessionIds(merged), {
    date: '2026-08-17',
    connIds: correlate.knownConnIds(merged),
  });
  assert.deepEqual(enriched[0].confirmed_tools, ['heys_add_water', 'heys_get_day']);
  assert.deepEqual(enriched[0].probable_tools, ['heys_get_day']);
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

test('вызов четырьмя часами раньше попадает в цепочку своего write', () => {
  // Прежде связка была симметричной и с порогом ±5 минут, и такой вызов уходил
  // в «вне всех окон». 4 сентября так потерялось пятнадцать вызовов из двадцати:
  // разговор шёл с 11:48 до 14:55, а чекпоинт закрывал его один. Работа копится,
  // пока её кто-то не запишет, поэтому вызов принадлежит следующему чекпоинту —
  // сколько бы времени между ними ни прошло.
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  const { rows, unattached } = correlate.correlate({
    exchanges,
    calls: [
      { ts: '2026-08-17T17:21:00.000Z', tool: 'heys_list_clients', session_id: 'a2418c691812', seq: 1, duration_ms: 122 },
      { ts: '2026-08-17T18:33:12.500Z', tool: 'heys_add_water', session_id: '82e5c67303be', seq: 1, duration_ms: 1400 },
    ],
  });

  assert.deepEqual(rows[0].tools, ['heys_list_clients', 'heys_add_water']);
  assert.equal(unattached.length, 0);
});

test('длинный обмен не отдаёт свою первую половину блоку, записанному раньше', () => {
  // Форма 4 сентября: разговор с 11:48 до 14:55 записан одним чекпоинтом в
  // 14:55, а посреди него был короткий обмен 12:35, записанный сразу. Если
  // считать обмен точкой записи, все вызовы до 12:36 уходят короткому блоку:
  // связка честно направленная, отчёт выглядит правдиво и неверен. Обмен —
  // отрезок от заголовка до записи, и вложенный забирает только своё.
  const text = `
## 11:50
**Кин:** посмотри трейс
**Claude:** ок
[mcp session=bbbbbbbbbbbb seq=1 ts=2026-09-04T11:55:00.000Z]

## 12:35
**Кин:** короткий вопрос
**Claude:** ок
[mcp session=cccccccccccc seq=1 ts=2026-09-04T09:36:00.000Z]
`;
  const { exchanges } = correlate.parseExchanges(text, { date: '2026-09-04' });
  const { rows, unattached } = correlate.correlate({
    exchanges,
    calls: [
      { ts: '2026-09-04T09:00:00.000Z', tool: 'рано', duration_ms: 10 },
      { ts: '2026-09-04T09:35:30.000Z', tool: 'внутри_короткого', duration_ms: 10 },
      { ts: '2026-09-04T10:30:00.000Z', tool: 'после_короткого', duration_ms: 10 },
    ],
  });

  assert.equal(rows[0].heading, '11:50');
  assert.deepEqual(rows[0].tools, ['рано', 'после_короткого']);
  assert.deepEqual(rows[1].tools, ['внутри_короткого']);
  assert.equal(unattached.length, 0);
});

test('вызов позже последнего обмена ждёт следующего чекпоинта', () => {
  // Единственный вид неприписанных вызовов, который остаётся правильным: работу
  // после последней записи заберёт следующая. Терять её нельзя, приписывать
  // предыдущему обмену — тоже: он про неё ещё ничего не знает.
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  const { rows, unattached } = correlate.correlate({
    exchanges,
    calls: [
      { ts: '2026-08-17T18:33:12.500Z', tool: 'heys_add_water', session_id: '82e5c67303be', seq: 1, duration_ms: 100 },
      { ts: '2026-08-17T19:40:00.000Z', tool: 'heys_get_day', session_id: 'a2418c691812', seq: 1, duration_ms: 120 },
    ],
  });

  assert.deepEqual(rows[0].tools, ['heys_add_water']);
  assert.deepEqual(unattached.map((call) => call.tool), ['heys_get_day']);
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
  // Блок без метки считается отдельно, но из отчёта больше не выпадает:
  // заголовок ## ЧЧ:ММ — тоже якорь, только грубее. Прежде такой блок
  // выбрасывался целиком, и вызовы вокруг него уходили соседям.
  assert.equal(parsed.blocksWithoutMark, 1);
  assert.equal(parsed.exchanges.length, 2);
  assert.equal(parsed.exchanges[0].heading, '09:00');
  assert.equal(parsed.exchanges[0].mark, null);
  assert.equal(parsed.exchanges[0].pinMs, Date.parse('2026-08-17T06:00:00.000Z'));
  assert.equal(parsed.exchanges[1].mark.sessionId, 'aaaaaaaaaaaa');
});

test('вызовы блока без метки становятся вероятными, а не пропадают', () => {
  const text = `
## 09:00
**Кин:** Обмен без метки
**Claude:** ок

## 21:33
**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]
`;
  const { exchanges } = correlate.parseExchanges(text, { date: '2026-08-17' });
  const { rows, unattached } = correlate.correlate({
    exchanges,
    calls: [
      { ts: '2026-08-17T05:58:00.000Z', tool: 'heys_get_day', session_id: 'cccccccccccc', seq: 1, duration_ms: 90 },
      { ts: '2026-08-17T18:32:00.000Z', tool: 'heys_add_water', session_id: 'aaaaaaaaaaaa', seq: 1, duration_ms: 90 },
    ],
  });
  const enriched = correlate.enrichRowsWithAttribution(rows, correlate.knownSessionIds(exchanges), {
    date: '2026-08-17',
  });

  assert.equal(unattached.length, 0);
  assert.deepEqual(enriched[0].probable_tools, ['heys_get_day']);
  assert.deepEqual(enriched[0].confirmed_tools, []);
  assert.deepEqual(enriched[1].confirmed_tools, ['heys_add_water']);
});

test('parseLogText достаёт mcp_call из JSON и из текста yc logs', () => {
  const json = JSON.stringify([
    { t: 'mcp_call', tool: 'heys_add_water', ts: '2026-08-17T18:33:12.000Z' },
  ]);
  assert.equal(correlate.parseLogText(json)[0].tool, 'heys_add_water');

  const yc = '2026-08-17 18:33:12 TRACE {"t":"mcp_call","tool":"tasks_read","duration_ms":200}\nnoise';
  assert.equal(correlate.parseLogText(yc)[0].tool, 'tasks_read');
});

test('заголовок ## ~21:33 и диапазон ## 21:30–21:45 парсятся', () => {
  const text = `
## ~21:33
**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]

## 21:30–21:45
**Кин:** Диапазон
**Claude:** ок
[mcp session=bbbbbbbbbbbb seq=1 ts=2026-08-17T18:35:00.000Z]
`;
  const { exchanges } = correlate.parseExchanges(text, { date: '2026-08-17' });
  assert.equal(exchanges[0].heading, '21:33');
  assert.equal(exchanges[1].heading, '21:30');
});

test('confirmed vs probable и client role отфильтрован', () => {
  const { exchanges } = correlate.parseExchanges(transcript, { date: '2026-08-17' });
  const calls = correlate.filterCuratorCalls([
    { ts: '2026-08-17T18:33:10.000Z', tool: 'heys_get_day', session_id: 'aaaaaaaaaaaa', duration_ms: 80, role: 'curator' },
    { ts: '2026-08-17T18:33:12.500Z', tool: 'heys_add_water', session_id: '82e5c67303be', duration_ms: 1400, role: 'curator' },
    { ts: '2026-08-17T18:33:13.000Z', tool: 'heys_get_day', session_id: 'client1', duration_ms: 50, role: 'client' },
  ]);
  const { rows } = correlate.correlate({ exchanges, calls });
  const sessionIds = correlate.knownSessionIds(exchanges);
  const [row] = correlate.enrichRowsWithAttribution(rows, sessionIds);
  assert.deepEqual(row.confirmed_tools, ['heys_add_water']);
  assert.deepEqual(row.probable_tools, ['heys_get_day']);
  assert.equal(calls.length, 2);
});

test('два блока одного хода (один heading и kin) схлопываются', () => {
  const text = `
## 22:03
**Кин:** Добавь мне воды 200 мл
**Claude:** [Автозапись] чек-ин
[mcp session=5bfb1cbe3be8 seq=1 ts=2026-08-17T19:03:16.000Z]

## 22:03
**Кин:** Добавь мне воды 200 мл
**Claude:** [Автозапись] вода
[mcp session=6c7a0025159a seq=2 ts=2026-08-17T19:03:20.589Z]
`;
  const { exchanges } = correlate.parseExchanges(text, { date: '2026-08-17' });
  assert.equal(exchanges.length, 2);
  const merged = correlate.mergeSameTurnExchanges(exchanges);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].merged_blocks, 2);
  const { rows } = correlate.correlate({
    exchanges: merged,
    calls: [
      { ts: '2026-08-17T19:03:07.728Z', tool: 'heys_get_period', duration_ms: 264 },
      { ts: '2026-08-17T19:03:16.295Z', tool: 'heys_checkin', duration_ms: 851 },
      { ts: '2026-08-17T19:03:20.589Z', tool: 'heys_add_water', duration_ms: 881 },
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tools, ['heys_get_period', 'heys_checkin', 'heys_add_water']);
  assert.equal(rows[0].total_ms, 1996);
});

test('два разных kin под одним heading не схлопываются', () => {
  const text = `
## 21:33
**Кин:** Вода
**Claude:** ок
[mcp session=aaaaaaaaaaaa seq=1 ts=2026-08-17T18:33:00.000Z]

## 21:33
**Кин:** Приём
**Claude:** ок
[mcp session=bbbbbbbbbbbb seq=1 ts=2026-08-17T18:33:30.000Z]
`;
  const merged = correlate.mergeSameTurnExchanges(
    correlate.parseExchanges(text, { date: '2026-08-17' }).exchanges,
  );
  assert.equal(merged.length, 2);
});

test('analyzeFlow: wall, gaps, дубли read-tools', () => {
  const t0 = Date.parse('2026-08-17T21:59:41.357Z');
  const calls = [
    { ts: new Date(t0).toISOString(), tool: 'heys_get_day', duration_ms: 289 },
    { ts: new Date(t0 + 5000).toISOString(), tool: 'heys_get_day', duration_ms: 239 },
    { ts: new Date(t0 + 20000).toISOString(), tool: 'heys_search_products', duration_ms: 400 },
    { ts: new Date(t0 + 55000).toISOString(), tool: 'heys_log_meal', duration_ms: 1500 },
  ];
  const flow = correlate.analyzeFlow(calls);
  assert.equal(flow.wall_span_ms, 55_000 + 1500);
  assert.ok(flow.gaps_ms > 30_000);
  assert.equal(flow.max_gap_after_tool, 'heys_search_products');
  assert.deepEqual(flow.duplicates.map((d) => d.tool), ['heys_get_day']);
  assert.ok(flow.warnings.includes('duplicate:heys_get_day'));
  assert.ok(flow.warnings.includes('long_gap_after:heys_search_products'));
  assert.equal(flow.steps.length, 4);
  assert.equal(flow.steps[0].gap_after_ms, 5000 - 289);
});

test('analyzeFlowAnchors: pre от ## ЧЧ:ММ, post до метки write', () => {
  const date = '2026-08-17';
  const headingMs = correlate.headingToUtcMs(date, 22, 4);
  const firstStart = headingMs + 18_000;
  const calls = [
    { ts: new Date(firstStart).toISOString(), tool: 'heys_get_day', duration_ms: 300 },
    { ts: new Date(firstStart + 4000).toISOString(), tool: 'heys_log_meal', duration_ms: 2000 },
  ];
  const lastEnd = firstStart + 4000 + 2000;
  const pinMs = lastEnd + 3000;
  const flow = correlate.analyzeFlowAnchors(calls, { date, heading: '22:04', pinMs });
  assert.equal(flow.pre_chain_ms, 18_000);
  assert.equal(flow.post_chain_ms, 3000);
});

test('pre_chain=0 если вызовы начались до минуты заголовка', () => {
  const date = '2026-08-17';
  const headingMs = correlate.headingToUtcMs(date, 1, 0);
  const firstStart = headingMs - 19_000;
  const flow = correlate.analyzeFlowAnchors(
    [{ ts: new Date(firstStart).toISOString(), tool: 'heys_get_day', duration_ms: 100 }],
    { date, heading: '01:00', pinMs: firstStart + 5000 },
  );
  assert.equal(flow.pre_chain_ms, 0);
});

test('analyzeFlow: arg_keys доезжают до шага и отличают copy_meal от ручного ввода', () => {
  // Без имён полей вызов с copy_meal и вызов с add_items в трейсе выглядели
  // одинаково: приёмка «взяла ли модель рецепт» шла счётом search-вызовов.
  const t0 = Date.parse('2026-08-18T11:27:45.000Z');
  const calls = [
    {
      ts: new Date(t0).toISOString(), tool: 'heys_get_day', duration_ms: 400,
      arg_keys: ['client', 'date'],
    },
    {
      ts: new Date(t0 + 9000).toISOString(), tool: 'heys_log_meal', duration_ms: 1900,
      arg_keys: ['client', 'copy_meal', 'name', 'transcript'],
    },
  ];
  const flow = correlate.analyzeFlow(calls);
  assert.deepEqual(flow.steps[0].arg_keys, ['client', 'date']);
  assert.ok(flow.steps[1].arg_keys.includes('copy_meal'));
});

test('analyzeFlow: шаг без arg_keys поля не заводит', () => {
  // Старые строки телеметрии писались до 18.08 и ключей не имеют — они не
  // должны получать пустой массив, иначе «ключей нет» станет неотличимо от
  // «вызов был без аргументов».
  const t0 = Date.parse('2026-08-17T10:00:00.000Z');
  const flow = correlate.analyzeFlow([
    { ts: new Date(t0).toISOString(), tool: 'heys_get_day', duration_ms: 300 },
  ]);
  assert.equal('arg_keys' in flow.steps[0], false);
});

test('analyzeFlow: дубли считаются по args_hash, а не по имени инструмента', () => {
  const t0 = Date.parse('2026-08-21T21:00:00.000Z');
  // Семь поисков РАЗНЫХ продуктов — законный разбор составного ужина, не дубли.
  const distinct = Array.from({ length: 7 }, (_, i) => ({
    ts: new Date(t0 + i * 5000).toISOString(),
    tool: 'heys_search_products',
    duration_ms: 300,
    args_hash: `aaaaaaaa000${i}`,
  }));
  const flowDistinct = correlate.analyzeFlow(distinct);
  assert.deepEqual(flowDistinct.duplicates, [], 'разные аргументы — не дубль');

  // А вот тот же запрос дважды — настоящий повтор.
  const repeated = [
    { ts: new Date(t0).toISOString(), tool: 'heys_search_products', duration_ms: 300, args_hash: 'bbbbbbbb0001' },
    { ts: new Date(t0 + 5000).toISOString(), tool: 'heys_search_products', duration_ms: 300, args_hash: 'bbbbbbbb0001' },
    { ts: new Date(t0 + 9000).toISOString(), tool: 'heys_search_products', duration_ms: 300, args_hash: 'cccccccc0002' },
  ];
  const flowRepeated = correlate.analyzeFlow(repeated);
  assert.deepEqual(flowRepeated.duplicates, [{ tool: 'heys_search_products', count: 2 }]);
  assert.ok(flowRepeated.warnings.includes('duplicate:heys_search_products'));
});

test('analyzeFlow: старые записи без args_hash считаются по-старому', () => {
  const t0 = Date.parse('2026-08-21T21:00:00.000Z');
  const flow = correlate.analyzeFlow([
    { ts: new Date(t0).toISOString(), tool: 'heys_get_day', duration_ms: 200 },
    { ts: new Date(t0 + 4000).toISOString(), tool: 'heys_get_day', duration_ms: 200 },
  ]);
  assert.deepEqual(flow.duplicates, [{ tool: 'heys_get_day', count: 2 }]);
});
