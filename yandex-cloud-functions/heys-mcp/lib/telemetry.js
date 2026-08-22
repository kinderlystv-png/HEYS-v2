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
  'session_id',    // псевдоним подключения на инстансе, к человеку не привязан
  'seq',           // номер вызова внутри session_id — по нему видны лишние круги
  // Псевдоним подключения, переживающий смену инстанса: по нему обмен
  // собирается целиком, когда середина цепочки уехала на холодный старт.
  // Живёт одни сутки — см. connectionAlias().
  'conn_id',
  'duration_ms',   // полное время обработчика
  'upstream_calls', // сколько round-trip'ов к API внутри вызова
  'upstream_ms',   // сколько из duration_ms ушло на API
  'status',        // ok | error | rejected
  'error_code',    // машинный код, никогда не текст исключения
  'resp_bytes',    // размер ответа
  'arg_count',     // сколько аргументов, не сами аргументы
  // Имена полей верхнего уровня JSON-аргументов, без значений. Только
  // Object.keys(args) — без рекурсии: у preset_grams и похожих вложенные
  // ключи — названия продуктов клиента, их сюда не поднимаем никогда.
  'arg_keys',
  // Отпечаток аргументов (короткий hex-хэш), не сами аргументы: по нему трейс
  // отличает настоящий повтор одного вызова от семи поисков разных продуктов —
  // счёт по одному имени инструмента шумел на втором и молчал бы о первом.
  'args_hash',
  'cold_start',    // первый вызов на инстансе
  // Возраст процесса. Не дубль cold_start: тот различает только первый вызов и
  // все прочие, а тут видно «инстанс живёт восемь секунд» против «живёт сорок
  // минут». Без этого одиночная строка неинтерпретируема — та же запись стоит
  // около секунды на прогретом инстансе и втрое дороже на поднятом с нуля
  // (TIMING_LOG.md).
  'uptime_ms',
  'fn_version',    // версия функции
  'role',          // curator | client — роль, а не человек
  // Какая подсказка про лишний круг ушла модели: repeat | streak | null.
  // Имя правила, не данные вызова — без него нельзя проверить, меняет ли
  // подсказка поведение или её игнорируют.
  'hint',
];

/**
 * Состав строки `mcp_list` — ответа на `tools/list`.
 *
 * Отдельный список, а не флаг в `RECORD_FIELDS`: у записей разный смысл полей,
 * и смешивать их — верный способ протащить в вызовы то, чего там быть не
 * должно. Появился после 18.08: куратор попросил вбить шаги, агент ответил
 * «инструмента нет», а доказать было нечем — сервер не писал ни сколько схем
 * отдал, ни какому клиенту. Имя и версия клиента — свойства программы, не
 * человека; сам список инструментов в лог не идёт, только его размер.
 */
const LIST_RECORD_FIELDS = [
  't',                // всегда 'mcp_list'
  'ts',
  'session_id',       // тот же псевдоним подключения, что у mcp_call
  // Подключение — то же, что у вызовов инструментов. Без него нельзя ответить
  // на главный вопрос про схемы: «этот чат забрал новый список или держит
  // старый». 22.08.2026 на это ушёл час раскопок в логах и ответа так и не
  // нашлось: session_id у tools/list свой на каждый запрос, а conn_id не писался.
  'conn_id',
  'tools_count',      // сколько схем ушло клиенту
  'tools_bytes',      // их суммарный размер: обрезка бывает по объёму, не по числу
  'client_name',      // clientInfo.name из initialize — программа, не человек
  'client_version',
  'protocol_version',
  'role',
  'cold_start',
  'uptime_ms',
  'fn_version',
];

const ALLOWED = new Set(RECORD_FIELDS);
const LIST_ALLOWED = new Set(LIST_RECORD_FIELDS);
const DEFAULT_PERSIST_TIMEOUT_MS = 250;
/** Потолок длины arg_keys — кривой аргумент не раздувает строку лога. */
const MAX_ARG_KEYS = 20;

/**
 * Имена полей верхнего уровня аргументов вызова — без значений.
 * Только прямой Object.keys(args), без рекурсии во вложенные объекты.
 */
function extractArgKeys(args, maxKeys = MAX_ARG_KEYS) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
  return Object.keys(args).sort().slice(0, maxKeys);
}

