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
 * строкой в квадратных скобках (правило З6), формат держится машиночитаемым:
 * по нему correlate находит вызовы с `seq` от предыдущей метки до этой.
 */
function transcriptMark(trace) {
  if (!trace || !trace.sessionId || !Number.isFinite(trace.seq)) return null;
  return `[mcp session=${trace.sessionId} seq=${trace.seq}]`;
}

module.exports = { run, current, transcriptMark };
