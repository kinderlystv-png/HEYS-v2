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
//   HEYS.Fingers.records.progressionSnapshot() → { recordsByQuality, currentAxes } | null
//   HEYS.Fingers.records.recordProgressionSession(fingersLog) → boolean
//   HEYS.Fingers.records.saveProgressionAxis(quality, axis) → boolean
//   HEYS.Fingers.records.saveAssessmentBattery(rawResults, opts?) → normalized
//   HEYS.Fingers.records.loadAssessmentBattery() → { [testId]: result }
//   HEYS.Fingers.records.assessLatestBattery(level) → AssessResult | null
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

  function _kernelRecords() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.records;
  }
  function _kernelRunner() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.runner;
  }

  let injectedStorage = null;
  let injectedGetClientId = null;

  function configure(opts) {
    const o = opts || {};
    if (Object.prototype.hasOwnProperty.call(o, 'storage')) {
      injectedStorage = o.storage && typeof o.storage.getItem === 'function' ? o.storage : null;
    }
    if (Object.prototype.hasOwnProperty.call(o, 'getClientId')) {
      injectedGetClientId = typeof o.getClientId === 'function' ? o.getClientId : null;
    }
    return recordsApi;
  }

  function _storage() {
    return injectedStorage || global.localStorage || null;
  }

  function _clientId() {
    if (injectedGetClientId) {
      try { return injectedGetClientId() || ''; } catch (_e) { return ''; }
    }
    return (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
  }

  function _adapter() {
    const kr = _kernelRecords();
    if (!kr || typeof kr.createStoreAdapter !== 'function') return null;
    return kr.createStoreAdapter({
      prefix: 'fingers_records_v1',
      style: 'heys-client-prefix',
      empty: _emptyRecords,
      storage: _storage(),
      getClientId: _clientId
    });
  }

  function _emptyRecords() {
    return { maxHangs: {}, updatedAt: 0 };
  }

  function _getKey() {
    const a = _adapter();
    if (a) return a.key(_clientId());
    const cid = _clientId();
    return cid ? `heys_${cid}_fingers_records_v1` : 'heys_fingers_records_v1';
  }

  function _readAll() {
    try {
      const storage = _storage();
      const a = _adapter();
      if (injectedStorage) {
        if (a) return a.load(_clientId(), storage);
        const raw = storage.getItem(_getKey());
        return raw ? JSON.parse(raw) : _emptyRecords();
      }
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(_getKey(), null) || _emptyRecords();
      }
      if (a) return a.load(_clientId(), storage);
      const raw = localStorage.getItem(_getKey());
      return raw ? JSON.parse(raw) : _emptyRecords();
    } catch (e) {
      console.warn('[Fingers.records] read failed:', e);
      return _emptyRecords();
    }
  }

  function _writeAll(data) {
    try {
      const storage = _storage();
      const a = _adapter();
      if (injectedStorage) {
        if (a) return a.save(_clientId(), data, storage);
        storage.setItem(_getKey(), JSON.stringify(data));
        return true;
      }
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(_getKey(), data);
        return true;
      }
      if (a) return a.save(_clientId(), data, storage);
      localStorage.setItem(_getKey(), JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Fingers.records] write failed:', e);
      return false;
    }
  }

  function _slug(gripId, edgeMm) {
    const kr = _kernelRecords();
    if (kr && kr.makeId) return kr.makeId([gripId, edgeMm + 'mm']);
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

    const kr = _kernelRecords();
    let isPR = kr && kr.maxWins
      ? kr.maxWins(existing, stamped, { metricsByType: { weight: 'mvcKg', time: 'holdTime' } })
      : false;
    if (!kr || !kr.maxWins) {
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
    }

    // B3: MVC timeseries — фиксируем КАЖДЫЙ тест (не только PR), чтобы строить
    // тренд измеренной силы и ловить регрессии (падение MVC = ранний сигнал
    // перетрена). maxHangs остаётся max-wins PR (backward compat). Кап 100 точек.
    if (!all.history) all.history = {};
    const hist = Array.isArray(all.history[slug]) ? all.history[slug] : [];
    const point = {
      testedAt: stamped.testedAt,
      type: stamped.type,
      mvcKg: Number(stamped.mvcKg) || null,
      holdTime: Number(stamped.holdTime) || null,
      addedKg: Number(stamped.addedKg) || null,
      bw: Number(stamped.bw) || null,
    };
    if (kr && kr.appendCapped) kr.appendCapped(hist, point, 100);
    else {
      hist.push(point);
      if (hist.length > 100) hist.splice(0, hist.length - 100);
    }
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
    const rows = hist.map(function (p) {
      const mvc = Number(p.mvcKg) || null;
      const bw = Number(p.bw) || null;
      return {
        testedAt: p.testedAt,
        mvcKg: mvc,
        holdTime: Number(p.holdTime) || null,
        strengthRatio: (mvc && bw) ? Number((mvc / bw).toFixed(3)) : null,
      };
    });
    const kr = _kernelRecords();
    return kr && kr.sortByTimestamp
      ? kr.sortByTimestamp(rows, { timestampKey: 'testedAt' })
      : rows.sort(function (a, b) { return (Date.parse(a.testedAt) || 0) - (Date.parse(b.testedAt) || 0); });
  }

  function _progressionPoint(p) {
    if (!p || typeof p !== 'object') return null;
    const ts = Date.parse(p.testedAt);
    if (!isFinite(ts) || ts <= 0) return null;
    const mvc = Number(p.mvcKg) || null;
    const bw = Number(p.bw) || null;
    const ratio = (mvc && bw) ? mvc / bw : null;
    const hold = Number(p.holdTime) || null;
    const value = ratio || mvc || hold;
    if (!(value > 0)) return null;
    return { ts: ts, value: Number(value.toFixed(4)) };
  }

  function _historySeries(hist) {
    const kr = _kernelRecords();
    if (kr && kr.mapTimeSeries) {
      return kr.mapTimeSeries(hist, _progressionPoint, { valueKey: 'value' });
    }
    return (Array.isArray(hist) ? hist : [])
      .map(_progressionPoint)
      .filter(Boolean)
      .sort(function (a, b) { return a.ts - b.ts; });
  }

  const FALLBACK_PROGRESSION_POLICY = Object.freeze({
    finger_strength: ['volume', 'edge', 'load'],
    max_strength: ['volume', 'edge', 'load'],
    aerobic_base: ['volume', 'density'],
    anaerobic_capacity: ['volume', 'density'],
    capacity: ['volume', 'density'],
    power: ['volume', 'speed'],
    technique: ['volume'],
    antagonist: ['volume'],
    mobility: ['volume'],
    mental: ['volume'],
  });

  function _progressionPolicy(quality) {
    const q = typeof quality === 'string' ? quality : '';
    const live = Fingers.progression && Fingers.progression.POLICY && Fingers.progression.POLICY[q];
    return Array.isArray(live) ? live : (FALLBACK_PROGRESSION_POLICY[q] || null);
  }

  function _validProgressionAxis(quality, axis) {
    if (!axis || typeof axis !== 'string') return null;
    const policy = _progressionPolicy(quality);
    if (Array.isArray(policy) && policy.indexOf(axis) >= 0) return axis;
    return null;
  }

  function saveProgressionAxis(quality, axis) {
    const q = typeof quality === 'string' ? quality : '';
    const valid = _validProgressionAxis(q, axis);
    if (!q || !valid) return false;
    const all = _readAll();
    if (!all.progressionAxes || typeof all.progressionAxes !== 'object') all.progressionAxes = {};
    all.progressionAxes[q] = valid;
    all.updatedAt = Date.now();
    return _writeAll(all);
  }

  function loadProgressionAxes() {
    const all = _readAll();
    return Object.assign({}, all.progressionAxes || {});
  }

  const PROGRESSION_DOSE_VALUE_FORMULAS = {
    hang: function (ctx) {
      const d = ctx.dose;
      return Math.max(1, ctx.num(d.workSec, 7)) * Math.max(1, ctx.num(d.reps, 1)) * Math.max(1, ctx.num(d.sets, 1));
    },
    continuous: function (ctx) {
      const d = ctx.dose;
      return Math.max(1, ctx.num(d.workSec, 60)) * Math.max(1, ctx.num(d.sets, 1));
    },
    reps: function (ctx) {
      const d = ctx.dose;
      return Math.max(1, ctx.num(d.reps, 1)) * Math.max(1, ctx.num(d.sets, 1));
    },
    attempts: function (ctx) {
      return Math.max(1, ctx.num(ctx.dose.attempts, 1));
    },
    circuit: function (ctx) {
      const d = ctx.dose;
      return Math.max(1, ctx.num(d.problemsPerRound, 1)) * Math.max(1, ctx.num(d.rounds, 1));
    },
    process: function (ctx) {
      const d = ctx.dose;
      return Math.max(1, ctx.num(d.workSec, 60)) * Math.max(1, ctx.num(d.sets, 1));
    }
  };

  function _doseValue(ex) {
    const krun = _kernelRunner();
    if (krun && typeof krun.estimateDoseSec === 'function') {
      return Math.max(1, krun.estimateDoseSec(ex, PROGRESSION_DOSE_VALUE_FORMULAS, { defaultSec: Number(ex && ex.totalWorkSeconds) || 1 }));
    }
    const dose = (ex && ex.dose) || {};
    const n = function (v, fallback) {
      if (Array.isArray(v)) return Number(v[1] != null ? v[1] : v[0]) || fallback || 0;
      const x = Number(v);
      return Number.isFinite(x) ? x : (fallback || 0);
    };
    const shape = ex && ex.doseShape;
    const sets = Math.max(1, n(dose.sets, 1));
    if (shape === 'hang') return Math.max(1, n(dose.workSec, 7)) * Math.max(1, n(dose.reps, 1)) * sets;
    if (shape === 'continuous') return Math.max(1, n(dose.workSec, 60)) * sets;
    if (shape === 'reps') return Math.max(1, n(dose.reps, 1)) * sets;
    if (shape === 'attempts') return Math.max(1, n(dose.attempts, 1));
    if (shape === 'circuit') return Math.max(1, n(dose.problemsPerRound, 1)) * Math.max(1, n(dose.rounds, 1));
    if (shape === 'process') return Math.max(1, n(dose.workSec, 60)) * sets;
    return Math.max(1, n(ex && ex.totalWorkSeconds, 1));
  }

  function _progressionQuality(ex) {
    const q = ex && typeof ex.quality === 'string' ? ex.quality : null;
    if (q && _progressionPolicy(q)) return q;
    try {
      const atom = ex && ex.atomId && Fingers.blockCatalog && Fingers.blockCatalog.getAtom
        ? Fingers.blockCatalog.getAtom(ex.atomId) : null;
      const aq = atom && atom.quality;
      return aq && _progressionPolicy(aq) ? aq : null;
    } catch (_) { return null; }
  }

  function _sessionTs(log, nowMs) {
    const candidates = [
      log && log.completedAt,
      log && log.endedAt,
      log && log.startedAt
    ];
    for (let i = 0; i < candidates.length; i++) {
      const ts = Date.parse(candidates[i]);
      if (isFinite(ts) && ts > 0) return ts;
    }
    const n = Number(nowMs);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }

  function recordProgressionSession(fingersLog, nowMs) {
    const log = fingersLog || {};
    const list = Array.isArray(log.exercises) ? log.exercises : [];
    if (!list.length) return false;
    const byQuality = {};
    list.forEach(function (ex) {
      const q = _progressionQuality(ex);
      if (!q) return;
      byQuality[q] = (byQuality[q] || 0) + _doseValue(ex);
    });
    const qualities = Object.keys(byQuality).filter(function (q) { return byQuality[q] > 0; });
    if (!qualities.length) return false;
    const all = _readAll();
    if (!all.progressionHistory || typeof all.progressionHistory !== 'object') all.progressionHistory = {};
    const ts = _sessionTs(log, nowMs);
    qualities.forEach(function (q) {
      const hist = Array.isArray(all.progressionHistory[q]) ? all.progressionHistory[q] : [];
      const point = { ts: ts, value: Number(byQuality[q].toFixed(4)), source: 'session' };
      hist.push(point);
      hist.sort(function (a, b) { return (Number(a.ts) || 0) - (Number(b.ts) || 0); });
      const kr = _kernelRecords();
      if (kr && kr.capList) kr.capList(hist, 100);
      else if (hist.length > 100) hist.splice(0, hist.length - 100);
      all.progressionHistory[q] = hist;
    });
    all.updatedAt = Date.now();
    return _writeAll(all);
  }

  function _sessionProgressionSeries(points) {
    const kr = _kernelRecords();
    if (kr && kr.mapTimeSeries) {
      return kr.mapTimeSeries(points, function (p) {
        const ts = Number(p && p.ts) || Date.parse(p && p.testedAt);
        const value = Number(p && p.value);
        return (isFinite(ts) && ts > 0 && value > 0)
          ? { ts: ts, value: Number(value.toFixed(4)) } : null;
      }, { valueKey: 'value' });
    }
    return (Array.isArray(points) ? points : [])
      .map(function (p) {
        const ts = Number(p && p.ts) || Date.parse(p && p.testedAt);
        const value = Number(p && p.value);
        return (isFinite(ts) && ts > 0 && value > 0)
          ? { ts: ts, value: Number(value.toFixed(4)) } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.ts - b.ts; });
  }

  /**
   * B3: live input для progression-cap (§1.2) и plateau detector (§1.3).
   * Берём одну однородную MVC-серию: сначала canonical halfcrimp 20mm, иначе
   * самый длинный slug. Не смешиваем разные хваты/рёбра, чтобы trend был честным.
   */
  function progressionSnapshot() {
    const all = _readAll();
    const history = all.history || {};
    const canonical = _slug('halfcrimp', 20);
    let chosenSlug = null;
    let chosenSeries = [];
    const kr = _kernelRecords();
    if (kr && kr.selectSeries) {
      const seriesBySlug = {};
      Object.keys(history).forEach(function (slug) {
        seriesBySlug[slug] = _historySeries(history[slug]);
      });
      const picked = kr.selectSeries(seriesBySlug, { canonicalKey: canonical, timestampKey: 'ts' });
      chosenSlug = picked.key;
      chosenSeries = picked.series;
    } else {
      const canonicalSeries = _historySeries(history[canonical]);
      if (canonicalSeries.length) {
        chosenSlug = canonical;
        chosenSeries = canonicalSeries;
      } else {
        Object.keys(history).forEach(function (slug) {
          const series = _historySeries(history[slug]);
          if (!series.length) return;
          const last = series[series.length - 1].ts;
          const chosenLast = chosenSeries.length ? chosenSeries[chosenSeries.length - 1].ts : 0;
          if (series.length > chosenSeries.length || (series.length === chosenSeries.length && last > chosenLast)) {
            chosenSlug = slug;
            chosenSeries = series;
          }
        });
      }
    }

    const recordsByQuality = {};
    const currentAxes = {};
    const axisSources = {};
    const qualitySources = {};

    if (chosenSeries.length) {
      recordsByQuality.finger_strength = chosenSeries;
      qualitySources.finger_strength = { source: 'mvcHistory', slug: chosenSlug, points: chosenSeries.length };
    }

    const progressionHistory = all.progressionHistory || {};
    Object.keys(progressionHistory).forEach(function (q) {
      if (!_progressionPolicy(q)) return;
      if (q === 'finger_strength' && recordsByQuality.finger_strength) return;
      const series = _sessionProgressionSeries(progressionHistory[q]);
      if (!series.length) return;
      recordsByQuality[q] = series;
      qualitySources[q] = { source: 'sessionLog', points: series.length };
    });

    const qualities = Object.keys(recordsByQuality);
    if (!qualities.length) return null;

    qualities.forEach(function (q) {
      const storedAxis = all.progressionAxes && all.progressionAxes[q];
      const validStoredAxis = _validProgressionAxis(q, storedAxis);
      currentAxes[q] = validStoredAxis || 'volume';
      axisSources[q] = validStoredAxis ? 'stored' : 'default';
    });

    return {
      recordsByQuality: recordsByQuality,
      currentAxes: currentAxes,
      axisSources: axisSources,
      source: 'records.progressionSnapshot',
      qualitySources: qualitySources
    };
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
                // B5: какая рука слабее — чтобы совет был конкретным.
                weakerSide: lVal < rVal ? 'left' : 'right',
                base: base,
                hint: `Разница между руками >15% (${base}). Один-рук подходы на слабую руку.`,
              });
            }
          }
        }
      });
    });

    return flags;
  }

  // B5: конкретный actionable-совет по lr_asymmetry — какая рука слабее и
  // bias-прескрипшн 2:1 в её пользу. Pure. Для не-lr флагов → null. (One-arm
  // training session не строим: модель упражнения двуручная, поля hand нет —
  // совет текстовый + указывает grip/edge/сторону для ручной настройки.)
  function asymmetryAdvice(flag) {
    if (!flag || flag.kind !== 'lr_asymmetry' || !flag.weakerSide) return null;
    const sideRu = flag.weakerSide === 'left' ? 'левую' : 'правую';
    const weakSets = 2;
    const strongSets = 1;
    return {
      weakerSide: flag.weakerSide,
      base: flag.base || null,
      edgeMm: flag.edgeMm,
      weakSets: weakSets,
      strongSets: strongSets,
      text: 'Слабее ' + sideRu + ' рука (разница ' + flag.ratio + '×). На ближайших '
        + 'сессиях делай ' + weakSets + ' одноручных подхода на ' + sideRu + ' к '
        + strongSets + ' на сильную (' + (flag.base || 'хват') + ', ' + flag.edgeMm
        + ' мм), пока разница не сократится.',
    };
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

  function _normalizeAssessmentBattery(raw, opts) {
    const o = opts || {};
    const source = o.source || 'manual';
    const testedAt = o.testedAt || new Date().toISOString();
    if (Fingers.assessment && typeof Fingers.assessment.normalizeBatteryResults === 'function') {
      const normalized = Fingers.assessment.normalizeBatteryResults(raw || {});
      const out = {};
      Object.keys(normalized).forEach((id) => {
        const r = normalized[id];
        out[id] = Object.assign({}, r, {
          testedAt: r.testedAt || testedAt,
          source: o.source || r.source || source,
          updatedAt: Date.now(),
        });
      });
      return out;
    }
    const out = {};
    Object.keys(raw || {}).forEach((id) => {
      const r = raw[id];
      if (!r || typeof r !== 'object') return;
      out[id] = Object.assign({}, r, {
        id,
        testedAt: r.testedAt || testedAt,
        source: r.source || source,
        updatedAt: Date.now(),
      });
    });
    return out;
  }

  function saveAssessmentBattery(rawResults, opts) {
    const normalized = _normalizeAssessmentBattery(rawResults, opts || {});
    const ids = Object.keys(normalized);
    if (!ids.length) return {};
    const all = _readAll();
    if (!all.assessmentBattery) all.assessmentBattery = {};
    ids.forEach((id) => {
      all.assessmentBattery[id] = normalized[id];
    });
    all.updatedAt = Date.now();
    _writeAll(all);
    return Object.assign({}, all.assessmentBattery);
  }

  function loadAssessmentBattery() {
    const all = _readAll();
    return Object.assign({}, all.assessmentBattery || {});
  }

  function assessLatestBattery(level) {
    if (!Fingers.assessment || typeof Fingers.assessment.assessBattery !== 'function') return null;
    return Fingers.assessment.assessBattery(loadAssessmentBattery(), level);
  }

  const recordsApi = {
    configure,
	    get,
	    getMVC,
	    getMvcHistory,
	    progressionSnapshot,
	    recordProgressionSession,
	    saveProgressionAxis,
	    loadProgressionAxes,
	    updateIfPR,
	    asymmetries,
    asymmetryAdvice,
    byGrade,
    saveAssessmentBattery,
    loadAssessmentBattery,
    assessLatestBattery,
    GRADE_TABLE: Object.freeze(Object.assign({}, GRADE_TABLE)),
    __registered: true,
    __getKey: _getKey,
  };
  Fingers.records = recordsApi;
})(typeof window !== 'undefined' ? window : globalThis);