async function persistWithTimeout(persistCall, record, timeoutMs = DEFAULT_PERSIST_TIMEOUT_MS) {
  if (!persistCall) return;
  try {
    await Promise.race([
      Promise.resolve(persistCall(record)),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const kind = /timeout/i.test(msg) ? 'timeout' : 'insert_failed';
    console.warn(`[mcp-telemetry-db] ${kind}:`, msg);
  }
}

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
 * Псевдоним подключения, не зависящий от инстанса.
 *
 * `session_id` намеренно считается вместе с идентификатором инстанса — на нём
 * держится нумерация `seq` и уникальность строки в БД. Побочный эффект:
 * холодный старт в середине реплики разрывает обмен пополам, и вторая половина
 * вызовов уходит в «вероятные». Замер 18–20.08: подтверждённых 55–65%.
 *
 * Здесь тот же односторонний срез хэша, но солью служат сутки, а не инстанс:
 * внутри дня псевдоним стабилен и собирает обмен целиком, между днями —
 * меняется, то есть сквозного профиля по-прежнему не даёт.
 *
 * Сутки берутся в UTC, и это ровно граница `taskDay` задачника (03:00 МСК):
 * псевдоним меняется тогда же, когда меняется файл стенограммы, — обмен не
 * может оказаться разорванным этой сменой.
 *
 * Материал — метка чата (`Mcp-Session-Id`), а если клиент её не прислал, то
 * токен. Разница видна ровно в одном случае, и он не теоретический: два
 * параллельных чата на одном коннекторе несут один и тот же токен, и 21.08 в
 * трейс одного обмена уверенно попали вызовы соседнего, где в это время вели
 * дневник. Метка чата их разводит; токен остаётся запасным вариантом для
 * клиентов, которые сессию не поддерживают, — там поведение прежнее.
 */
function connectionAlias(source, nowMs = Date.now()) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const material = `${String(source || 'anonymous')}|${day}`;
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
    conn_id: input.connId || null,
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
    arg_keys: Array.isArray(input.argKeys)
      ? input.argKeys.filter((k) => typeof k === 'string').slice(0, MAX_ARG_KEYS)
      : [],
    args_hash: typeof input.argsHash === 'string' && /^[0-9a-f]{6,16}$/.test(input.argsHash)
      ? input.argsHash
      : null,
    cold_start: input.coldStart === true,
    uptime_ms: intOrNull(input.uptimeMs),
    fn_version: typeof input.fnVersion === 'string' && input.fnVersion ? input.fnVersion : null,
    role: input.role === 'curator' || input.role === 'client' ? input.role : null,
    hint: input.hint === 'repeat' || input.hint === 'streak' ? input.hint : null,
  };

  // Финальный фильтр: даже если выше кто-то допишет поле мимо списка, наружу
  // оно не уйдёт.
  const record = {};
  for (const field of RECORD_FIELDS) {
    if (ALLOWED.has(field) && draft[field] !== undefined) record[field] = draft[field];
  }
  return record;
}

/** Запись об отданном списке инструментов — по своему белому списку. */
function buildListRecord(input = {}) {
  const draft = {
    t: 'mcp_list',
    ts: new Date(input.nowMs || Date.now()).toISOString(),
    session_id: input.sessionId || null,
    conn_id: input.connId || null,
    tools_count: intOrNull(input.toolsCount),
    tools_bytes: intOrNull(input.toolsBytes),
    client_name: typeof input.clientName === 'string' && input.clientName
      ? input.clientName.slice(0, 64)
      : null,
    client_version: typeof input.clientVersion === 'string' && input.clientVersion
      ? input.clientVersion.slice(0, 32)
      : null,
    protocol_version: typeof input.protocolVersion === 'string' && input.protocolVersion
      ? input.protocolVersion.slice(0, 32)
      : null,
    role: input.role === 'curator' || input.role === 'client' ? input.role : null,
    cold_start: input.coldStart === true,
    uptime_ms: intOrNull(input.uptimeMs),
    fn_version: typeof input.fnVersion === 'string' && input.fnVersion ? input.fnVersion : null,
  };
  const record = {};
  for (const field of LIST_RECORD_FIELDS) {
    if (LIST_ALLOWED.has(field) && draft[field] !== undefined) record[field] = draft[field];
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
    /**
     * Резервирует место в последовательности до вызова инструмента.
     *
     * Нужен по двум причинам. Во-первых, клиенту возвращаются те же самые
     * `session_id` и `seq`, что уйдут в лог, — иначе связать реплику куратора
     * со строкой телеметрии нечем (MCP_TELEMETRY_ROADMAP.md, фаза 2). Во-вторых,
     * `seq` становится порядком НАЧАЛА вызовов: на одном инстансе они идут
     * параллельно, и нумерация по завершению переставляет местами быстрый и
     * медленный вызовы, то есть врёт как раз про лишние круги.
     */
    begin(token, chatSessionId = null) {
      const sessionId = sessionAlias(token, instance);
      const nowMs = Date.now();
      return {
        sessionId,
        seq: nextSeq(sessionId),
        connId: connectionAlias(chatSessionId || token, nowMs),
        ts: new Date(nowMs).toISOString(),
      };
    },
    /**
     * Список инструментов. Синхронно и без persist: в БД он не нужен, а ответ
     * на tools/list задерживать нечем — это первый запрос клиента.
     */
    recordList(input = {}) {
      try {
        const nowMs = Date.now();
        const record = buildListRecord({
          ...input,
          sessionId: input.sessionId || sessionAlias(input.token, instance),
          // Тот же материал, что у begin(): чат сопоставляется с вызовами.
          connId: input.connId || connectionAlias(input.chatSessionId || input.token, nowMs),
          fnVersion: input.fnVersion || version,
        });
        emitRecord(record, { logger });
        return record;
      } catch (_) {
        return null;
      }
    },
    async record(input, { persistCall = null, persistTimeoutMs = DEFAULT_PERSIST_TIMEOUT_MS } = {}) {
      try {
        const sessionId = input.sessionId || sessionAlias(input.token, instance);
        const record = buildRecord({
          ...input,
          sessionId,
          // Номер уже выдан `begin()` — повторный вызов сдвинул бы счётчик и
          // развёл ответ клиенту с логом.
          seq: Number.isFinite(input.seq) ? input.seq : nextSeq(sessionId),
          fnVersion: input.fnVersion || version,
        });
        emitRecord(record, { logger });
        if (!record.session_id || !Number.isFinite(record.seq)) {
          console.warn('[mcp-telemetry-db] skip: no session_id/seq');
          return record;
        }
        await persistWithTimeout(persistCall, record, persistTimeoutMs);
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
  LIST_RECORD_FIELDS,
  buildListRecord,
  MAX_ARG_KEYS,
  MAX_TRACKED_SESSIONS,
  DEFAULT_PERSIST_TIMEOUT_MS,
  sessionAlias,
  connectionAlias,
  createSeqCounter,
  extractArgKeys,
  buildRecord,
  emitRecord,
  persistWithTimeout,
  createTelemetry,
};
