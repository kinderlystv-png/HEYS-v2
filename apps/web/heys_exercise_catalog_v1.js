// heys_exercise_catalog_v1.js — каталог упражнений для конструктора силовой + подсказки и частота (LS)
; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const LS_KEY = 'heys_exercise_name_usage_v1';
  const LS_FAV = 'heys_exercise_favorites_v1';

  /** Порядок = популярность по умолчанию (rank 1 — самое частое в каталоге). */
  const RAW_NAMES = [
    'Жим штанги лёжа',
    'Приседания со штангой',
    'Становая тяга',
    'Подтягивания',
    'Отжимания на брусьях',
    'Жим гантелей лёжа',
    'Армейский жим стоя',
    'Тяга штанги в наклоне',
    'Разведения гантелей лёжа',
    'Подъём штанги на бицепс',
    'Французский жим',
    'Гиперэкстензия',
    'Планка',
    'Скручивания на пресс',
    'Выпады с гантелями',
    'Жим ногами',
    'Сведение ног в тренажёре',
    'Разгибания ног в тренажёре',
    'Сгибания ног лёжа',
    'Икры стоя',
    'Икры сидя',
    'Тяга верхнего блока',
    'Тяга нижнего блока',
    'Тяга гантели в наклоне',
    'Тяга Т-грифа',
    'Шраги со штангой',
    'Шраги с гантелями',
    'Жим Смита лёжа',
    'Жим Смита сидя',
    'Жим гантелей сидя',
    'Жим Arnold',
    'Махи гантелями в стороны',
    'Разведения в кроссовере',
    'Баттерфляй',
    'Отжимания на брусьях с весом',
    'Отжимания от пола',
    'Отжимания узким хватом',
    'Бурпи',
    'Прыжки на скакалке',
    'Бег на дорожке',
    'Велотренажёр',
    'Гребля',
    'Скакалка',
    'Приседания с гантелями',
    'Гоблет-присед',
    'Приседания фронтальные',
    'Выпады в Смите',
    'Болгарские выпады',
    'Ступни на платформу',
    'Зашагивания на скамью',
    'Мостик ягодичный',
    'Ягодичный мост со штангой',
    'Обратная гиперэкстензия',
    'Подъёмы на носки в тренажёре',
    'Подъём на пресс для икр',
    'Румынская тяга',
    'Тяга сумо',
    'Тяга Trap bar',
    'Пуловер с гантелью',
    'Пуловер в кроссовере',
    'Разводка на заднюю дельту',
    'Тяга к подбородку',
    'Face pull',
    'Жим вверх в тренажёте Смита',
    'Отведение руки в кроссовере',
    'Концентрированный подъём на бицепс',
    'Молотки',
    'Разгибания рук на трицепс с канатом',
    'Разгибания руки из-за головы',
    'Пресс на наклонной скамье',
    'Подъёмы ног в висе',
    'Велосипед',
    'Русский скручивание',
    'Дровосек',
    'Скручивания на ролике',
    'Боковая планка',
    'Супермен',
    'Попеременный подъём гантелей лёжа',
    'Жим узким хватом лёжа',
    'Жим обратным хватом лёжа',
    'Отжимания с колен',
    'Австралийские подтягивания',
    'Подтягивания обратным хватом',
    'Подтягивания широким хватом',
    'Гравитрон',
    'Подтягивания с весом',
    'Шраги в Смите',
    'Upright row',
    'Скамья Скотта',
    'Попеременные сгибания на бицепс',
    'Обратные отжимания от скамьи',
    'Плиометрические отжимания',
    'Приседания с паузой',
    'Коробчатый присед',
    'Сведение рук в тренажёте',
    'Разведение в наклоне',
    'Тяга к поясу в тренажёте',
    'Жим одной рукой гантелью',
    'Тяга одной рукой в наклоне',
    'Скручивания на фитболе'
  ];

  const exerciseCatalog = RAW_NAMES.map(function (name, i) {
    return {
      id: 'excat_' + (i + 1),
      name: name,
      rank: i + 1
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

  function readUsage() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeUsage(obj) {
    try {
      if (global.localStorage) global.localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (e) { /* quota */ }
  }

  function readFavoriteNormsOrdered() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(LS_FAV);
      if (!raw) return [];
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return [];
      const norms = o.norms;
      if (!Array.isArray(norms)) return [];
      return norms
        .map(function (n) {
          return typeof n === 'string' ? normalizeText(n) : '';
        })
        .filter(Boolean)
        .slice(0, 40);
    } catch (e) {
      return [];
    }
  }

  function writeFavoriteNorms(norms) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(LS_FAV, JSON.stringify({ norms: norms.slice(0, 40) }));
      }
    } catch (e) { /* quota */ }
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

  HEYS.exerciseCatalog = exerciseCatalog;
  HEYS.getExerciseSuggestions = getExerciseSuggestions;
  HEYS.bumpExerciseUsage = bumpExerciseUsage;
  HEYS.getExerciseUsageMap = getExerciseUsageMap;
  HEYS.normalizeExerciseName = normalizeText;
  HEYS.toggleExerciseFavorite = toggleExerciseFavorite;
  HEYS.isExerciseFavoriteNorm = isFavoriteNorm;
})(typeof window !== 'undefined' ? window : globalThis);
