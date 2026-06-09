// heys_fingers_progression_v1.js — B3: прогрессия / детектор плато (Шаг §1.2/§1.3).
//
// Strangler-чейн: атом → блок → сессия → **прогрессия** (новое звено). Чистая
// логика без side-эффектов: caller передаёт series метрики качества → модуль
// возвращает {hasPlateau, nextAxis, action} по контракту с методологом.
//
// Public API:
//   HEYS.Fingers.progression.detectPlateau({series, windowSessions, threshold})
//     → {hasPlateau, sessionsCount, deltaPct, reason}
//   HEYS.Fingers.progression.nextAxis(quality, currentAxis)
//     → {nextAxis, exhausted, policy}
//   HEYS.Fingers.progression.suggestProgression({quality, currentAxis, series, ...})
//     → {action: 'keep'|'switch'|'exhausted', currentAxis, nextAxis, plateau, policy}
//
// Контракт (METHODOLOGY §1.2/§1.3, IMPLEMENTATION_MAP карточки 1.2/1.3):
//   1. Оси прогрессии по убыванию безопасности:
//        volume(1) < density(2) < edge(3) < load(4) < speed(5)
//      Не прыгать на тяжёлую ось пока не исчерпана текущая.
//   2. Per-quality policy (упорядоченный список применимых осей):
//        finger_strength = volume → edge → load
//        max_strength    = volume → edge → load
//        anaerobic_capacity = volume → density
//        aerobic_base    = volume → density
//        power           = volume → speed
//   3. Критерий плато: нет прироста ключевой метрики за N сессий (default 3,
//      Q-1.3-1: 2–3 нед / 3+ сессий, tunable).
//   4. Жёсткое ограничение: переключение оси НЕ снимает S4 (FTL ≤10%/нед),
//      danger-кап и prereq-гейты. Модуль выдаёт только «какую ось менять»,
//      проверки нагрузки делает sessionBuilder/S4 на следующей сборке.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.progression && Fingers.progression.__registered) return;

  // Безопасностный ранг осей (METHODOLOGY §1.2 M1).
  const AXIS_RANK = Object.freeze({
    volume: 1, density: 2, edge: 3, load: 4, speed: 5
  });

  // Per-quality policy — упорядоченный список применимых осей.
  // Источник: METHODOLOGY §1.2 + IMPLEMENTATION_MAP карточка 1.2 M1.
  // Технико-навыковые качества (technique/mental) — только volume (объём
  // практики); добавочный вес/edge/density на них не транслируется.
  const PROGRESSION_POLICY = Object.freeze({
    finger_strength:    ['volume', 'edge', 'load'],
    max_strength:       ['volume', 'edge', 'load'],
    aerobic_base:       ['volume', 'density'],
    anaerobic_capacity: ['volume', 'density'],
    capacity:           ['volume', 'density'],
    power:              ['volume', 'speed'],
    technique:          ['volume'],
    antagonist:         ['volume'],
    mobility:           ['volume'],
    mental:             ['volume'],
  });

  // Default window для плато (Q-1.3-1: 2-3 нед / 3+ сессий, tunable).
  const DEFAULT_WINDOW_SESSIONS = 3;

  function _num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  /**
   * Детектор плато: нет прироста ключевой метрики качества за окно сессий.
   *
   * @param {Object} opts
   * @param {Array<{ts:number, value:number}>} opts.series — История метрики
   *   качества по сессиям, отсортированная по ts ASC (старое → новое).
   * @param {number} [opts.windowSessions=3] — Размер окна.
   * @param {number} [opts.improvementThreshold=0] — Минимальный относительный
   *   прирост (доля; 0 = «любой прирост считается»). При delta ≤ threshold
   *   фиксируется плато.
   * @returns {{
   *   hasPlateau: boolean,
   *   sessionsCount: number,
   *   deltaPct: number|null,
   *   reason: string
   * }}
   */
  function detectPlateau(opts) {
    const o = opts || {};
    const series = Array.isArray(o.series) ? o.series : [];
    const win = Math.max(2, _num(o.windowSessions) || DEFAULT_WINDOW_SESSIONS);
    const threshold = _num(o.improvementThreshold);
    const thr = threshold !== null ? threshold : 0;

    if (series.length < win) {
      return {
        hasPlateau: false,
        sessionsCount: series.length,
        deltaPct: null,
        reason: 'недостаточно данных (<' + win + ' сессий)'
      };
    }

    const window = series.slice(-win);
    const first = _num(window[0] && window[0].value);
    const last = _num(window[window.length - 1] && window[window.length - 1].value);

    if (first === null || first <= 0 || last === null) {
      return {
        hasPlateau: false,
        sessionsCount: window.length,
        deltaPct: null,
        reason: 'невалидные значения метрики в окне'
      };
    }

    const delta = (last - first) / first;
    const hasPlateau = delta <= thr;
    return {
      hasPlateau: hasPlateau,
      sessionsCount: window.length,
      deltaPct: delta * 100,
      reason: hasPlateau
        ? 'нет прироста за ' + window.length + ' сессий (' + (delta * 100).toFixed(1) + '%)'
        : 'прирост ' + (delta * 100).toFixed(1) + '% за ' + window.length + ' сессий'
    };
  }

  /**
   * Следующая ось прогрессии для качества (по policy).
   * Если currentAxis отсутствует в policy — возвращаем первую ось policy
   * (стартовое предложение: всегда начинаем с volume).
   *
   * @param {string} quality — id качества (atom.quality).
   * @param {string} [currentAxis] — текущая ось прогрессии.
   * @returns {{ nextAxis: string|null, exhausted: boolean, policy: string[] }}
   */
  function nextAxis(quality, currentAxis) {
    const policy = PROGRESSION_POLICY[quality] || ['volume'];
    if (!currentAxis) {
      return { nextAxis: policy[0], exhausted: false, policy: policy };
    }
    const idx = policy.indexOf(currentAxis);
    if (idx < 0) {
      return { nextAxis: policy[0], exhausted: false, policy: policy };
    }
    if (idx + 1 >= policy.length) {
      return { nextAxis: null, exhausted: true, policy: policy };
    }
    return { nextAxis: policy[idx + 1], exhausted: false, policy: policy };
  }

  /**
   * Подсказка по прогрессии: «keep», «switch» или «exhausted».
   *
   * @param {Object} opts
   * @param {string} opts.quality
   * @param {string} [opts.currentAxis]
   * @param {Array<{ts, value}>} opts.series
   * @param {number} [opts.windowSessions]
   * @param {number} [opts.improvementThreshold]
   * @returns {{
   *   action: 'keep'|'switch'|'exhausted',
   *   currentAxis: string|null,
   *   nextAxis: string|null,
   *   plateau: object,
   *   policy: string[]
   * }}
   */
  function suggestProgression(opts) {
    const o = opts || {};
    const policy = PROGRESSION_POLICY[o.quality] || ['volume'];
    const plateau = detectPlateau({
      series: o.series,
      windowSessions: o.windowSessions,
      improvementThreshold: o.improvementThreshold
    });

    if (!plateau.hasPlateau) {
      return {
        action: 'keep',
        currentAxis: o.currentAxis || null,
        nextAxis: null,
        plateau: plateau,
        policy: policy
      };
    }

    const next = nextAxis(o.quality, o.currentAxis);
    if (next.exhausted) {
      return {
        action: 'exhausted',
        currentAxis: o.currentAxis || null,
        nextAxis: null,
        plateau: plateau,
        policy: policy
      };
    }
    return {
      action: 'switch',
      currentAxis: o.currentAxis || null,
      nextAxis: next.nextAxis,
      plateau: plateau,
      policy: policy
    };
  }

  Fingers.progression = {
    detectPlateau: detectPlateau,
    nextAxis: nextAxis,
    suggestProgression: suggestProgression,
    AXIS_RANK: AXIS_RANK,
    POLICY: PROGRESSION_POLICY,
    DEFAULT_WINDOW_SESSIONS: DEFAULT_WINDOW_SESSIONS,
    __registered: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
