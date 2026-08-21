// Начальная загрузка базы клиента страницами: что делать, когда страница не
// влезает в ответ.
//
// Прод, 21.08.2026. У клиента накопилось столько данных, что страница из 200
// строк вместе со столбцом `v` перестала влезать в лимит тела ответа облачной
// функции. Замер на живом API: 25 строк — 0,55 МБ, 50 строк — 1,12 МБ, 100 и
// 200 строк — отказ, и отказ детерминированный.
//
// Деление страницы пополам в коде уже было, но срабатывало только на код 502.
// Одиночный запрос действительно ловит 502 от самой функции, а под параллельной
// загрузкой шлюз сбрасывает нагрузку и отвечает 503, не дойдя до неё. 503 не
// распознавался — вся начальная загрузка обрывалась, приложение уходило в
// «сеть недоступна» и жило с локального кэша.
//
// Живьём это не собрать: нужен клиент с определённым объёмом данных и
// параллельная загрузка, чтобы шлюз ответил именно 503.
import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

const CLIENT = 'client-1';
// Столько строк лежит у клиента. Больше трёх страниц по 200 — чтобы потолок
// пришлось применять не один раз.
const TOTAL_ROWS = 740;
// Столько строк реально влезает в ответ.
const FITS = 50;

function loadStorageModule() {
  if (typeof window.addEventListener !== 'function') window.addEventListener = vi.fn();
  if (typeof window.removeEventListener !== 'function') window.removeEventListener = vi.fn();
  if (typeof global.addEventListener !== 'function') global.addEventListener = window.addEventListener;
  if (typeof global.removeEventListener !== 'function') global.removeEventListener = window.removeEventListener;
  for (const file of [
    '../heys_pending_queue_pure_v1.js',
    '../heys_sync_queue_runtime_pure_v1.js',
    '../heys_write_context_health_v1.js',
    '../heys_storage_key_contract_v1.js',
  ]) {
    eval(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
  }
  eval(fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8'));
}

/**
 * Отдаёт строки постранично и отказывает, когда запрошенный кусок не влезает.
 * @param {number} failCode код отказа шлюза на слишком большой кусок
 */
function makeRest(failCode, log) {
  return vi.fn(async (table, opts) => {
    if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
      return { data: [], error: null };
    }
    log.push({ offset: opts.offset || 0, limit: opts.limit });

    if (opts.limit > FITS) {
      return { data: null, error: { code: failCode, message: 'Response code ' + failCode } };
    }

    const from = opts.offset || 0;
    const rows = [];
    for (let i = from; i < Math.min(from + opts.limit, TOTAL_ROWS); i++) {
      rows.push({ k: 'heys_key_' + String(i).padStart(4, '0'), v: 'x', updated_at: '2026-08-21T00:00:00Z' });
    }
    return { data: rows, error: null };
  });
}

/**
 * Отказ так, как его ВИДИТ БРАУЗЕР: шлюз подставил Access-Control-Allow-Origin: '*',
 * запрос шёл с credentials, ответ заблокирован целиком — кода нет, только
 * «Failed to fetch» с признаком сетевого сбоя.
 */
function makeCorsMaskedRest(log) {
  return vi.fn(async (table, opts) => {
    if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
      return { data: [], error: null };
    }
    log.push({ offset: opts.offset || 0, limit: opts.limit });
    if (opts.limit > FITS) {
      return { data: null, error: { message: 'Failed to fetch', isNetworkFailure: true } };
    }
    const from = opts.offset || 0;
    const rows = [];
    for (let i = from; i < Math.min(from + opts.limit, TOTAL_ROWS); i++) {
      rows.push({ k: 'heys_key_' + String(i).padStart(4, '0'), v: 'x', updated_at: '2026-08-21T00:00:00Z' });
    }
    return { data: rows, error: null };
  });
}

/** Строки, реально доехавшие до клиента, по журналу успешных запросов. */
function coveredRows(log) {
  const covered = new Set();
  for (const { offset, limit } of log) {
    if (limit > FITS) continue; // этот запрос отказал
    for (let i = offset; i < Math.min(offset + limit, TOTAL_ROWS); i++) covered.add(i);
  }
  return covered;
}

