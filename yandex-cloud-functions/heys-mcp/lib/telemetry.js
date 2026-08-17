'use strict';

/**
 * Телеметрия вызовов инструментов MCP (heys/8e2188).
 *
 * Одна строка чистого JSON в stdout на каждый вызов — рантайм Yandex Cloud
 * сам уносит её в Cloud Logging и разбирает в `jsonPayload`. Ни соединений к
 * БД, ни таймеров, ни отложенного flush: инстанс Cloud Function замерзает
 * сразу после ответа, поэтому всё, что не записано синхронно, теряется вместе
 * с ним. Агрегация — суточным джобом уже из Logging, вне горячего пути.
 *
 * Строка обязана быть валидным JSON целиком, без текстового префикса: иначе
 * Logging положит её в `message` строкой, и фильтр `jsonPayload.t = "mcp_call"`
 * не найдёт ничего.
 *
 * Приватность здесь конструктивная, а не по договорённости: запись собирается
 * по белому списку полей (`RECORD_FIELDS`). Что не перечислено — в строку не
 * попадает физически, даже если это передали в `buildRecord`. Чёрный список
 * («не писать аргументы») продержался бы ровно до первого нового поля.
 */

const crypto = require('node:crypto');

/**
 * Единственный источник истины о составе строки лога. Порядок — порядок
 * ключей в JSON; тест на утечку читает этот же список, поэтому новое поле
 * нельзя добавить мимо него.
 */
const RECORD_FIELDS = [
  't',             // тип записи, всегда 'mcp_call' — по нему фильтр в Logging
  'ts',            // ISO-время вызова
  'tool',          // имя инструмента — то, ради чего вся затея
  'session_id',    // псевдоним подключения, к человеку не привязан
  'seq',           // номер вызова внутри session_id — по нему видны лишние круги
  'duration_ms',   // полное время обработчика
  'upstream_calls', // сколько round-trip'ов к API внутри вызова
  'upstream_ms',   // сколько из duration_ms ушло на API
  'status',        // ok | error | rejected
  'error_code',    // машинный код, никогда не текст исключения
  'resp_bytes',    // размер ответа
  'arg_count',     // сколько аргументов, не сами аргументы
  'cold_start',    // первый вызов на инстансе
  // Возраст процесса. Не дубль cold_start: тот различает только первый вызов и
  // все прочие, а тут видно «инстанс живёт восемь секунд» против «живёт сорок
  // минут». Без этого одиночная строка неинтерпретируема — та же запись стоит
  // около секунды на прогретом инстансе и втрое дороже на поднятом с нуля
  // (TIMING_LOG.md).
  'uptime_ms',
  'fn_version',    // версия функции
  'role',          // curator | client — роль, а не человек
];

const ALLOWED = new Set(RECORD_FIELDS);

/**
 * Псевдоним подключения.
 *
 * Своего `Mcp-Session-Id` у нас нет: транспорт stateless и сессию не ведёт
 * (lib/mcp.js). Идентификатор инстанса в одиночку не годится — на одном
 * инстансе живут вызовы разных подключений, и последовательности склеятся,
 * а именно ради них поле и заводится.
 *
 * Поэтому псевдоним считается от access-токена вместе с идентификатором
 * инстанса: у разных подключений он разный, внутри одного стабилен. Это
 * односторонний срез хэша — по нему нельзя узнать ни токен, ни человека, и
 * при перезапуске инстанса он меняется, то есть сквозного профиля не даёт.
 */
function sessionAlias(token, instanceId) {
  const material = `${String(token || 'anonymous')}|${instanceId}`;
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 12);
}

/**
 * Счётчик вызовов на подключение. Живёт в памяти инстанса и умирает вместе с
 * ним — это нормально: последовательности разбираются внутри суток по паре
 * (session_id, seq), а не между инстансами.
 *
 * Ограничение размера — защита от утечки памяти на долгоживущем тёплом
 * инстансе: подключений за его жизнь может накопиться много, и Map без
 * потолка растёт бесконечно.
 */
const MAX_TRACKED_SESSIONS = 512;

