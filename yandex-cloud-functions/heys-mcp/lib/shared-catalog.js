'use strict';

/**
 * Кеш общей базы продуктов на время жизни инстанса функции.
 *
 * Зачем: без него каждый вызов инструмента тянет всю таблицу `shared_products`
 * (тысячи строк). Это и есть главный источник и медленных ответов, и того
 * инцидента, ради которого модуль появился: 2026-08-01 запрос упал, каталог
 * молча собрался без Type A строк (а это почти весь личный список клиента),
 * поиск ответил «не нашлось» — и следующим шагом завёлся бы дубликат.
 *
 * Почему кешировать безопасно: `shared_products` — глобальный справочник,
 * одинаковый для всех клиентов и доступный на чтение публично. Персональные
 * данные сюда не попадают, поэтому кеш не может «протечь» между клиентами.
 * Личный overlay клиента не кешируется никогда.
 *
 * Cloud Function переиспользует прогретый контейнер между вызовами, поэтому
 * модульная переменная переживает вызовы в пределах инстанса — и умирает
 * вместе с ним. Это ровно та длительность, на которую справочник можно
 * считать неизменным.
 */

const TTL_MS = 10 * 60 * 1000;
/** Сколько ещё можно отдавать протухший снимок, если база недоступна. */
const STALE_GRACE_MS = 60 * 60 * 1000;

let cache = null; // { rows, loadedAt }
let inFlight = null;

function reset() {
  cache = null;
  inFlight = null;
}

/**
 * @returns {Promise<{rows: Array, error: object|null, source: 'cache'|'network'|'stale'}>}
 * `stale` означает: сеть не ответила, отдан прошлый снимок. Вызывающий код
 * может работать дальше — данные справочника меняются редко.
 */
async function loadSharedProducts(api, { nowMs = Date.now(), ttlMs = TTL_MS } = {}) {
  if (cache && nowMs - cache.loadedAt < ttlMs) {
    return { rows: cache.rows, error: null, source: 'cache', truncated: !!cache.truncated };
  }

  // Параллельные инструменты в одном запросе не должны тянуть базу дважды.
  if (!inFlight) {
    inFlight = api.getSharedProducts({}).finally(() => { inFlight = null; });
  }
  const res = await inFlight;

  if (res.error || !Array.isArray(res.data)) {
    if (cache && nowMs - cache.loadedAt < STALE_GRACE_MS) {
      return { rows: cache.rows, error: null, source: 'stale' };
    }
    return { rows: [], error: res.error || { message: 'shared_products_unavailable' }, source: 'network' };
  }

  // Пустой справочник — не легальное состояние, а признак сбоя. Заменить им
  // рабочий снимок значило бы тихо обнулить каталог всем клиентам инстанса.
  if (res.data.length === 0 && cache) {
    return { rows: cache.rows, error: null, source: 'stale' };
  }

  cache = { rows: res.data, loadedAt: nowMs, truncated: !!res.truncated };
  if (res.truncated) {
    // Справочник упёрся в лимит выборки: часть продуктов не приехала, и поиск
    // будет честно, но неполно отвечать «не нашлось». Ловится только здесь —
    // сам по себе такой ответ выглядит успешным.
    console.warn('[heys-mcp] shared_products truncated by limit', { rows: res.data.length });
  }
  return { rows: res.data, error: null, source: 'network', truncated: !!res.truncated };
}

module.exports = { loadSharedProducts, reset, TTL_MS, STALE_GRACE_MS };
