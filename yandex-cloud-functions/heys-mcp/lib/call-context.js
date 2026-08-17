'use strict';

/**
 * Метка текущего вызова инструмента, видимая вложенному коду.
 *
 * `session_id` и `seq` выдаются транспортом до обработчика (lib/telemetry.js,
 * `begin()`), а нужны они внизу — `tasks_checkpoint` дописывает их в блок
 * стенограммы, чтобы обмен можно было связать со строкой `mcp_call` в логе.
 *
 * Пробрасывать метку параметром пришлось бы через каждый пишущий инструмент,
 * причём дважды: дневниковые записи зовут `tasks_checkpoint` не снаружи, а из
 * общей обёртки (lib/curator.js). Контекст вызова решает обе задачи разом — и
 * вложенный checkpoint видит метку ВНЕШНЕГО инструмента, то есть того самого
 * обмена, который он записывает.
 *
 * Параллельные вызовы на одном инстансе не смешиваются: у каждого свой
 * контекст. Без метки (прямой вызов инструмента в тестах) всё работает как
 * раньше, просто дописывать нечего.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const store = new AsyncLocalStorage();

function run(trace, fn) {
  if (!trace) return fn();
  return store.run(trace, fn);
}

function current() {
  return store.getStore() || null;
}

/**
 * Строка метки для стенограммы. Технические пометки в блоке живут одной
 * строкой в квадратных скобках (правило З6).
 *
 * `session` и `seq` связывают блок со строкой `mcp_call` самого write.
 * `ts` нужен, потому что на редком трафике каждый вызов садится на новый
 * `ts` в метке — `telemetry.begin()` (старт вызова); `ts` в `mcp_call` — конец.
 * Correlate сравнивает с началом; при узком окне write сдвинут на `duration_ms`.
 */
function transcriptMark(trace) {
  if (!trace || !trace.sessionId || !Number.isFinite(trace.seq)) return null;
  const ts = typeof trace.ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(trace.ts)
    ? ` ts=${trace.ts}`
    : '';
  return `[mcp session=${trace.sessionId} seq=${trace.seq}${ts}]`;
}

module.exports = { run, current, transcriptMark };
