// pi_conflict_resolver.js — R-INS-2C
// Разрешение конфликтов между pattern-based рекомендациями.
//
// Проблема (агент A audit):
//   STRESS_EATING pattern → "ешь больше углеводов" (для серотонина)
//   ADDED_SUGAR_DEPENDENCY pattern → "избегай быстрых углеводов"
//   → одновременно показываются юзеру → confusing.
//
// Решение: resolveConflicts(adviceArray, profile) =
//   1. group by domain × direction (P8: не только domain — учитываем timing/quality)
//   2. для каждой группы с conflicting direction — выбрать winner по precedence
//      (phenotype > pattern.confidence > severity)
//   3. deduplicate identical advice (Levenshtein similarity > 0.8)
//
// Каждый advice OБЪЕКТ должен иметь:
//   { id, text, domain, direction, severity, confidence, source, ... }
//   - domain: 'protein' | 'sleep' | 'carbs' | 'stress' | 'hydration' | 'activity' | ...
//   - direction: 'increase' | 'decrease' | 'timing' | 'quality'
//   - severity: 'high' | 'medium' | 'low'
//   - confidence: 0..1
//   - source: 'pattern:C09' | 'phenotype' | 'ews:PROTEIN_DEFICIT' | ...
//
// Source-based precedence:
//   phenotype > pattern (high confidence) > pattern (low confidence) > ews

