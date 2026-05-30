// heys_fingers_calibration_v1.js — Calibration tests (Max Hang / CF / Min Edge).
//
// Wave 2-C util. UI и actual test flow собирает Wave 3 (onboarding); этот
// файл — pure logic + LS storage + integration с HEYS.Fingers.records.
//
// Public API:
//   HEYS.Fingers.calibration.maxHang.startTest({gripId, edgeMm, startWeight, onAttemptDone}) → controller
//   HEYS.Fingers.calibration.maxHang.recordResult(holdTime, addedKg, bw) → { isPR, suggestion }
//   HEYS.Fingers.calibration.criticalForce.startTest()                  → controller
//   HEYS.Fingers.calibration.criticalForce.recordResult(avgKg, bw)
//   HEYS.Fingers.calibration.minEdge.startTest({gripId, startEdgeMm})    → controller
//   HEYS.Fingers.calibration.minEdge.recordResult(edgeMm, holdTime)
//   HEYS.Fingers.calibration.lastTestDate(testType, gripId?) → ISO|null
//   HEYS.Fingers.calibration.isDue(testType, gripId?)        → boolean (>8w)
//
// LS-key: `heys_<cid>_fingers_calibration_v1`. См. plan «Calibration tests».
//
// Test suggestions (gates по hold time per Max Hang plan):
//   <5s   → too heavy, retry с -20%
//   5-7s  → close, retry с -10%
//   7-10s → STORE as MVC (sweet spot)
//   10-15s → retry с +10%
//   >15s  → too light, retry с +25% (hard-stop)

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.calibration && Fingers.calibration.__registered) return;

  const DUE_THRESHOLD_MS = 8 * 7 * 24 * 60 * 60 * 1000; // 8 weeks

  function _getKey() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? `heys_${cid}_fingers_calibration_v1` : 'heys_fingers_calibration_v1';
  }

  function _readAll() {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(_getKey(), null) || { maxHang: {}, criticalForce: null, minEdge: {} };
      }
      const raw = localStorage.getItem(_getKey());
      return raw ? JSON.parse(raw) : { maxHang: {}, criticalForce: null, minEdge: {} };
    } catch (e) {
      console.warn('[Fingers.calibration] read failed:', e);
      return { maxHang: {}, criticalForce: null, minEdge: {} };
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
      console.warn('[Fingers.calibration] write failed:', e);
      return false;
    }
  }

  function _slug(gripId, edgeMm) {
    return `${gripId}_${edgeMm}mm`;
  }

  // ─── Max Hang Test ──────────────────────────────────────────────────────
  /**
   * Gate logic для hold time → suggestion для next attempt.
   * Возвращает { action: 'store'|'retry', adjustKg, message }.
   */
  function _maxHangSuggestion(holdTime, currentAddedKg) {
    if (holdTime < 5) {
      return {
        action: 'retry',
        adjustKg: -Math.round(Math.abs(currentAddedKg) * 0.2 * 10) / 10 || -2.5,
        ratio: -0.20,
        message: 'Слишком тяжело (<5s). Попробуй на -20%.',
      };
    }
    if (holdTime < 7) {
      return {
        action: 'retry',
        adjustKg: -Math.round(Math.abs(currentAddedKg) * 0.1 * 10) / 10 || -1.0,
        ratio: -0.10,
        message: 'Близко (5-7s). Попробуй на -10%.',
      };
    }
    if (holdTime <= 10) {
      return {
        action: 'store',
        adjustKg: 0,
        ratio: 0,
        message: 'Идеально (7-10s) — зафиксировано как MVC.',
      };
    }
    if (holdTime <= 15) {
      return {
        action: 'retry',
        adjustKg: Math.round(Math.abs(currentAddedKg) * 0.1 * 10) / 10 || 1.0,
        ratio: 0.10,
        message: 'Легковато (10-15s). Попробуй +10% для точного MVC.',
      };
    }
    return {
      action: 'retry',
      adjustKg: Math.round(Math.abs(currentAddedKg) * 0.25 * 10) / 10 || 2.5,
      ratio: 0.25,
      message: 'Слишком легко (>15s). Сильное +25% для следующей попытки.',
    };
  }

  function _maxHangStartTest(opts) {
    const o = opts || {};
    const gripId = o.gripId || 'openhand4';
    const edgeMm = o.edgeMm || 20;
    const startWeight = Number(o.startWeight) || 0;

    return {
      gripId,
      edgeMm,
      currentWeight: startWeight,
      attempt: 0,
      maxAttempts: 4,
      onAttemptDone: typeof o.onAttemptDone === 'function' ? o.onAttemptDone : null,
      // helper exposed: следующее предложение веса после attempt
      computeNext: function (holdTime) {
        this.attempt += 1;
        const s = _maxHangSuggestion(holdTime, this.currentWeight);
        if (s.action === 'retry') this.currentWeight += s.adjustKg;
        if (this.onAttemptDone) {
          try { this.onAttemptDone({ attempt: this.attempt, holdTime, suggestion: s,
            newWeight: this.currentWeight, exhausted: this.attempt >= this.maxAttempts }); }
          catch (e) { console.warn('[Fingers.calibration] onAttemptDone threw:', e); }
        }
        return s;
      },
    };
  }

  function _maxHangRecordResult(gripId, edgeMm, holdTime, addedKg, bw) {
    const all = _readAll();
    if (!all.maxHang) all.maxHang = {};
    const slug = _slug(gripId, edgeMm);
    const isoNow = new Date().toISOString();

    all.maxHang[slug] = {
      lastTestedAt: isoNow,
      mvcKg: Number(addedKg) + Number(bw),
      addedKg: Number(addedKg),
      bw: Number(bw),
      holdTime: Number(holdTime),
    };
    _writeAll(all);

    // Также пишем в records через PR-store (max-wins)
    let isPR = false;
    try {
      if (Fingers.records && typeof Fingers.records.updateIfPR === 'function') {
        const hasScale = Number(bw) > 0; // если нет веса юзера — невозможно посчитать absolute
        const newRecord = hasScale
          ? { type: 'weight', mvcKg: Number(addedKg) + Number(bw), addedKg: Number(addedKg),
              bw: Number(bw), holdTime: Number(holdTime), testedAt: isoNow, source: 'calibration', attempts: 1 }
          : { type: 'time', holdTime: Number(holdTime), testedAt: isoNow, source: 'calibration', attempts: 1 };
        isPR = Fingers.records.updateIfPR(gripId, edgeMm, newRecord);
      }
    } catch (e) {
      console.warn('[Fingers.calibration] updateIfPR threw:', e);
    }

    const suggestion = _maxHangSuggestion(holdTime, addedKg);
    return { isPR, suggestion };
  }

  // ─── Critical Force Test (4-min 7:3 repeaters on 20mm) ─────────────────
  function _cfStartTest() {
    return {
      protocol: '4min_7-3_20mm',
      hangSec: 7,
      restSec: 3,
      totalDurationSec: 240,
      // UI собирает каждый holdTime; в конце вызывает recordResult с avg force
    };
  }

  function _cfRecordResult(avgKg, bw) {
    const all = _readAll();
    const isoNow = new Date().toISOString();
    const bwNum = Number(bw) || 0;
    const avg = Number(avgKg) || 0;
    // mvcRatio относительно текущего MVC на openhand4_20mm если есть
    let cfMvcRatio = null;
    try {
      const mvc = Fingers.records && Fingers.records.getMVC ? Fingers.records.getMVC('openhand4', 20) : null;
      if (mvc && mvc.type === 'weight' && Number(mvc.mvcKg) > 0) {
        cfMvcRatio = Number((avg / Number(mvc.mvcKg)).toFixed(3));
      }
    } catch (_e) { /* swallow */ }

    all.criticalForce = {
      lastTestedAt: isoNow,
      cfKg: avg,
      bw: bwNum,
      cfMvcRatio,
    };
    _writeAll(all);
    return all.criticalForce;
  }

  // ─── Min Edge Test (BW only, 10s × 4-6 sets, decrement -1..-2mm) ───────
  function _minEdgeStartTest(opts) {
    const o = opts || {};
    return {
      gripId: o.gripId || 'openhand4',
      currentEdgeMm: Number(o.startEdgeMm) || 20,
      hangSec: 10,
      maxSets: 6,
      decrementMm: 2,
      decideNext: function (holdTime) {
        // Если margin >3s (т.е. holdTime ≥ hangSec + 3) — уменьшаем edge
        if (holdTime >= this.hangSec + 3) {
          this.currentEdgeMm = Math.max(4, this.currentEdgeMm - this.decrementMm);
          return { action: 'continue', nextEdgeMm: this.currentEdgeMm };
        }
        if (holdTime >= this.hangSec) {
          return { action: 'stop', finalEdgeMm: this.currentEdgeMm };
        }
        return { action: 'stop', finalEdgeMm: this.currentEdgeMm + this.decrementMm };
      },
    };
  }

  function _minEdgeRecordResult(gripId, edgeMm, holdTime) {
    const all = _readAll();
    if (!all.minEdge) all.minEdge = {};
    all.minEdge[gripId] = {
      lastTestedAt: new Date().toISOString(),
      edgeMm: Number(edgeMm),
      holdTime: Number(holdTime),
    };
    _writeAll(all);
    return all.minEdge[gripId];
  }

  // ─── lastTestDate / isDue ──────────────────────────────────────────────
  function lastTestDate(testType, gripId) {
    const all = _readAll();
    if (testType === 'maxHang') {
      if (gripId) {
        const slug = Object.keys(all.maxHang || {}).find((k) => k.startsWith(`${gripId}_`));
        return slug ? all.maxHang[slug].lastTestedAt : null;
      }
      // Самая старая дата среди всех записей
      const dates = Object.values(all.maxHang || {}).map((r) => r.lastTestedAt).filter(Boolean);
      if (!dates.length) return null;
      return dates.sort()[0]; // oldest first
    }
    if (testType === 'criticalForce') {
      return all.criticalForce ? all.criticalForce.lastTestedAt : null;
    }
    if (testType === 'minEdge') {
      if (gripId) return all.minEdge && all.minEdge[gripId] ? all.minEdge[gripId].lastTestedAt : null;
      const dates = Object.values(all.minEdge || {}).map((r) => r.lastTestedAt).filter(Boolean);
      if (!dates.length) return null;
      return dates.sort()[0];
    }
    return null;
  }

  function isDue(testType, gripId) {
    const iso = lastTestDate(testType, gripId);
    if (!iso) return true; // Never tested → due.
    const t = Date.parse(iso);
    if (!t) return true;
    return (Date.now() - t) > DUE_THRESHOLD_MS;
  }

  Fingers.calibration = {
    maxHang: {
      startTest: _maxHangStartTest,
      recordResult: _maxHangRecordResult,
      suggestion: _maxHangSuggestion,
    },
    criticalForce: {
      startTest: _cfStartTest,
      recordResult: _cfRecordResult,
    },
    minEdge: {
      startTest: _minEdgeStartTest,
      recordResult: _minEdgeRecordResult,
    },
    lastTestDate,
    isDue,
    __registered: true,
    __getKey: _getKey,
    __DUE_THRESHOLD_MS: DUE_THRESHOLD_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
