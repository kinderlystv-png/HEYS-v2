'use strict';

/**
 * Отсечение лишних кругов модели (heys/8e2188, TIMING_LOG.md → «Круги агента»).
 *
 * Замер 18–20.08 по `tasks_mcp_trace`: паузы между вызовами — 94–96% времени
 * обмена, то есть ждут не сервер, а очередной круг «модель → функция →
 * модель». В том же замере 18.08: `heys_search_products` 60 вызовов, из них 55
 * помечены дублями, `heys_get_day` — 52 и 43. Словесный запрет в инструкции
 * («СЧЁТЧИК ВЫЗОВОВ», lib/curator.js) снизил их втрое, но не убрал: правило,
 * которое некому проверить, соблюдается на усмотрение модели.
 *
 * Поэтому проверка переносится на сервер и работает двумя разными способами —
 * потому что и повторы бывают двух разных видов:
 *
 * 1. **Тот же вызов с теми же аргументами.** Читать второй раз нечего: между
 *    вызовами ничего не менялось. Ответ отдаётся из памяти инстанса с явной
 *    пометкой «повтор» — модель видит, что круг был лишним, а куратор не ждёт
 *    ещё один round-trip к API.
 * 2. **Перебор формулировок.** «капучино» → «кофе» → «капучино с сиропом» — все
 *    аргументы разные, кэш такое не ловит. Ловит счётчик подряд идущих поисков:
 *    со второго в ответ добавляется прямая инструкция, что делать вместо ещё
 *    одной попытки.
 *
 * Отказывать нельзя ни в том, ни в другом случае: «забей 8 креветок, помидор и
 * яйцо» — это три законных поиска подряд, и отличить их от перебора синонимов
 * сервер не может. Поэтому guard только удешевляет и подсказывает.
 *
 * Кэш живёт в памяти инстанса и умирает вместе с ним — это нормально: лишние
 * круги случаются внутри одной реплики, за десятки секунд, то есть на одном
 * тёплом инстансе.
 *
 * **Инвалидация — любая запись.** Всё, чего нет в списке читающих инструментов,
 * считается записью и стирает кэш всего подключения. Так `heys_create_product`
 * → повторный `heys_search_products` возвращает свежую выдачу, а не память о
 * том, что продукта нет.
 */

/**
 * Читающие инструменты, чей ответ зависит только от аргументов и состояния
 * данных. Ничего не пишут — повтор в пределах окна вернёт то же самое.
 *
 * Списка «пишущих» намеренно нет: новый инструмент по умолчанию считается
 * пишущим и просто сбрасывает кэш. Ошибка в эту сторону стоит лишнего чтения,
 * в обратную — выдачи устаревших данных.
 */
const CACHEABLE_READ_TOOLS = new Set([
  'heys_get_day',
  'heys_get_period',
  'heys_get_profile',
  'heys_get_recipe',
  'heys_get_planning',
  'heys_search_products',
  'heys_list_clients',
  'heys_list_meal_presets',
  'heys_get_program_status',
  'heys_get_training_status',
  'heys_get_training',
  'heys_get_client_health',
  'tasks_read',
  'tasks_list',
  'tasks_search',
  'tasks_context',
]);

/** Инструменты, для которых считается серия подряд идущих вызовов. */
const STREAK_TOOLS = new Set(['heys_search_products']);

/**
 * Пишущие инструменты, у которых вторая подряд запись за одну реплику почти
 * всегда означает одну еду, разбитую надвое.
 *
 * Трейс 25.08, обмен 22:34 («сырники, сгущёнка, колбаса, шаги»): два
 * heys_log_meal подряд вместо одного с items[] — и это в чате, заведомо
 * получившем правило «ОДИН ВЫЗОВ НА РЕПЛИКУ» в голове инструкции. Словесное
 * правило доехало и не сработало; подсказка приходит в момент самой ошибки,
 * как это уже сработало для перебора формулировок в поиске.
 *
 * Отказывать нельзя: «два часа назад X, час назад Y» — законные два приёма, и
 * отличить их от разорванной реплики сервер не может. Поэтому только подсказка.
 */
const WRITE_SERIES_TOOLS = new Set(['heys_log_meal']);

/** Инструменты, для которых сервер считает серию подряд идущих вызовов. */
const SERIES_TOOLS = new Set([...STREAK_TOOLS, ...WRITE_SERIES_TOOLS]);

/**
 * Окно, внутри которого повтор считается повтором одной и той же реплики.
 *
 * Минута, а не «сколько не жалко»: по трейсу 18–20.08 повторные чтения идут с
 * интервалом 5–30 с, то есть окна хватает с запасом. Растягивать его дальше
 * опасно — данные клиента может поменять не только этот коннектор, но и сам
 * клиент из приложения, и тогда из памяти уедет уже неверный день.
 */
const DEFAULT_TTL_MS = 60 * 1000;
/** Потолок записей на подключение — защита от роста памяти тёплого инстанса. */
const MAX_ENTRIES_PER_SESSION = 64;
/** Подключений в памяти инстанса — тот же потолок, что у счётчиков телеметрии. */
const MAX_SESSIONS = 256;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Ключ вызова: имя инструмента и аргументы в стабильном порядке.
 * Значения аргументов остаются внутри инстанса и никуда не пишутся — в
 * телеметрию по-прежнему уходят только имена ключей (lib/telemetry.js).
 */