(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};

  // Кэш Levenshtein для одной resolve-сессии (внутри useMemo на UI стороне)
  const SIMILARITY_THRESHOLD = 0.8; // P8: > 0.8 → дубликаты

  /**
   * Levenshtein distance — стандартный DP алгоритм.
   * O(m*n) по времени и памяти.
   */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,        // insertion
          prev[j] + 1,            // deletion
          prev[j - 1] + cost      // substitution
        );
      }
      // swap
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }

  /**
   * Similarity 0..1 на основе Levenshtein.
   * 1.0 = идентичные строки, 0 = совершенно разные.
   */
  function similarity(a, b) {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const dist = levenshtein(a.toLowerCase().trim(), b.toLowerCase().trim());
    return 1 - dist / maxLen;
  }

  /**
   * Compute precedence score для tie-break (выше = главнее).
   * P9: phenotype > pattern.confidence > severity.
   */
  function precedenceScore(advice) {
    if (!advice || typeof advice !== 'object') return 0;
    let score = 0;

    // Source priority (top tier)
    const source = advice.source || '';
    if (source.startsWith('phenotype')) score += 1000;
    else if (source.startsWith('ews:')) score += 500;
    else if (source.startsWith('pattern:')) score += 100;

    // Confidence (0..200)
    const conf = typeof advice.confidence === 'number' ? advice.confidence : 0.5;
    score += Math.round(conf * 200);

    // Severity (50/30/10)
    const sevMap = { high: 50, medium: 30, low: 10 };
    score += sevMap[advice.severity] || 10;

    return score;
  }

  /**
   * Group conflicting advice by domain × direction.
   * Возвращает Map<key, advice[]>.
   */
  function groupByDomainDirection(adviceArray) {
    const groups = new Map();
    for (const advice of adviceArray) {
      if (!advice || !advice.domain) continue;
      const direction = advice.direction || 'unspecified';
      const key = `${advice.domain}::${direction}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(advice);
    }
    return groups;
  }

  /**
   * Detect conflicts: domain группы где есть и increase И decrease одновременно.
   * Возвращает Set<domain> где есть conflict.
   */
  function detectDomainConflicts(adviceArray) {
    const directionsByDomain = new Map();
    for (const advice of adviceArray) {
      if (!advice || !advice.domain || !advice.direction) continue;
      if (advice.direction !== 'increase' && advice.direction !== 'decrease') continue;
      if (!directionsByDomain.has(advice.domain)) directionsByDomain.set(advice.domain, new Set());
      directionsByDomain.get(advice.domain).add(advice.direction);
    }
    const conflicts = new Set();
    for (const [domain, dirs] of directionsByDomain) {
      if (dirs.has('increase') && dirs.has('decrease')) conflicts.add(domain);
    }
    return conflicts;
  }

  /**
   * Apply phenotype-based override для conflict.
   * Например, для domain=carbs:
   *   insulin_resistant → favor 'decrease'
   *   нет фенотипа → use precedence score
   */
  function phenotypeOverrideForDomain(domain, profile) {
    if (!profile || !profile.phenotype) return null;
    const ph = profile.phenotype;
    if (domain === 'carbs') {
      if (ph.metabolic === 'insulin_resistant') return 'decrease';
      if (ph.metabolic === 'insulin_sensitive') return 'increase';
    }
    if (domain === 'protein') {
      if (ph.satiety === 'low_satiety' || ph.metabolic === 'insulin_resistant') return 'increase';
    }
    if (domain === 'sleep') {
      if (ph.circadian === 'evening') return null; // не сдвигать сон у evening
      if (ph.stress === 'stress_eater') return 'increase'; // больше сна снижает стресс
    }
    if (domain === 'stress') {
      if (ph.stress === 'stress_eater') return 'decrease';
    }
    return null;
  }

  /**
   * Главная функция: resolveConflicts.
   * Возвращает очищенный массив advice без conflicts и duplicates.
   */
  function resolveConflicts(adviceArray, profile) {
    if (!Array.isArray(adviceArray) || adviceArray.length === 0) return [];

    // Фильтр: убрать null/undefined и без обязательных полей
    let cleaned = adviceArray.filter(a => a && a.text);

    // Шаг 1: Detect domain-level conflicts (increase vs decrease)
    const conflictDomains = detectDomainConflicts(cleaned);
    if (conflictDomains.size > 0) {
      const winnersOnly = [];
      const groupedByDomain = new Map();
      for (const advice of cleaned) {
        const dom = advice.domain || '__nodomain__';
        if (!groupedByDomain.has(dom)) groupedByDomain.set(dom, []);
        groupedByDomain.get(dom).push(advice);
      }
      for (const [domain, items] of groupedByDomain) {
        if (!conflictDomains.has(domain)) {
          // нет конфликта в этом domain — добавить всё
          for (const a of items) winnersOnly.push(a);
          continue;
        }
        // CONFLICT: выбрать direction по phenotype override или precedence
        const override = phenotypeOverrideForDomain(domain, profile);
        let winningDirection;
        if (override) {
          winningDirection = override;
        } else {
          // Precedence: для каждого direction найти max precedence, выбрать direction с max
          const byDir = new Map();
          for (const a of items) {
            const d = a.direction || 'unspecified';
            const score = precedenceScore(a);
            if (!byDir.has(d) || byDir.get(d) < score) byDir.set(d, score);
          }
          let bestScore = -1;
          for (const [d, s] of byDir) {
            if ((d === 'increase' || d === 'decrease') && s > bestScore) {
              bestScore = s;
              winningDirection = d;
            }
          }
        }
        // Оставляем все advice c winning direction + те что не increase/decrease (timing, quality)
        for (const a of items) {
          const d = a.direction || 'unspecified';
          if (d === winningDirection || (d !== 'increase' && d !== 'decrease')) {
            winnersOnly.push(a);
          }
        }
      }
      cleaned = winnersOnly;
    }

    // Шаг 2: Dedupe identical advice (Levenshtein > 0.8) — оставляем тот что с большим precedence
    const result = [];
    for (const advice of cleaned) {
      let merged = false;
      for (let i = 0; i < result.length; i++) {
        if (similarity(result[i].text, advice.text) >= SIMILARITY_THRESHOLD) {
          // Дубликат — оставить тот что с большим precedence
          if (precedenceScore(advice) > precedenceScore(result[i])) {
            result[i] = advice;
          }
          merged = true;
          break;
        }
      }
      if (!merged) result.push(advice);
    }

    // Финал: sort by precedence descending
    result.sort((a, b) => precedenceScore(b) - precedenceScore(a));
    return result;
  }

  HEYS.InsightsPI.conflictResolver = {
    resolveConflicts,
    // exposed for testing
    _internals: {
      levenshtein,
      similarity,
      precedenceScore,
      detectDomainConflicts,
      phenotypeOverrideForDomain
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
