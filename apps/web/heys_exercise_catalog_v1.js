// heys_exercise_catalog_v1.js — справочник упражнений конструктора силовой:
// названия, группы мышц, единица измерения, коэффициент своего веса + подсказки
// и частота (LS).
//
// Шаг 1 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md: от единицы
// измерения зависит и тоннаж, и вид карточки подхода, поэтому справочник —
// фундамент всей остальной арифметики.
//
// ВАЖНО про историю: справочник даёт ДЕФОЛТЫ на момент добавления упражнения в
// тренировку. Единица и коэффициент копируются в само упражнение журнала
// (снимок), и дальше тоннаж считается по снимку. Иначе правка коэффициента в
// справочнике задним числом переписала бы уже посчитанные тренировки — это
// изменение истории, прямо запрещённое протоколом (раздел про связки), и ядро
// тоннажа начало бы зависеть от клиентского каталога.
; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const LS_KEY = 'heys_exercise_name_usage_v1';
  const LS_FAV = 'heys_exercise_favorites_v1';
  // Свои упражнения клиента — client-scoped и уезжают в облако (в отличие от
  // частоты и избранного выше: те живут на устройстве и общие для сессии).
  const LS_META = 'heys_exercise_meta_v1';

  /**
   * Фиксированный список групп мышц. Свои названия не заводятся: иначе фильтр
   * каталога и объём по группам рассыпаются (решение владельца 2026-08-09).
   * «Всё тело» здесь нет намеренно — это не группа, а следствие множественного
   * выбора: комплексное движение помечается несколькими группами.
   */
  const MUSCLE_GROUPS = [
    { id: 'chest', label: 'Грудь' },
    { id: 'back', label: 'Спина' },
    { id: 'lower_back', label: 'Поясница' },
    { id: 'traps', label: 'Трапеции' },
    { id: 'shoulders', label: 'Плечи' },
    { id: 'biceps', label: 'Бицепс' },
    { id: 'triceps', label: 'Трицепс' },
    { id: 'forearms', label: 'Предплечья' },
    { id: 'abs', label: 'Пресс' },
    { id: 'quads', label: 'Квадрицепс' },
    { id: 'hamstrings', label: 'Бицепс бедра' },
    { id: 'glutes', label: 'Ягодицы' },
    { id: 'adductors', label: 'Приводящие' },
    { id: 'calves', label: 'Икры' }
  ];

  /**
   * Единица измерения — первое обязательное поле упражнения.
   * volume говорит, во что копится объём: 'tonnage' — килограммы, 'seconds' —
   * секунды под нагрузкой, 'meters' — дистанция. Перемножать килограммы на
   * метры физически бессмысленно, поэтому три величины не смешиваются в одно
   * число; вес при этом записывается всегда — человеку нужен прогресс, даже
   * если тоннажа нет.
   */
  const EXERCISE_UNITS = [
    { id: 'weight_reps', label: 'Вес × повторы', volume: 'tonnage', needsBodyweight: false },
    { id: 'bodyweight', label: 'Свой вес', volume: 'tonnage', needsBodyweight: true },
    { id: 'time', label: 'Время', volume: 'seconds', needsBodyweight: false },
    { id: 'distance', label: 'Расстояние', volume: 'meters', needsBodyweight: false }
  ];

  /**
   * Доля синергистов в объёме по группам: основная группа получает полный вес
   * упражнения, дополнительные — эту долю. Стандартная практика учёта
   * синергистов; параметр справочника, а не константа в потребителях
   * (протокол, раздел «Группы мышц»). Кто им управляет из UI — не решено.
   */
  const SYNERGIST_SHARE = 0.5;

  /**
   * Каталог: имя, основная группа, дополнительные, единица, коэффициент своего
   * веса. Порядок = популярность по умолчанию (rank 1 — самое частое).
   *
   * Коэффициент — физический факт про движение, а не настройка. Где он
   * неизвестен, стоит null: дефолт не выдумываем, такое упражнение считается
   * «без тоннажа» и попадает в итогах в строку «не посчитали». Опорные
   * значения из макета: подтягивания 1,00, брусья 0,95, отжимания 0,64,
   * приседания без веса 0,55, обратные отжимания 0,40.
   */
  const CATALOG_ROWS = [
    ['Жим штанги лёжа', 'chest', ['triceps', 'shoulders'], 'weight_reps', null],
    ['Приседания со штангой', 'quads', ['glutes', 'hamstrings', 'lower_back'], 'weight_reps', null],
    ['Становая тяга', 'back', ['glutes', 'hamstrings', 'lower_back', 'traps'], 'weight_reps', null],
    ['Подтягивания', 'back', ['biceps', 'forearms'], 'bodyweight', 1.0],
    ['Отжимания на брусьях', 'chest', ['triceps', 'shoulders'], 'bodyweight', 0.95],
    ['Жим гантелей лёжа', 'chest', ['triceps', 'shoulders'], 'weight_reps', null],
    ['Армейский жим стоя', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Тяга штанги в наклоне', 'back', ['biceps', 'lower_back'], 'weight_reps', null],
    ['Разведения гантелей лёжа', 'chest', ['shoulders'], 'weight_reps', null],
    ['Подъём штанги на бицепс', 'biceps', ['forearms'], 'weight_reps', null],
    ['Французский жим', 'triceps', [], 'weight_reps', null],
    ['Гиперэкстензия', 'lower_back', ['glutes', 'hamstrings'], 'bodyweight', null],
    ['Планка', 'abs', ['lower_back'], 'time', null],
    ['Скручивания на пресс', 'abs', [], 'bodyweight', null],
    ['Выпады с гантелями', 'quads', ['glutes', 'hamstrings'], 'weight_reps', null],
    ['Жим ногами', 'quads', ['glutes', 'hamstrings'], 'weight_reps', null],
    ['Сведение ног в тренажёре', 'adductors', [], 'weight_reps', null],
    ['Разгибания ног в тренажёре', 'quads', [], 'weight_reps', null],
    ['Сгибания ног лёжа', 'hamstrings', [], 'weight_reps', null],
    ['Икры стоя', 'calves', [], 'weight_reps', null],
    ['Икры сидя', 'calves', [], 'weight_reps', null],
    ['Тяга верхнего блока', 'back', ['biceps', 'forearms'], 'weight_reps', null],
    ['Тяга нижнего блока', 'back', ['biceps'], 'weight_reps', null],
    ['Тяга гантели в наклоне', 'back', ['biceps'], 'weight_reps', null],
    ['Тяга Т-грифа', 'back', ['biceps', 'traps'], 'weight_reps', null],
    ['Шраги со штангой', 'traps', ['forearms'], 'weight_reps', null],
    ['Шраги с гантелями', 'traps', ['forearms'], 'weight_reps', null],
    ['Жим Смита лёжа', 'chest', ['triceps', 'shoulders'], 'weight_reps', null],
    ['Жим Смита сидя', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Жим гантелей сидя', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Жим Arnold', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Махи гантелями в стороны', 'shoulders', [], 'weight_reps', null],
    ['Разведения в кроссовере', 'chest', ['shoulders'], 'weight_reps', null],
    ['Баттерфляй', 'chest', ['shoulders'], 'weight_reps', null],
    ['Отжимания на брусьях с весом', 'chest', ['triceps', 'shoulders'], 'bodyweight', 0.95],
    ['Отжимания от пола', 'chest', ['triceps', 'shoulders'], 'bodyweight', 0.64],
    ['Отжимания узким хватом', 'triceps', ['chest', 'shoulders'], 'bodyweight', 0.64],
    ['Бурпи', 'quads', ['chest', 'shoulders', 'abs'], 'bodyweight', null],
    ['Прыжки на скакалке', 'calves', ['quads'], 'time', null],
    ['Бег на дорожке', 'quads', ['calves', 'hamstrings'], 'time', null],
    ['Велотренажёр', 'quads', ['calves'], 'time', null],
    ['Гребля', 'back', ['quads', 'biceps'], 'time', null],
    ['Скакалка', 'calves', ['quads'], 'time', null],
    ['Приседания с гантелями', 'quads', ['glutes'], 'weight_reps', null],
    ['Гоблет-присед', 'quads', ['glutes', 'abs'], 'weight_reps', null],
    ['Приседания фронтальные', 'quads', ['glutes', 'abs'], 'weight_reps', null],
    ['Выпады в Смите', 'quads', ['glutes'], 'weight_reps', null],
    ['Болгарские выпады', 'quads', ['glutes', 'hamstrings'], 'weight_reps', null],
    ['Ступни на платформу', 'quads', ['glutes'], 'weight_reps', null],
    ['Зашагивания на скамью', 'quads', ['glutes'], 'weight_reps', null],
    ['Мостик ягодичный', 'glutes', ['hamstrings'], 'bodyweight', null],
    ['Ягодичный мост со штангой', 'glutes', ['hamstrings'], 'weight_reps', null],
    ['Обратная гиперэкстензия', 'glutes', ['lower_back', 'hamstrings'], 'bodyweight', null],
    ['Подъёмы на носки в тренажёре', 'calves', [], 'weight_reps', null],
    ['Подъём на пресс для икр', 'calves', [], 'weight_reps', null],
    ['Румынская тяга', 'hamstrings', ['glutes', 'lower_back', 'back'], 'weight_reps', null],
    ['Тяга сумо', 'quads', ['glutes', 'back', 'traps'], 'weight_reps', null],
    ['Тяга Trap bar', 'quads', ['glutes', 'back', 'traps'], 'weight_reps', null],
    ['Пуловер с гантелью', 'back', ['chest', 'triceps'], 'weight_reps', null],
    ['Пуловер в кроссовере', 'back', ['chest', 'triceps'], 'weight_reps', null],
    ['Разводка на заднюю дельту', 'shoulders', ['back'], 'weight_reps', null],
    ['Тяга к подбородку', 'shoulders', ['traps', 'biceps'], 'weight_reps', null],
    ['Face pull', 'shoulders', ['back', 'traps'], 'weight_reps', null],
    ['Жим вверх в тренажёте Смита', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Отведение руки в кроссовере', 'shoulders', [], 'weight_reps', null],
    ['Концентрированный подъём на бицепс', 'biceps', [], 'weight_reps', null],
    ['Молотки', 'biceps', ['forearms'], 'weight_reps', null],
    ['Разгибания рук на трицепс с канатом', 'triceps', [], 'weight_reps', null],
    ['Разгибания руки из-за головы', 'triceps', [], 'weight_reps', null],
    ['Пресс на наклонной скамье', 'abs', [], 'bodyweight', null],
    ['Подъёмы ног в висе', 'abs', ['forearms'], 'bodyweight', null],
    ['Велосипед', 'abs', [], 'bodyweight', null],
    ['Русский скручивание', 'abs', [], 'bodyweight', null],
    ['Дровосек', 'abs', ['shoulders', 'back'], 'weight_reps', null],
    ['Скручивания на ролике', 'abs', ['shoulders'], 'bodyweight', null],
    ['Боковая планка', 'abs', [], 'time', null],
    ['Супермен', 'lower_back', ['glutes'], 'bodyweight', null],
    ['Попеременный подъём гантелей лёжа', 'chest', ['triceps', 'shoulders'], 'weight_reps', null],
    ['Жим узким хватом лёжа', 'triceps', ['chest', 'shoulders'], 'weight_reps', null],
    ['Жим обратным хватом лёжа', 'chest', ['triceps'], 'weight_reps', null],
    ['Отжимания с колен', 'chest', ['triceps', 'shoulders'], 'bodyweight', 0.49],
    ['Австралийские подтягивания', 'back', ['biceps'], 'bodyweight', null],
    ['Подтягивания обратным хватом', 'back', ['biceps'], 'bodyweight', 1.0],
    ['Подтягивания широким хватом', 'back', ['biceps'], 'bodyweight', 1.0],
    ['Гравитрон', 'back', ['biceps'], 'bodyweight', null],
    ['Подтягивания с весом', 'back', ['biceps', 'forearms'], 'bodyweight', 1.0],
    ['Шраги в Смите', 'traps', ['forearms'], 'weight_reps', null],
    ['Upright row', 'shoulders', ['traps', 'biceps'], 'weight_reps', null],
    ['Скамья Скотта', 'biceps', ['forearms'], 'weight_reps', null],
    ['Попеременные сгибания на бицепс', 'biceps', ['forearms'], 'weight_reps', null],
    ['Обратные отжимания от скамьи', 'triceps', ['chest', 'shoulders'], 'bodyweight', 0.4],
    ['Плиометрические отжимания', 'chest', ['triceps', 'shoulders'], 'bodyweight', 0.64],
    ['Приседания с паузой', 'quads', ['glutes', 'hamstrings'], 'weight_reps', null],
    ['Коробчатый присед', 'quads', ['glutes'], 'weight_reps', null],
    ['Сведение рук в тренажёте', 'chest', ['shoulders'], 'weight_reps', null],
    ['Разведение в наклоне', 'shoulders', ['back'], 'weight_reps', null],
    ['Тяга к поясу в тренажёте', 'back', ['biceps'], 'weight_reps', null],
    ['Жим одной рукой гантелью', 'shoulders', ['triceps'], 'weight_reps', null],
    ['Тяга одной рукой в наклоне', 'back', ['biceps'], 'weight_reps', null],
    ['Скручивания на фитболе', 'abs', [], 'bodyweight', null]
  ];

  const exerciseCatalog = CATALOG_ROWS.map(function (row, i) {
    return {
      id: 'excat_' + (i + 1),
      name: row[0],
      rank: i + 1,
      primaryGroup: row[1],
      secondaryGroups: row[2].slice(),
      unit: row[3],
      bodyweightFactor: row[4]
    };
  });

  function normalizeText(s) {
    const fn = HEYS.SmartSearchWithTypos && HEYS.SmartSearchWithTypos.utils && HEYS.SmartSearchWithTypos.utils.normalizeText;
    if (typeof fn === 'function') return fn(String(s || ''));
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ');
  }

  /**
   * Частота и избранное — данные клиента, а не устройства: у куратора с
   * несколькими клиентами общий ключ показывал бы одному чужие подсказки, а при
   * смене телефона всё терялось бы. Пишем через utils (client-scoped, уезжает в
   * облако), читаем с фолбэком на старый глобальный ключ, чтобы уже накопленное
   * не пропало.
   */
  function readScoped(key) {
    const u = HEYS.utils;
    try {
      if (u && typeof u.lsGet === 'function') {
        const o = u.lsGet(key, null);
        if (o && typeof o === 'object') return o;
      }
      const raw = global.localStorage && global.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeScoped(key, obj) {
    const u = HEYS.utils;
    if (!u || typeof u.lsSet !== 'function') return false;
    try {
      u.lsSet(key, obj);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readUsage() {
    return readScoped(LS_KEY) || {};
  }

  function writeUsage(obj) {
    writeScoped(LS_KEY, obj);
  }

  function readFavoriteNormsOrdered() {
    const o = readScoped(LS_FAV);
    const norms = o && Array.isArray(o.norms) ? o.norms : null;
    if (!norms) return [];
    return norms
      .map(function (n) {
        return typeof n === 'string' ? normalizeText(n) : '';
      })
      .filter(Boolean)
      .slice(0, 40);
  }

  function writeFavoriteNorms(norms) {
    writeScoped(LS_FAV, { norms: norms.slice(0, 40) });
  }

  function isFavoriteNorm(norm) {
    const k = normalizeText(norm || '');
    if (!k) return false;
    return readFavoriteNormsOrdered().indexOf(k) >= 0;
  }

  function toggleExerciseFavorite(displayName) {
    const k = normalizeText(displayName || '');
    if (!k) return false;
    let list = readFavoriteNormsOrdered().slice();
    const i = list.indexOf(k);
    if (i >= 0) {
      list.splice(i, 1);
    } else {
      list.unshift(k);
      if (list.length > 40) list = list.slice(0, 40);
    }
    writeFavoriteNorms(list);
    return i < 0;
  }

  function labelForNorm(norm, usageObj, cat) {
    const u = usageObj && usageObj[norm];
    if (u && u.label && String(u.label).trim()) return String(u.label).trim();
    for (let i = 0; i < cat.length; i++) {
      if (cat[i].norm === norm) return cat[i].name;
    }
    return norm;
  }

  function bumpExerciseUsage(displayName) {
    const label = String(displayName || '').trim();
    if (!label) return;
    const key = normalizeText(label);
    if (!key) return;
    const u = readUsage();
    const cur = u[key] || { count: 0, label: label };
    u[key] = { count: (cur.count || 0) + 1, label: label || cur.label };
    writeUsage(u);
  }

  function getExerciseUsageMap() {
    return readUsage();
  }

  function catalogRows() {
    return exerciseCatalog.map(function (it) {
      return {
        id: it.id,
        name: it.name,
        rank: it.rank,
        norm: normalizeText(it.name)
      };
    });
  }

  /** Если SmartSearch ещё не загружен — лёгкий Левенштейн для опечаток в названии. */
  function localLevenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = new Array(m + 1);
    let i;
    let j;
    for (i = 0; i <= m; i++) {
      dp[i] = new Array(n + 1);
      dp[i][0] = i;
    }
    for (j = 0; j <= n; j++) dp[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function usageRows() {
    const u = readUsage();
    return Object.keys(u).map(function (k) {
      const e = u[k];
      const count = e && e.count ? e.count : 0;
      const label = (e && e.label) || k;
      return { norm: k, label: label, count: count };
    }).filter(function (r) {
      return r.count > 0;
    });
  }

  function relevanceScore(norm, q) {
    if (!q) return 1;
    if (norm === q) return 100;
    if (norm.indexOf(q) === 0) return 85;
    if (norm.indexOf(q) >= 0) return 65;
    const parts = norm.split(/\s+/);
    let best = 0;
    for (let i = 0; i < parts.length; i++) {
      const w = parts[i];
      if (w.indexOf(q) === 0) best = Math.max(best, 55);
      else if (w.indexOf(q) >= 0) best = Math.max(best, 45);
    }
    if (best > 0) return best;
    const levFn = HEYS.SmartSearchWithTypos && HEYS.SmartSearchWithTypos.utils && HEYS.SmartSearchWithTypos.utils.levenshteinDistance;
    const lev = typeof levFn === 'function' ? levFn : localLevenshtein;
    if (q.length >= 2 && norm.length >= 2) {
      if (Math.max(q.length, norm.length) <= 16) {
        const d = lev(q, norm);
        if (d <= 2) return 30 - d;
      }
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].length >= 2 && parts[j].length <= 16) {
          const d2 = lev(q, parts[j]);
          if (d2 <= 2) return 28 - d2;
        }
      }
    }
    return 0;
  }

  function lookupRank(norm, cat) {
    for (let i = 0; i < cat.length; i++) {
      if (cat[i].norm === norm) return cat[i].rank;
    }
    return 9999;
  }

  /**
   * @param {string} query
   * @param {number} [limit]
   * @returns {{ name: string, rank: number, norm: string, favorite?: boolean }[]}
   */
  function getExerciseSuggestions(query, limit) {
    const lim = Math.max(1, Math.min(30, limit == null ? 12 : limit));
    const q = normalizeText(query || '');
    const cat = catalogRows();
    const usageList = usageRows();
    const usageObj = readUsage();
    const seen = {};
    const favNorms = readFavoriteNormsOrdered();

    function rowOut(name, norm, rank, favorite) {
      return {
        name: name,
        norm: norm,
        rank: rank,
        favorite: !!favorite || isFavoriteNorm(norm)
      };
    }

    if (!q) {
      const out = [];
      favNorms.forEach(function (fn) {
        if (out.length >= lim) return;
        if (seen[fn]) return;
        seen[fn] = true;
        out.push(rowOut(labelForNorm(fn, usageObj, cat), fn, lookupRank(fn, cat), true));
      });
      usageList.sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return lookupRank(a.norm, cat) - lookupRank(b.norm, cat);
      });
      usageList.forEach(function (u) {
        if (out.length >= lim) return;
        if (seen[u.norm]) return;
        seen[u.norm] = true;
        out.push(rowOut(u.label, u.norm, lookupRank(u.norm, cat)));
      });
      cat.sort(function (a, b) {
        return a.rank - b.rank;
      });
      cat.forEach(function (c) {
        if (out.length >= lim) return;
        if (seen[c.norm]) return;
        seen[c.norm] = true;
        out.push(rowOut(c.name, c.norm, c.rank));
      });
      return out;
    }

    const candidates = [];

    cat.forEach(function (c) {
      const rel = relevanceScore(c.norm, q);
      if (rel <= 0) return;
      const uc = (usageObj[c.norm] && usageObj[c.norm].count) || 0;
      candidates.push({
        name: c.name,
        norm: c.norm,
        rank: c.rank,
        rel: rel,
        usageCount: uc
      });
    });

    usageList.forEach(function (u) {
      const rel = relevanceScore(u.norm, q);
      if (rel <= 0) return;
      if (candidates.some(function (x) { return x.norm === u.norm; })) return;
      candidates.push({
        name: u.label,
        norm: u.norm,
        rank: 9999,
        rel: rel,
        usageCount: u.count
      });
    });

    candidates.sort(function (a, b) {
      const fa = isFavoriteNorm(a.norm) ? 1 : 0;
      const fb = isFavoriteNorm(b.norm) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      if (b.rel !== a.rel) return b.rel - a.rel;
      return a.rank - b.rank;
    });

    return candidates.slice(0, lim).map(function (x) {
      return rowOut(x.name, x.norm, x.rank);
    });
  }

  // ——— Справочник: группы, единица, коэффициент своего веса ———

  const GROUP_IDS = MUSCLE_GROUPS.map(function (g) { return g.id; });
  const UNIT_IDS = EXERCISE_UNITS.map(function (u) { return u.id; });

  function unitById(id) {
    for (let i = 0; i < EXERCISE_UNITS.length; i++) {
      if (EXERCISE_UNITS[i].id === id) return EXERCISE_UNITS[i];
    }
    return null;
  }

  function groupLabel(id) {
    for (let i = 0; i < MUSCLE_GROUPS.length; i++) {
      if (MUSCLE_GROUPS[i].id === id) return MUSCLE_GROUPS[i].label;
    }
    return '';
  }

  /** Свои упражнения клиента: client-scoped через utils, чтобы уехать в облако. */
  function readCustomMeta() {
    return readScoped(LS_META) || {};
  }

  /**
   * Только через utils: свои упражнения обязаны быть client-scoped и уехать в
   * облако. Прямой setItem прошёл бы мимо перехватчика (инвариант №5 в
   * CLAUDE.md) и молча оставил бы каталог на одном устройстве — а он должен
   * пережить смену телефона. Нет utils — честно сообщаем, что не сохранили.
   */
  function writeCustomMeta(obj) {
    return writeScoped(LS_META, obj);
  }

  function normalizeMeta(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const primary = String(raw.primaryGroup || '').trim();
    const secondaryIn = Array.isArray(raw.secondaryGroups) ? raw.secondaryGroups : [];
    const seen = {};
    const secondary = [];
    secondaryIn.forEach(function (g) {
      const id = String(g || '').trim();
      if (!id || id === primary || seen[id]) return;
      seen[id] = true;
      secondary.push(id);
    });
    const unit = String(raw.unit || '').trim();
    let factor = raw.bodyweightFactor;
    if (factor === '' || factor === undefined) factor = null;
    if (factor !== null) {
      factor = parseFloat(String(factor).replace(',', '.'));
      if (!isFinite(factor)) factor = null;
    }
    return {
      primaryGroup: primary,
      secondaryGroups: secondary,
      unit: unit,
      // Коэффициент имеет смысл только у своего веса: у штанги он молча
      // удвоил бы тоннаж, а у времени и метров тоннажа нет вовсе.
      bodyweightFactor: unit === 'bodyweight' ? factor : null
    };
  }

  /**
   * @returns {{ ok: boolean, errors: string[], meta: object|null }}
   * У новых упражнений поля обязательны — отсюда fail-closed: неполная запись
   * не сохраняется, вместо неё человек выбирает «Создать · без тоннажа».
   */
  function validateExerciseMeta(raw) {
    const meta = normalizeMeta(raw);
    const errors = [];
    if (!meta) return { ok: false, errors: ['Запись пустая'], meta: null };
    if (!meta.primaryGroup) errors.push('Не выбрана основная группа мышц');
    else if (GROUP_IDS.indexOf(meta.primaryGroup) < 0) errors.push('Неизвестная основная группа: ' + meta.primaryGroup);
    meta.secondaryGroups.forEach(function (g) {
      if (GROUP_IDS.indexOf(g) < 0) errors.push('Неизвестная дополнительная группа: ' + g);
    });
    if (!meta.unit) errors.push('Не выбрана единица измерения');
    else if (UNIT_IDS.indexOf(meta.unit) < 0) errors.push('Неизвестная единица измерения: ' + meta.unit);
    if (meta.bodyweightFactor !== null && !(meta.bodyweightFactor > 0 && meta.bodyweightFactor <= 2)) {
      errors.push('Коэффициент своего веса вне диапазона 0…2');
    }
    return { ok: errors.length === 0, errors: errors, meta: errors.length === 0 ? meta : null };
  }

  function catalogMetaByNorm(norm) {
    for (let i = 0; i < exerciseCatalog.length; i++) {
      const c = exerciseCatalog[i];
      if (normalizeText(c.name) === norm) {
        return {
          primaryGroup: c.primaryGroup,
          secondaryGroups: c.secondaryGroups.slice(),
          unit: c.unit,
          bodyweightFactor: c.bodyweightFactor,
          source: 'catalog'
        };
      }
    }
    return null;
  }

  /**
   * Справочные данные упражнения по названию: сначала своя запись клиента (она
   * может переопределить каталожную), затем каталог. null — упражнения нет ни
   * там, ни там: заполнить поля должен человек.
   */
  function getExerciseMeta(displayName) {
    const norm = normalizeText(displayName || '');
    if (!norm) return null;
    const custom = readCustomMeta()[norm];
    if (custom) {
      const v = validateExerciseMeta(custom);
      if (v.ok) {
        v.meta.source = 'custom';
        return v.meta;
      }
    }
    return catalogMetaByNorm(norm);
  }

  /** @returns {{ ok: boolean, errors: string[] }} */
  function saveExerciseMeta(displayName, raw) {
    const label = String(displayName || '').trim();
    const norm = normalizeText(label);
    if (!norm) return { ok: false, errors: ['Пустое название упражнения'] };
    const v = validateExerciseMeta(raw);
    if (!v.ok) return { ok: false, errors: v.errors };
    const all = readCustomMeta();
    all[norm] = {
      label: label,
      primaryGroup: v.meta.primaryGroup,
      secondaryGroups: v.meta.secondaryGroups,
      unit: v.meta.unit,
      bodyweightFactor: v.meta.bodyweightFactor
    };
    if (!writeCustomMeta(all)) {
      return { ok: false, errors: ['Хранилище недоступно — упражнение не сохранено'] };
    }
    return { ok: true, errors: [] };
  }

  function removeExerciseMeta(displayName) {
    const norm = normalizeText(displayName || '');
    if (!norm) return false;
    const all = readCustomMeta();
    if (!all[norm]) return false;
    delete all[norm];
    return writeCustomMeta(all);
  }

  /**
   * Снимок справочных полей для упражнения журнала. Тоннаж считается по нему, а
   * не по справочнику: правка коэффициента задним числом не должна переписывать
   * уже проведённые тренировки.
   */
  function exerciseMetaSnapshot(displayName) {
    const meta = getExerciseMeta(displayName);
    if (!meta) return null;
    return {
      primaryGroup: meta.primaryGroup,
      secondaryGroups: meta.secondaryGroups.slice(),
      unit: meta.unit,
      bodyweightFactor: meta.bodyweightFactor
    };
  }

  /** Идёт ли объём упражнения в тоннаж: у времени и метров — нет. */
  function unitCountsAsTonnage(unitId) {
    const u = unitById(unitId);
    return !!u && u.volume === 'tonnage';
  }

  /**
   * Веса групп для объёма по группам: основная получает 1, дополнительные —
   * synergistShare. Доля берётся из справочника параметром, а не зашивается у
   * потребителя.
   */
  function groupWeights(meta, share) {
    const out = {};
    if (!meta || !meta.primaryGroup) return out;
    const s = typeof share === 'number' && isFinite(share) ? share : SYNERGIST_SHARE;
    out[meta.primaryGroup] = 1;
    (meta.secondaryGroups || []).forEach(function (g) {
      if (!g || g === meta.primaryGroup) return;
      out[g] = s;
    });
    return out;
  }

  /**
   * Опоры для вопроса «на что похоже движение»: упражнения с известным
   * коэффициентом. Человек не может ответить, какая доля массы тела приходится
   * на движение, а неверный ответ молча испортит тоннаж навсегда — поэтому
   * коэффициент выбирается по аналогии, а не вводится числом.
   */
  function bodyweightReferences() {
    return exerciseCatalog
      .filter(function (c) { return c.unit === 'bodyweight' && c.bodyweightFactor !== null; })
      .map(function (c) {
        return { name: c.name, norm: normalizeText(c.name), bodyweightFactor: c.bodyweightFactor };
      })
      .sort(function (a, b) {
        if (b.bodyweightFactor !== a.bodyweightFactor) return b.bodyweightFactor - a.bodyweightFactor;
        return a.name.localeCompare(b.name, 'ru');
      });
  }

  /**
   * Канонический набор «на что похоже» для экрана выбора коэффициента: короткий
   * список образцов с подсказками, а не весь каталог bodyweight-упражнений.
   */
  const BODYWEIGHT_SIMILAR_OPTIONS = [
    { key: 'pullups', label: 'Как подтягивания', hint: 'поднимается всё тело', bodyweightFactor: 1.0 },
    { key: 'single_leg_squat', label: 'Как приседания на одной', hint: 'почти всё, ноги на опоре', bodyweightFactor: 0.85 },
    { key: 'pushups_floor', label: 'Как отжимания от пола', hint: 'часть веса на ногах', bodyweightFactor: 0.64 },
    { key: 'crunches', label: 'Как скручивания', hint: 'поднимается корпус', bodyweightFactor: 0.35 },
    { key: 'unknown', label: 'Не знаю', hint: 'упражнение пойдёт без объёма', bodyweightFactor: null, isUnknown: true }
  ];

  function bodyweightSimilarOptions() {
    return BODYWEIGHT_SIMILAR_OPTIONS.map(function (row) {
      return {
        key: row.key,
        label: row.label,
        hint: row.hint,
        bodyweightFactor: row.bodyweightFactor,
        isUnknown: !!row.isUnknown
      };
    });
  }

  function formatBodyweightFactor(factor) {
    const n = parseFloat(String(factor == null ? '' : factor).replace(',', '.'));
    if (!isFinite(n)) return '';
    return n.toFixed(1).replace('.', ',');
  }

  function formatVolumeKg(kg) {
    const n = Math.round(+kg || 0);
    return n.toLocaleString('ru-RU').replace(/\u00A0/g, '\u202F') + ' кг';
  }

  function muscleVolumePreviewRows(tonnageKg, primaryGroup, secondaryGroups, share) {
    if (!(+tonnageKg > 0) || !primaryGroup) return [];
    const weights = groupWeights({
      primaryGroup: primaryGroup,
      secondaryGroups: secondaryGroups || []
    }, share);
    const rows = [];
    Object.keys(weights).forEach(function (groupId) {
      rows.push({
        groupId: groupId,
        label: groupLabel(groupId),
        kg: +tonnageKg * (Number(weights[groupId]) || 0),
        isPrimary: groupId === primaryGroup
      });
    });
    rows.sort(function (a, b) {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return b.kg - a.kg;
    });
    return rows;
  }

  HEYS.exerciseCatalog = exerciseCatalog;
  HEYS.exerciseMeta = {
    bodyweightReferences: bodyweightReferences,
    bodyweightSimilarOptions: bodyweightSimilarOptions,
    formatBodyweightFactor: formatBodyweightFactor,
    formatVolumeKg: formatVolumeKg,
    muscleVolumePreviewRows: muscleVolumePreviewRows,
    groups: MUSCLE_GROUPS,
    units: EXERCISE_UNITS,
    synergistShare: SYNERGIST_SHARE,
    groupLabel: groupLabel,
    unitById: unitById,
    get: getExerciseMeta,
    save: saveExerciseMeta,
    remove: removeExerciseMeta,
    validate: validateExerciseMeta,
    snapshot: exerciseMetaSnapshot,
    countsAsTonnage: unitCountsAsTonnage,
    groupWeights: groupWeights
  };
  HEYS.getExerciseSuggestions = getExerciseSuggestions;
  HEYS.bumpExerciseUsage = bumpExerciseUsage;
  HEYS.getExerciseUsageMap = getExerciseUsageMap;
  HEYS.normalizeExerciseName = normalizeText;
  HEYS.toggleExerciseFavorite = toggleExerciseFavorite;
  HEYS.isExerciseFavoriteNorm = isFavoriteNorm;
})(typeof window !== 'undefined' ? window : globalThis);
