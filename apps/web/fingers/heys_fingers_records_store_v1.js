// heys_fingers_records_store_v1.js — Personal Records (PR) storage.
//
// Хранение max-hang результатов по комбинации хват+зацеп. Hybrid MVC:
// discriminated union {type:'weight'|'time'}.
//
// Public API:
//   HEYS.Fingers.records.get()
//   HEYS.Fingers.records.getMVC(gripId, edgeMm)
//   HEYS.Fingers.records.updateIfPR(gripId, edgeMm, newRecord) → boolean
//   HEYS.Fingers.records.asymmetries() → Array<{ kind, edgeMm, ratio, flag, hint }>
//   HEYS.Fingers.records.byGrade(grade) → { mvcRatio, holdSec, description }
//
// LS-key: `heys_<cid>_fingers_records_v1` (или global если нет cid).
//
// Merge strategy для sync conflict (план «PR Sync Merge Strategy»):
//   max-wins по mvcKg (weight type) или holdTime (time type),
//   tiebreak по testedAt (newer wins).
//
// Lattice golden standards (male, 7s on 20mm edge, two-hand):
//   V5  = 110% BW   (109 ± 12)
//   V7  = 134% BW   (132 ± 14)
//   V9  = 158% BW   (152 ± 16)
//   V11 = 182% BW   (172 ± 18)
//   Источник: latticetraining.com/blog (R=0.704, 49.6% variance)

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.records && Fingers.records.__registered) return;

  function _getKey() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? `heys_${cid}_fingers_records_v1` : 'heys_fingers_records_v1';
  }

  function _readAll() {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(_getKey(), null) || { maxHangs: {}, updatedAt: 0 };
      }
      const raw = localStorage.getItem(_getKey());
      return raw ? JSON.parse(raw) : { maxHangs: {}, updatedAt: 0 };
    } catch (e) {
      console.warn('[Fingers.records] read failed:', e);
      return { maxHangs: {}, updatedAt: 0 };
    }
  }

  function _writeAll(data) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(_getKey(), data);
        return true;
      }
      localStorage.setItem(_getKey(), JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Fingers.records] write failed:', e);
      return false;
    }
  }

  function _slug(gripId, edgeMm) {
    return `${gripId}_${edgeMm}mm`;
  }

  function _eventLog(kind, summary, payload) {
    try {
      if (HEYS.eventLog && typeof HEYS.eventLog.write === 'function') {
        HEYS.eventLog.write(kind, summary, payload || {}, 'fingers');
      }
    } catch (_e) { /* swallow */ }
  }

  function get() {
    return _readAll();
  }

  function getMVC(gripId, edgeMm) {
    const all = _readAll();
    const slug = _slug(gripId, edgeMm);
    return (all.maxHangs && all.maxHangs[slug]) || null;
  }

  /**
   * Returns true если запись обновлена (newer is PR), false иначе.
   * PR comparison: для type='weight' сравниваем mvcKg, для type='time' — holdTime.
   * Tiebreak: equal value + newer testedAt → also wins (re-test confirmation).
   */
  function updateIfPR(gripId, edgeMm, newRecord) {
    if (!gripId || edgeMm == null || !newRecord || typeof newRecord !== 'object') {
      console.warn('[Fingers.records] updateIfPR: invalid args');
      return false;
    }

    const all = _readAll();
    if (!all.maxHangs) all.maxHangs = {};

    const slug = _slug(gripId, edgeMm);
    const existing = all.maxHangs[slug];
    const stamped = Object.assign({}, newRecord, {
      updatedAt: Date.now(),
      testedAt: newRecord.testedAt || new Date().toISOString(),
    });

    let isPR = false;

    if (!existing) {
      isPR = true;
    } else {
      // Type may differ (user switched from no-scale to scale). Always accept newer test.
      if (existing.type !== stamped.type) {
        isPR = true;
      } else if (stamped.type === 'weight') {
        const newVal = Number(stamped.mvcKg) || 0;
        const oldVal = Number(existing.mvcKg) || 0;
        if (newVal > oldVal) isPR = true;
        else if (newVal === oldVal) {
          // Tiebreak by testedAt
          const newT = Date.parse(stamped.testedAt) || 0;
          const oldT = Date.parse(existing.testedAt) || 0;
          if (newT >= oldT) isPR = true;
        }
      } else if (stamped.type === 'time') {
        const newVal = Number(stamped.holdTime) || 0;
        const oldVal = Number(existing.holdTime) || 0;
        if (newVal > oldVal) isPR = true;
        else if (newVal === oldVal) {
          const newT = Date.parse(stamped.testedAt) || 0;
          const oldT = Date.parse(existing.testedAt) || 0;
          if (newT >= oldT) isPR = true;
        }
      }
    }

    // B3: MVC timeseries — фиксируем КАЖДЫЙ тест (не только PR), чтобы строить
    // тренд измеренной силы и ловить регрессии (падение MVC = ранний сигнал
    // перетрена). maxHangs остаётся max-wins PR (backward compat). Кап 100 точек.
    if (!all.history) all.history = {};
    const hist = Array.isArray(all.history[slug]) ? all.history[slug] : [];
    hist.push({
      testedAt: stamped.testedAt,
      type: stamped.type,
      mvcKg: Number(stamped.mvcKg) || null,
      holdTime: Number(stamped.holdTime) || null,
      addedKg: Number(stamped.addedKg) || null,
      bw: Number(stamped.bw) || null,
    });
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    all.history[slug] = hist;

    if (isPR) all.maxHangs[slug] = stamped;
    all.updatedAt = Date.now();
    _writeAll(all);

    // 152-ФЗ: mvcKg/holdTime/addedKg — health_data, категория «физическая
    // активность» (privacy policy раздел 5.1). В eventLog payload нельзя —
    // SAFE_PAYLOAD_KEYS (heys_event_log_v1.js:38-50) фильтрует их на '<filtered>'.
    // В основной storage (этот файл, _writeAll выше) — пишутся by design:
    // синкаются в client_kv_store на серверах Yandex.Cloud РФ (см. privacy 6.2/7.2)
    // через generic sync interceptor (isOurKey пропускает префикс heys_, denylist
    // их не исключает). dayv2-канал с тем же addedWeightKg в fingersLog.exercises[]
    // покрыт server-side encryption через is_health_key() regex; records_v1 пока
    // нет — это осознанное состояние, см. план spicy-wibbling-tulip.md B17′ (A).
    // Здесь логируем только safe keys.
    if (isPR) _eventLog('finger-pr-update', `PR for ${slug}`, { source: stamped.source });

    return isPR;
  }

  /**
   * B3: тренд ИЗМЕРЕННОЙ силы по grip+edge (в отличие от planned-веса в Progress).
   * Точки {testedAt, mvcKg, holdTime, strengthRatio} по возрастанию времени.
   * strengthRatio = mvcKg/bw — единая шкала силы-к-весу (как GRADE_TABLE.mvcRatio),
   * корректная для изометрии. Сознательно НЕ e1RM: 1-rep-max — экстраполяция
   * динамического лифта, для изометрического виса не валидна; strength-to-BW —
   * established climbing-метрика (Lattice/Hörst).
   */
  function getMvcHistory(gripId, edgeMm) {
    const all = _readAll();
    const slug = _slug(gripId, edgeMm);
    const hist = (all.history && Array.isArray(all.history[slug])) ? all.history[slug] : [];
    return hist.map(function (p) {
      const mvc = Number(p.mvcKg) || null;
      const bw = Number(p.bw) || null;
      return {
        testedAt: p.testedAt,
        mvcKg: mvc,
        holdTime: Number(p.holdTime) || null,
        strengthRatio: (mvc && bw) ? Number((mvc / bw).toFixed(3)) : null,
      };
    }).sort(function (a, b) { return (Date.parse(a.testedAt) || 0) - (Date.parse(b.testedAt) || 0); });
  }

  /**
   * Анализирует ratio между разными хватами/руками. Возвращает массив flags
   * с предупреждениями (для UI badge «асимметрия!»).
   *
   * Известные индикаторы:
   *  - openhand vs half_crimp: нормальный ratio ~0.85-1.05 (half crimp обычно
   *    чуть сильнее). Если openhand > 1.15× crimp → недоразвитый crimp.
   *  - left vs right hand (если grip имеет _L/_R suffix): ratio >1.15 → asymmetry.
   */
  function asymmetries() {
    const all = _readAll();
    const flags = [];
    const records = all.maxHangs || {};

    // Group by edge size
    const byEdge = {};
    Object.keys(records).forEach((slug) => {
      const r = records[slug];
      const m = /^(.+?)_(\d+)mm$/.exec(slug);
      if (!m) return;
      const [, gripId, edgeStr] = m;
      const edgeMm = Number(edgeStr);
      if (!byEdge[edgeMm]) byEdge[edgeMm] = {};
      byEdge[edgeMm][gripId] = r;
    });

    Object.keys(byEdge).forEach((edgeMm) => {
      const e = Number(edgeMm);
      const grips = byEdge[edgeMm];

      // Open vs half crimp (any variant on same edge)
      const openhand = grips.openhand4 || grips.openhand3 || grips.openhand;
      const halfcrimp = grips.halfcrimp4 || grips.halfcrimp;
      if (openhand && halfcrimp) {
        const oVal = Number(openhand.mvcKg || openhand.holdTime) || 0;
        const hVal = Number(halfcrimp.mvcKg || halfcrimp.holdTime) || 0;
        if (hVal > 0) {
          const ratio = oVal / hVal;
          if (ratio > 1.15) {
            flags.push({
              kind: 'crimp_weak',
              edgeMm: e,
              ratio: Number(ratio.toFixed(2)),
              flag: 'warning',
              hint: 'Половинный хват заметно слабее открытого — стоит добавить целевые подходы на crimp (но осторожно, риск выше).',
            });
          } else if (ratio < 0.7) {
            flags.push({
              kind: 'openhand_weak',
              edgeMm: e,
              ratio: Number(ratio.toFixed(2)),
              flag: 'info',
              hint: 'Открытый хват слабее половинного — необычно, проверь технику открытого виса.',
            });
          }
        }
      }

      // Left vs right (suffix _L / _R)
      Object.keys(grips).forEach((gripId) => {
        if (gripId.endsWith('_L')) {
          const base = gripId.slice(0, -2);
          const right = grips[`${base}_R`];
          const left = grips[gripId];
          if (right) {
            const lVal = Number(left.mvcKg || left.holdTime) || 0;
            const rVal = Number(right.mvcKg || right.holdTime) || 0;
            const min = Math.min(lVal, rVal);
            const max = Math.max(lVal, rVal);
            if (min > 0 && max / min > 1.15) {
              flags.push({
                kind: 'lr_asymmetry',
                edgeMm: e,
                ratio: Number((max / min).toFixed(2)),
                flag: 'warning',
                hint: `Разница между руками >15% (${base}). Один-рук подходы на слабую руку.`,
              });
            }
          }
        }
      });
    });

    return flags;
  }

  // Lattice male golden standards (% BW additional weight at 7s on 20mm two-hand)
  const GRADE_TABLE = {
    V3: { mvcRatio: 0.85, holdSec: 7, description: 'Beginner — BW only, едва держит 7с' },
    V5: { mvcRatio: 1.10, holdSec: 7, description: 'Intermediate — +10% BW' },
    V7: { mvcRatio: 1.34, holdSec: 7, description: 'Advanced — +34% BW' },
    V9: { mvcRatio: 1.58, holdSec: 7, description: 'Elite — +58% BW' },
    V11: { mvcRatio: 1.82, holdSec: 7, description: 'World-class — +82% BW' },
  };

  function byGrade(grade) {
    const key = String(grade || '').toUpperCase();
    return GRADE_TABLE[key] || null;
  }

  Fingers.records = {
    get,
    getMVC,
    getMvcHistory,
    updateIfPR,
    asymmetries,
    byGrade,
    GRADE_TABLE: Object.freeze(Object.assign({}, GRADE_TABLE)),
    __registered: true,
    __getKey: _getKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