function callKey(tool, args) {
  return `${tool}|${stableStringify(args)}`;
}

/** Дословная подсказка про повтор — одной строкой перед исходным ответом. */
function repeatNotice(tool, ageMs, count) {
  const secs = Math.max(1, Math.round(ageMs / 1000));
  const ordinal = count >= 3 ? `${count}-й раз` : 'второй раз';
  // «Ответ тот же, что N с назад» — утверждение о нашем ответе, а не о мире:
  // данные мог поменять и сам клиент из приложения, мимо этого коннектора.
  return `[повтор] Тот же ${tool} с теми же аргументами ${ordinal} за ${secs} с — ниже тот же ответ, что уже был в диалоге ${secs} с назад. Перечитывать его незачем. Каждый такой круг — лишнее ожидание куратора.`;
}

/** Подсказка про перебор формулировок — только для поиска. */
function streakNotice(streak) {
  if (streak === 2) {
    return '[второй поиск подряд] Каталог просматривается целиком и по всем написаниям сразу — другая формулировка того же продукта даст тот же список. Нет подходящего: heys_create_product (с from_product_id ближайшего, если состав неизвестен), затем heys_log_meal.';
  }
  return `[${streak}-й поиск подряд] Перебор формулировок каталог не расширяет. Продукта в базе нет — заводи heys_create_product и вноси приём либо спроси куратора одним вопросом.`;
}

/** Подсказка про разорванную запись — только для пишущих. */
function writeSeriesNotice(streak) {
  return `[${streak}-я запись подряд] Позиции из одной реплики идут ОДНИМ heys_log_meal: несколько блюд — items[], несколько приёмов — meals[]. Отдельный вызов на каждое блюдо стоит куратору лишнего круга ожидания. Если приёмы правда разные по времени — так и запиши их одним вызовом через meals[].`;
}

/** Текст серии зависит от того, читал инструмент или писал. */
function seriesNotice(tool, streak) {
  return WRITE_SERIES_TOOLS.has(tool) ? writeSeriesNotice(streak) : streakNotice(streak);
}

/**
 * @param {object} [options]
 * @param {number} [options.ttlMs] окно повтора
 * @param {() => number} [options.now] источник времени (тесты)
 */
function createRepeatGuard({ ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  /** sessionId → { entries: Map<key, {ts, result, hits}>, streakTool, streak, streakTs } */
  const sessions = new Map();

  function touch(sessionId) {
    let state = sessions.get(sessionId);
    if (state) {
      // Пересоздание ключа двигает подключение в конец итерации Map: первым
      // вытесняется самое давно не используемое.
      sessions.delete(sessionId);
    } else {
      state = { entries: new Map(), streakTool: null, streak: 0, streakTs: 0 };
    }
    sessions.set(sessionId, state);
    if (sessions.size > MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      sessions.delete(oldest);
    }
    return state;
  }

  return {
    /**
     * Что делать с вызовом до обработчика.
     *
     * @returns {{repeat: boolean, result?: object, notice: string|null}}
     */
    before(sessionId, tool, args) {
      if (!sessionId || !tool) return { repeat: false, notice: null };
      const state = touch(sessionId);
      const ts = now();

      if (!CACHEABLE_READ_TOOLS.has(tool)) {
        // Запись меняет то, что читали до неё: память подключения обнуляется
        // целиком. Точечная инвалидация «по затронутым сущностям» здесь была бы
        // угадыванием — приём еды меняет и день, и норму, и остаток по калориям.
        state.entries.clear();
        state.streakTool = null;
        state.streak = 0;
        return { repeat: false, notice: null };
      }

      if (STREAK_TOOLS.has(tool)) {
        const fresh = state.streakTool === tool && ts - state.streakTs <= ttlMs;
        state.streak = fresh ? state.streak + 1 : 1;
        state.streakTool = tool;
        state.streakTs = ts;
      }

      const key = callKey(tool, args);
      const hit = state.entries.get(key);
      if (hit && ts - hit.ts <= ttlMs) {
        hit.hits += 1;
        return {
          repeat: true,
          result: hit.result,
          notice: repeatNotice(tool, ts - hit.ts, hit.hits),
        };
      }
      if (hit) state.entries.delete(key);

      const streak = STREAK_TOOLS.has(tool) ? state.streak : 0;
      return { repeat: false, notice: streak >= 2 ? streakNotice(streak) : null };
    },

    /** Запомнить ответ читающего инструмента. */
    after(sessionId, tool, args, result) {
      if (!sessionId || !CACHEABLE_READ_TOOLS.has(tool) || !result) return;
      const state = touch(sessionId);
      const key = callKey(tool, args);
      state.entries.delete(key);
      state.entries.set(key, { ts: now(), result, hits: 1 });
      if (state.entries.size > MAX_ENTRIES_PER_SESSION) {
        const oldest = state.entries.keys().next().value;
        state.entries.delete(oldest);
      }
    },

    /** Только для тестов и диагностики. */
    size() {
      return sessions.size;
    },
  };
}

module.exports = {
  CACHEABLE_READ_TOOLS,
  STREAK_TOOLS,
  WRITE_SERIES_TOOLS,
  SERIES_TOOLS,
  DEFAULT_TTL_MS,
  MAX_ENTRIES_PER_SESSION,
  MAX_SESSIONS,
  callKey,
  repeatNotice,
  streakNotice,
  writeSeriesNotice,
  seriesNotice,
  createRepeatGuard,
};