/** Цепочка `.from(...).select(...)...`, которая в конце отдаёт пустой результат. */
function emptyChain() {
  const chain = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: [], error: null });
      return () => chain;
    },
    apply() {
      return chain;
    },
  });
  return chain;
}

/** Модуль зовёт YandexAPI как глобальное имя, а не через HEYS. */
function installApi(api) {
  window.YandexAPI = api;
  global.YandexAPI = api;
  window.HEYS.YandexAPI = api;
}

function setupWorld() {
  localStorage.clear();
  localStorage.setItem('heys_pin_auth_client', CLIENT);
  localStorage.setItem('heys_client_current', CLIENT);
  window.HEYS = {
    auth: { logout: vi.fn().mockResolvedValue({ ok: true }) },
    cloud: {},
  };
  installApi({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    rest: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => emptyChain()),
    mergeSaveKV: vi.fn().mockResolvedValue({ data: null, error: null }),
    saveKV: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  loadStorageModule();
  window.HEYS.cloud.setPinAuthClient(CLIENT);
}

describe('начальная загрузка · страница не влезла в ответ', () => {
  beforeEach(() => {
    setupWorld();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  for (const code of [502, 503]) {
    it(`отказ ${code} на большой странице не обрывает загрузку — страница делится`, async () => {
      const log = [];
      installApi({ ...window.HEYS.YandexAPI, rest: makeRest(code, log) });

      await window.HEYS.cloud.bootstrapClientSync(CLIENT);

      const covered = coveredRows(log);
      expect(
        covered.size,
        `при отказе ${code} доехало ${covered.size} строк из ${TOTAL_ROWS}`,
      ).toBe(TOTAL_ROWS);

      // Ни одной дыры: последовательность покрыта целиком, а не «сколько успели».
      for (let i = 0; i < TOTAL_ROWS; i++) {
        expect(covered.has(i), `строка ${i} не доехала`).toBe(true);
      }
    });
  }

  it('отказ, замаскированный CORS в «Failed to fetch», тоже делит страницу', async () => {
    // Прод, 21.08.2026, второй заход: деление по кодам 502/503 уже работало, но
    // на части запросов браузер блокировал ответ шлюза целиком, и до клиента не
    // доходило ничего, кроме «Failed to fetch». Загрузка сдавалась на первой же
    // такой странице.
    const log = [];
    installApi({ ...window.HEYS.YandexAPI, rest: makeCorsMaskedRest(log) });

    await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    const covered = coveredRows(log);
    expect(covered.size, `доехало ${covered.size} строк из ${TOTAL_ROWS}`).toBe(TOTAL_ROWS);
  });

  it('когда сети действительно нет, страницы не дробятся впустую', async () => {
    // Отличие «сервер отказал» от «связи нет» — по navigator.onLine. Иначе при
    // офлайне мы бы вчетверо умножали безнадёжные запросы.
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const log = [];
    installApi({
      ...window.HEYS.YandexAPI,
      rest: vi.fn(async (table, opts) => {
        if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
          return { data: [], error: null };
        }
        log.push({ offset: opts.offset || 0, limit: opts.limit });
        return { data: null, error: { message: 'Failed to fetch', isNetworkFailure: true } };
      }),
    });

    await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    expect(log.every((r) => r.limit === 100), 'в офлайне страницы всё-таки дробились').toBe(true);
    spy.mockRestore();
  });

  it('потолок нащупывается один раз, а не на каждой странице заново', async () => {
    const log = [];
    installApi({ ...window.HEYS.YandexAPI, rest: makeRest(503, log) });

    await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    const failed = log.filter((r) => r.limit > FITS);
    // 200 → 100 → 50: два отказа на первой странице. Дальше код обязан брать
    // сразу по нащупанному размеру, иначе каждая следующая страница стоит ещё
    // двух отказов функции — на большом клиенте это десятки лишних запросов.
    expect(
      failed.length,
      'отказов ' + failed.length + ': потолок ищется заново на каждой странице',
    ).toBeLessThanOrEqual(2);
  });

  it('обычная серверная ошибка идёт своим путём — с повтором, а не с делением', async () => {
    // Эта ветка живёт рядом с делением и легко ломается заодно: в первой версии
    // правки здесь остался вызов старого имени, то есть ReferenceError на любой
    // ошибке, кроме 502/503.
    const log = [];
    let firstCall = true;
    const rest = vi.fn(async (table, opts) => {
      if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
        return { data: [], error: null };
      }
      log.push({ offset: opts.offset || 0, limit: opts.limit });
      if (firstCall) {
        firstCall = false;
        return { data: null, error: { code: 500, message: 'Internal error' } };
      }
      const from = opts.offset || 0;
      const rows = [];
      for (let i = from; i < Math.min(from + opts.limit, 10); i++) {
        rows.push({ k: 'heys_key_' + i, v: 'x', updated_at: '2026-08-21T00:00:00Z' });
      }
      return { data: rows, error: null };
    });
    installApi({ ...window.HEYS.YandexAPI, rest });

    await expect(window.HEYS.cloud.bootstrapClientSync(CLIENT)).resolves.not.toThrow();

    // Повтор того же куска, а не дробление.
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[1].limit).toBe(log[0].limit);
  });

  it('задачник не запрашивается вовсе — фильтр уходит на сервер', async () => {
    // Ключи heys_tasks_* приложению не нужны, но раньше они качались и
    // выбрасывались уже на клиенте. У большого клиента они идут подряд и
    // собираются в страницу, которая не влезает в ответ функции.
    const seen = [];
    installApi({
      ...window.HEYS.YandexAPI,
      rest: vi.fn(async (table, opts) => {
        if (table === 'client_kv_store' && opts && typeof opts.limit === 'number') {
          seen.push(opts.filters || {});
        }
        return { data: [], error: null };
      }),
    });

    await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    expect(seen.length, 'страницы не запрашивались вовсе').toBeGreaterThan(0);
    for (const f of seen) {
      expect(f['notlike.k'], 'страница запрошена без фильтра задачника').toBe('heys_tasks_*');
    }
  });

  it('упавшая страница не обнуляет уже доехавшие', async () => {
    // Раньше отказ на седьмой странице выбрасывал шесть предыдущих целиком.
    const log = [];
    installApi({
      ...window.HEYS.YandexAPI,
      rest: vi.fn(async (table, opts) => {
        if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
          return { data: [], error: null };
        }
        const from = opts.offset || 0;
        log.push({ offset: from, limit: opts.limit });
        // Всё до 600-й строки отдаём, дальше — глухой отказ на любом размере.
        if (from >= 600) {
          return { data: null, error: { code: 502, message: 'Response code 502' } };
        }
        const rows = [];
        for (let i = from; i < Math.min(from + opts.limit, TOTAL_ROWS); i++) {
          rows.push({ k: 'heys_key_' + String(i).padStart(4, '0'), v: 'x', updated_at: '2026-08-21T00:00:00Z' });
        }
        return { data: rows, error: null };
      }),
    });

    const before = localStorage.getItem('heys_' + CLIENT + '_last_sync_ts');
    const res = await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    // Не «офлайн с пустыми руками»: часть данных доехала и должна остаться.
    expect(res, 'загрузка вернула пустой результат').toBeTruthy();
    // Отметку синхронизации при неполной загрузке ставить нельзя — иначе
    // следующий заход пойдёт дельтой и недостающее не приедет никогда.
    expect(localStorage.getItem('heys_' + CLIENT + '_last_sync_ts')).toBe(before);
  });

  it('когда страница влезает, деления не происходит вовсе', async () => {
    const log = [];
    // Влезает всё: отказов нет ни на одном размере.
    const restAll = vi.fn(async (table, opts) => {
      if (table !== 'client_kv_store' || !opts || typeof opts.limit !== 'number') {
        return { data: [], error: null };
      }
      log.push({ offset: opts.offset || 0, limit: opts.limit });
      const from = opts.offset || 0;
      const rows = [];
      for (let i = from; i < Math.min(from + opts.limit, TOTAL_ROWS); i++) {
        rows.push({ k: 'heys_key_' + String(i).padStart(4, '0'), v: 'x', updated_at: '2026-08-21T00:00:00Z' });
      }
      return { data: rows, error: null };
    });
    installApi({ ...window.HEYS.YandexAPI, rest: restAll });

    await window.HEYS.cloud.bootstrapClientSync(CLIENT);

    expect(log.every((r) => r.limit === 100), 'страницы дробились без причины').toBe(true);
  });
});