function createSeqCounter() {
  const counters = new Map();
  return function nextSeq(sessionId) {
    const next = (counters.get(sessionId) || 0) + 1;
    // Пересоздание ключа двигает его в конец итерации Map — самый давно не
    // используемый оказывается первым и вытесняется.
    counters.delete(sessionId);
    counters.set(sessionId, next);
    if (counters.size > MAX_TRACKED_SESSIONS) {
      const oldest = counters.keys().next().value;
      counters.delete(oldest);
    }
    return next;
  };
}

function intOrNull(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Собирает запись строго по белому списку.
 *
 * `status`: ok — обработчик вернул результат; rejected — инструмент осознанно
 * отказал (`ToolError` с кодом: нет согласия, не найден клиент, плохой
 * аргумент); error — необработанное исключение. Разделение нужно, чтобы
 * отказы по правилам не читались как поломка сервиса.
 */
function buildRecord(input = {}) {
  const status = input.ok ? 'ok' : (input.errorCode && input.errorCode !== 'internal_error' ? 'rejected' : 'error');
  const draft = {
    t: 'mcp_call',
    ts: new Date(input.nowMs || Date.now()).toISOString(),
    tool: typeof input.tool === 'string' ? input.tool : null,
    session_id: input.sessionId || null,
    seq: intOrNull(input.seq),
    duration_ms: intOrNull(input.durationMs),
    upstream_calls: intOrNull(input.upstreamCalls),
    upstream_ms: intOrNull(input.upstreamMs),
    status,
    // Код ошибки — из заранее известного словаря кодов инструментов. Текст
    // исключения сюда не попадает никогда: в него утекают значения аргументов
    // («продукт "творог 5%" не найден»).
    error_code: input.ok ? null : (typeof input.errorCode === 'string' ? input.errorCode : 'internal_error'),
    resp_bytes: intOrNull(input.responseBytes),
    arg_count: intOrNull(input.argCount),
    cold_start: input.coldStart === true,
    uptime_ms: intOrNull(input.uptimeMs),
    fn_version: typeof input.fnVersion === 'string' && input.fnVersion ? input.fnVersion : null,
    role: input.role === 'curator' || input.role === 'client' ? input.role : null,
  };

  // Финальный фильтр: даже если выше кто-то допишет поле мимо списка, наружу
  // оно не уйдёт.
  const record = {};
  for (const field of RECORD_FIELDS) {
    if (ALLOWED.has(field) && draft[field] !== undefined) record[field] = draft[field];
  }
  return record;
}

/**
 * Печать записи. Телеметрия не имеет права ни уронить вызов, ни задержать
 * ответ: любая ошибка сериализации гасится здесь же.
 */
function emitRecord(record, { logger = console } = {}) {
  try {
    logger.log(JSON.stringify(record));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Готовый писатель для одного инстанса функции: держит псевдонимы и счётчики,
 * отдаёт одну функцию на вызов инструмента.
 */
function createTelemetry({ instanceId, fnVersion, logger = console } = {}) {
  const instance = instanceId || crypto.randomUUID();
  const nextSeq = createSeqCounter();
  let version = fnVersion || null;
  return {
    instanceId: instance,
    sessionIdFor: (token) => sessionAlias(token, instance),
    // Версию сообщает обработчик из своего `context`: в окружении её нет.
    setFnVersion(next) {
      if (typeof next === 'string' && next) version = next;
    },
    record(input) {
      try {
        const sessionId = input.sessionId || sessionAlias(input.token, instance);
        const record = buildRecord({
          ...input,
          sessionId,
          seq: nextSeq(sessionId),
          fnVersion: input.fnVersion || version,
        });
        emitRecord(record, { logger });
        return record;
      } catch (_) {
        // Телеметрия молчит и не мешает: вызов инструмента уже отработал.
        return null;
      }
    },
  };
}

module.exports = {
  RECORD_FIELDS,
  MAX_TRACKED_SESSIONS,
  sessionAlias,
  createSeqCounter,
  buildRecord,
  emitRecord,
  createTelemetry,
};
