// heys_fingers_engine_router_v1.js — Strangler router (Phase 1 / step 4 part 1).
//
// Источник плана: KICKOFF.md «Strangler-fig» + cloud-agent brief Шаг 4.
//
// Назначение: единая точка `recommendDay(opts)` которая по флагу
// `HEYS.Fingers.flags.newEngine` направляет вызов на старый mix_engine
// (default) или на новый sessionBuilder.
//
// **Безопасные инварианты:**
// 1. Default флага = false → роутер прозрачно делегирует в `mixEngine.recommendDay`.
//    При flag=off результат **бит-в-бит** идентичен прямому вызову mix_engine
//    (см. fingers-engine-router.test.js — регресс «strangler не меняет поведение»).
// 2. При flag=on:
//    - sessionBuilder отсутствует / возвращает null|undefined → fallback на mix_engine.
//    - sessionBuilder бросает — try/catch → warn в console + fallback на mix_engine.
//    Это гарантирует «новый движок не валит сессию пользователю» на любой стадии.
// 3. Canary включается только явно через engineRouter.configureCanary /
//    enableCanaryIfGatePasses. Default остаётся off.
//
// Public API:
//   HEYS.Fingers.flags.newEngine               — boolean флаг (default false)
//   HEYS.Fingers.engineRouter.recommendDay(opts)
//   HEYS.Fingers.engineRouter.lastSource       — 'old'|'new'|'fallback'|'fallback-error'|'fallback-contract'
//   HEYS.Fingers.engineRouter.isValidSession(s)— контракт-guard (для тестов/телеметрии)
//   HEYS.Fingers.engineRouter.evaluateRolloutGate(thresholds)
//   HEYS.Fingers.engineRouter.configureCanary({ enabled, shadowCompare, persist })

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__engineRouterRegistered) return; // idempotent
  Fingers.__engineRouterRegistered = true;

  // Флаги — namespace. Не перезаписываем, если установлен внешне.
  Fingers.flags = Fingers.flags || {};
  if (typeof Fingers.flags.newEngine !== 'boolean') {
    // FLIP 2026-06-11: новый движок включён для всех (canary валидирован).
    // Откат: вернуть `false` здесь (+rebundle+deploy) или рантайм
    // `HEYS.Fingers.flags.newEngine = false`. Safety: при null/throw/контракт-fail
    // sessionBuilder роутер всё равно падает на mixEngine (fallback-цепочка
    // в recommendDay ниже) — это деградация к legacy, не поломка сессии.
    Fingers.flags.newEngine = true;
  }
  if (typeof Fingers.flags.shadowCompare !== 'boolean') {
    Fingers.flags.shadowCompare = false; // shadow-compare выключен по умолчанию
  }
  if (typeof Fingers.flags.newEngineCanary !== 'boolean') {
    Fingers.flags.newEngineCanary = false;
  }

  const DEFAULT_ROLLOUT_GATE = Object.freeze({
    minRoutes: 50,
    minShadowCompareTotal: 8,
    maxFallbackRate: 0.05,
    maxShadowCompareErrors: 0,
    maxDurationDeltaMin: 15,
    maxExerciseDelta: 2,
    maxDangerOverBudget: 0,
    allowUiRendererRisk: false
  });
  const DANGER_BUDGET = { recovery: 8, moderate: 24, max: 48 };

  function _parseStoredClientId(raw) {
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return parsed ? String(parsed) : '';
    } catch (_) {
      return String(raw).replace(/^"|"$/g, '');
    }
  }

  function _getCurrentClientId() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    if (cid) return String(cid);
    try {
      if (!global.localStorage) return '';
      return _parseStoredClientId(global.localStorage.getItem('heys_client_current'))
        || _parseStoredClientId(global.localStorage.getItem('heys_pin_auth_client'));
    } catch (_) {
      return '';
    }
  }

  function _canaryKey() {
    const cid = _getCurrentClientId();
    return cid ? ('heys_' + cid + '_fingers_new_engine_canary_v1') : 'heys_fingers_new_engine_canary_v1';
  }

  function _safeGetLS(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (_) { return null; }
  }

  function _safeSetLS(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, value);
      return true;
    } catch (_) { return false; }
  }

  // Хранилище последнего shadow-diff для тестов/телеметрии.
  let _lastShadowDiff = null;

  // Диагностика последнего вызова (для тестов/телеметрии).
  let _lastSource = null;

  const SOURCE_KEYS = ['old', 'new', 'fallback', 'fallback-error', 'fallback-contract'];
  function _emptyTelemetry() {
    const bySource = {};
    SOURCE_KEYS.forEach(function (k) { bySource[k] = 0; });
    return {
      total: 0,
      bySource: bySource,
      fallbackTotal: 0,
      shadowCompareTotal: 0,
      shadowCompareErrors: 0,
      lastFallbackReason: null,
      lastFallbackAt: null,
      lastShadowAt: null
    };
  }

  let _telemetry = _emptyTelemetry();

  function _setSource(source, reason) {
    _lastSource = source;
    _telemetry.total += 1;
    if (_telemetry.bySource[source] === undefined) _telemetry.bySource[source] = 0;
    _telemetry.bySource[source] += 1;
    if (source.indexOf('fallback') === 0) {
      _telemetry.fallbackTotal += 1;
      _telemetry.lastFallbackReason = reason || source;
      _telemetry.lastFallbackAt = Date.now();
    }
  }

  function _copyTelemetry() {
    const bySource = Object.assign({}, _telemetry.bySource);
    const total = _telemetry.total;
    return {
      total: total,
      bySource: bySource,
      fallbackTotal: _telemetry.fallbackTotal,
      fallbackRate: total > 0 ? _telemetry.fallbackTotal / total : 0,
      shadowCompareTotal: _telemetry.shadowCompareTotal,
      shadowCompareErrors: _telemetry.shadowCompareErrors,
      lastFallbackReason: _telemetry.lastFallbackReason,
      lastFallbackAt: _telemetry.lastFallbackAt,
      lastShadowAt: _telemetry.lastShadowAt
    };
  }

  function _resetTelemetry() {
    _lastSource = null;
    _lastShadowDiff = null;
    _telemetry = _emptyTelemetry();
  }

  function configureCanary(options) {
    const o = options || {};
    const enabled = o.enabled === true;
    const shadowCompare = (o.shadowCompare !== undefined) ? o.shadowCompare === true : enabled;
    Fingers.flags.newEngineCanary = enabled;
    Fingers.flags.newEngine = enabled;
    Fingers.flags.shadowCompare = shadowCompare;
    const persisted = o.persist === true ? _safeSetLS(_canaryKey(), enabled ? '1' : '0') : false;
    return {
      enabled: Fingers.flags.newEngine,
      shadowCompare: Fingers.flags.shadowCompare,
      persisted: persisted,
      key: o.persist === true ? _canaryKey() : null
    };
  }

  function loadCanaryFlag() {
    const raw = _safeGetLS(_canaryKey());
    if (raw === '1') return configureCanary({ enabled: true, shadowCompare: true });
    if (raw === '0') return configureCanary({ enabled: false, shadowCompare: false });
    return {
      enabled: Fingers.flags.newEngine === true,
      shadowCompare: Fingers.flags.shadowCompare === true,
      persisted: false,
      key: _canaryKey()
    };
  }

  function _loadCanaryFlagSoon() {
    try { loadCanaryFlag(); } catch (_) { /* noop */ }
  }

  function evaluateRolloutGate(thresholds) {
    const cfg = Object.assign({}, DEFAULT_ROLLOUT_GATE, thresholds || {});
    const telemetry = _copyTelemetry();
    const diff = _lastShadowDiff;
    const reasons = [];

    if (telemetry.total < cfg.minRoutes) {
      reasons.push('insufficient-routes');
    }
    if (telemetry.shadowCompareTotal < cfg.minShadowCompareTotal) {
      reasons.push('insufficient-shadow-samples');
    }
    if (!diff) {
      reasons.push('no-shadow-data');
    }
    if (telemetry.total > 0 && telemetry.fallbackRate > cfg.maxFallbackRate) {
      reasons.push('fallback-rate');
    }
    if (telemetry.shadowCompareErrors > cfg.maxShadowCompareErrors) {
      reasons.push('shadow-compare-errors');
    }
    if (diff && diff.nonRenderableCount && diff.nonRenderableCount.uiRendererRisk && cfg.allowUiRendererRisk !== true) {
      reasons.push('ui-renderer-risk');
    }
    if (diff && diff.durationMin && typeof diff.durationMin.deltaMin === 'number') {
      if (Math.abs(diff.durationMin.deltaMin) > cfg.maxDurationDeltaMin) reasons.push('duration-delta');
    }
    if (diff && diff.exerciseCount) {
      const newCount = Number(diff.exerciseCount.new || 0);
      const oldCount = Number(diff.exerciseCount.old || 0);
      if (Math.abs(newCount - oldCount) > cfg.maxExerciseDelta) reasons.push('exercise-count-delta');
    }
    if (diff && diff.dangerBudget && diff.dangerBudget.new) {
      const overBy = Number(diff.dangerBudget.new.overBy || 0);
      if (overBy > cfg.maxDangerOverBudget) reasons.push('danger-budget');
    }

    return {
      ok: reasons.length === 0,
      reasons: reasons,
      telemetry: telemetry,
      lastShadowDiff: diff,
      thresholds: cfg
    };
  }

  function enableCanaryIfGatePasses(options) {
    const o = options || {};
    const gate = evaluateRolloutGate(o.thresholds);
    if (!gate.ok && o.force !== true) {
      return {
        ok: false,
        gate: gate,
        flags: {
          newEngine: Fingers.flags.newEngine === true,
          shadowCompare: Fingers.flags.shadowCompare === true,
          newEngineCanary: Fingers.flags.newEngineCanary === true
        }
      };
    }
    return {
      ok: true,
      gate: gate,
      flags: configureCanary({
        enabled: true,
        shadowCompare: o.shadowCompare !== false,
        persist: o.persist === true
      })
    };
  }

  // ─── Plumbing Гейта #1 (ревью #8) ────────────────────────────────────────────
  // Цель: пробросить РЕАЛЬНЫЙ уровень/MVC юзера в opts, чтобы новый билдер не
  // выдавал beginner-floor каждому. До этого fix'а live-opts (зеркало mixEngine)
  // не несли ни level, ни mvcPctBW → ultimate floor = 'beginner' для всех.
  //
  // Источники:
  //   - mvcPctBW = (addedKg / bw) × 100 на canonical halfcrimp 20mm (§3.5 bench)
  //   - level из profile, если задан явно
  //
  // Safety: enrichment ДО branch (legacy mixEngine игнорирует unknown opts —
  // verified в его recommendDay чтении: только {equipmentTypes, intensity, age,
  // readiness, goal}). Если sources недоступны → opts as-is → builder свалится
  // на ultimate floor (beginner) корректно.
  //
  // Никогда не перезаписываем уже-заданные поля: explicit > derive > floor.
  function _enrichOpts(opts) {
    const o = Object.assign({}, opts || {});

    // MVC: только если ни mvcPctBW не задан, ни explicit profile.level — иначе
    // юзер уже сообщил, не дёргаем LS.
    if (o.mvcPctBW === undefined && !(o.profile && o.profile.level) && !o.level) {
      try {
        const recordsStore = Fingers.records;
        const bodyMetrics = Fingers.getBodyWeight || (Fingers.bodyMetrics && Fingers.bodyMetrics.getBodyWeight);
        if (recordsStore && typeof recordsStore.getMVC === 'function' && typeof bodyMetrics === 'function') {
          const rec = recordsStore.getMVC('halfcrimp', 20);
          const bw = bodyMetrics();
          const addedKg = rec && typeof rec.addedKg === 'number' ? rec.addedKg : null;
          const bwKg = bw && typeof bw.kg === 'number' ? bw.kg : null;
          if (addedKg !== null && bwKg !== null && bwKg > 0) {
            o.mvcPctBW = (addedKg / bwKg) * 100;
          }
        }
      } catch (_) { /* silent — enrichment best-effort */ }
    }

    // Level из profile API — если есть. Никаких эвристик.
    if (o.level === undefined && !(o.profile && o.profile.level)) {
      try {
        const getProfile = Fingers.getProfile;
        if (typeof getProfile === 'function') {
          const p = getProfile();
          if (p && typeof p.level === 'string' && p.level) o.level = p.level;
        }
      } catch (_) { /* silent */ }
    }

    if (!o.assessment && !o.assessmentResult) {
      try {
        const recordsStore = Fingers.records;
        const level = o.level || (o.profile && o.profile.level) || null;
        if (level && recordsStore && typeof recordsStore.assessLatestBattery === 'function') {
          const assessmentResult = recordsStore.assessLatestBattery(level);
          if (assessmentResult && !assessmentResult.error) {
            o.assessmentResult = assessmentResult;
            if (!o.focusQuality && assessmentResult.leadingLimiter) {
              o.focusQuality = assessmentResult.leadingLimiter;
            }
          }
        }
      } catch (_) { /* silent */ }
    }

    // B3 / methodology §1.2-1.3: live progression input.
    // Builder уже умеет progression-cap, но ему нужна реальная series
    // recordsByQuality. Берём её из records-store MVC history; explicit opts
    // не трогаем, чтобы тесты/ручные сценарии могли задать свой источник.
    if (!o.recordsByQuality) {
      try {
        const recordsStore = Fingers.records;
        if (recordsStore && typeof recordsStore.progressionSnapshot === 'function') {
          const snap = recordsStore.progressionSnapshot();
          if (snap && snap.recordsByQuality) {
            o.recordsByQuality = snap.recordsByQuality;
            if (!o.currentAxes && snap.currentAxes) {
              o.currentAxes = _seedProgressionAxesFromMaturity(snap.currentAxes, snap.axisSources, o);
            }
          }
        }
      } catch (_) { /* silent */ }
    }

    if (!Array.isArray(o.history)) {
      try {
        const tissueHistory = Fingers.tissueHistory;
        if (tissueHistory && typeof tissueHistory.recent === 'function') {
          const nowMs = (typeof o.now === 'number' && isFinite(o.now)) ? o.now : Date.now();
          const hist = tissueHistory.recent({ nowMs: nowMs });
          if (Array.isArray(hist) && hist.length) {
            o.history = hist;
            if (o.now === undefined) o.now = nowMs;
          }
        }
      } catch (_) { /* silent */ }
    }

    if (!o.plannerContext && !o.periodizationContext) {
      try {
        if (Fingers.periodization && typeof Fingers.periodization.current === 'function') {
          const ctx = Fingers.periodization.current(null, o.dateKey || o.todayKey || null);
          if (ctx) o.plannerContext = ctx;
        }
      } catch (_) { /* silent */ }
    }

    return o;
  }

  function _levelRank(level) {
    return ['beginner', 'intermediate', 'advanced', 'elite'].indexOf(level);
  }

  function _seedProgressionAxesFromMaturity(currentAxes, axisSources, opts) {
    const axes = Object.assign({}, currentAxes || {});
    const sources = axisSources || {};
    if (sources.finger_strength !== 'default') return axes;

    const o = opts || {};
    const explicitLevel = (o.profile && o.profile.level) || o.level || null;
    const prereqs = (o.profile && Array.isArray(o.profile.completedPrerequisites))
      ? o.profile.completedPrerequisites : [];
    const hasBase = prereqs.indexOf('base_>=1y') >= 0;
    const matureByLevel = explicitLevel && _levelRank(explicitLevel) >= _levelRank('intermediate');

    // MVC-history proves measured finger strength, not tissue age. We only seed
    // load-axis from explicit maturity signals; MVC-derived level remains gated
    // by builder S9 and does not get auto-upgraded here.
    if (matureByLevel || hasBase) axes.finger_strength = 'load';
    return axes;
  }

  // Primitive: вызов старого движка БЕЗ побочного эффекта на lastSource.
  // lastSource выставляется в recommendDay (точка маршрутизации).
  function _callOld(opts) {
    if (!Fingers.mixEngine || typeof Fingers.mixEngine.recommendDay !== 'function') {
      throw new Error('[fingers.engineRouter] mixEngine.recommendDay недоступен');
    }
    return Fingers.mixEngine.recommendDay(opts);
  }

  // Контракт-guard: новый движок должен возвращать форму, совместимую с
  // mixEngine.recommendDay. Проверяем поля, которые РЕАЛЬНО потребляет UI
  // (ревью 4.2 находка #2 + ревью 4.3 уточнение):
  //   - intensity (string) — для intensityLabel / data-fingers-intensity
  //   - exercises (Array, непустой) — для рендера упражнений
  //   - exercises[].__role (string) — UI ничего сам не делает с этим, но
  //     контракт требует; safety-валидаторы и slot-логика опираются.
  //   - name (string) — заголовок карточки (session_ui L1027)
  //   - durationMin (number) — чип «X мин» (session_ui L1035)
  //   - requiresWarmup (boolean) — S3 на UX-слое (не показывать сразу intensive
  //     без RAMP-промпта). Допускаем undefined для backward-compat mixEngine.
  function isValidSession(s) {
    if (!s || typeof s !== 'object') return false;
    if (typeof s.intensity !== 'string' || !s.intensity) return false;
    if (!Array.isArray(s.exercises) || s.exercises.length === 0) return false;
    if (!s.exercises.every(function (e) {
      return e && typeof e.__role === 'string';
    })) return false;
    if (typeof s.name !== 'string' || !s.name) return false;
    if (typeof s.durationMin !== 'number' || !isFinite(s.durationMin)) return false;
    // requiresWarmup: безопасный default — если undefined, не блочим
    // (mixEngine выставляет всегда; будущие билдеры могут опустить).
    if (s.requiresWarmup !== undefined && typeof s.requiresWarmup !== 'boolean') return false;
    return true;
  }

  // ─── Shadow-compare (ревью 4.3 #4.3e) ─────────────────────────────────────────
  // При flag=on + shadowCompare=on: зовём оба движка, отдаём builder, логируем
  // расхождения. Это **наблюдаемость**, не safety-guard: фактический выход не
  // меняется (его уже гарантирует isValidSession + fallback-цепочка).
  // Цель: дать методологу/тебе видимость «насколько разные сессии генерятся».
  // Распределение значения поля по exercises → {value: count}.
  function _distribution(exercises, field) {
    const out = Object.create(null);
    (exercises || []).forEach(function (e) {
      const v = (e && e[field] != null) ? String(e[field]) : '(missing)';
      out[v] = (out[v] || 0) + 1;
    });
    return out;
  }

  const RENDERABLE_DOSESHAPES = {
    hang: true, reps: true, continuous: true, attempts: true, circuit: true, process: true
  };

  function _dangerBucket(session) {
    const traceBucket = session && session.__trace && session.__trace.resolution && session.__trace.resolution.bucket;
    if (DANGER_BUDGET[traceBucket] != null) return traceBucket;
    const intensity = session && session.intensity;
    return DANGER_BUDGET[intensity] != null ? intensity : 'moderate';
  }

  function _dangerSpent(session) {
    let spent = 0;
    const exercises = (session && session.exercises) || [];
    exercises.forEach(function (e) {
      if (!e || !e.gripId) return;
      const g = Fingers.getGripById && Fingers.getGripById(e.gripId);
      spent += (g && Number(g.a2ForceRatio)) || 0;
    });
    return Math.round(spent * 100) / 100;
  }

  function _dangerSnapshot(session) {
    const bucket = _dangerBucket(session);
    const cap = DANGER_BUDGET[bucket];
    const spent = _dangerSpent(session);
    const overBy = Math.max(0, Math.round((spent - cap) * 100) / 100);
    return {
      bucket: bucket,
      spent: spent,
      cap: cap,
      overBy: overBy,
      overBudget: overBy > 0
    };
  }

  function _diffSessions(newS, oldS) {
    if (!newS || !oldS) return { onlyOne: !newS ? 'old' : 'new' };
    // UI умеет все 6 doseShape. Non-hang оставляем как диагностическое
    // распределение, но risk считаем только для реально нерендеримых shape.
    const newNonHang = (newS.exercises || []).filter(function (e) {
      return e && e.doseShape && e.doseShape !== 'hang';
    }).length;
    const newNonRenderable = (newS.exercises || []).filter(function (e) {
      return e && e.doseShape && !RENDERABLE_DOSESHAPES[e.doseShape];
    }).length;
    return {
      intensity: { new: newS.intensity, old: oldS.intensity, same: newS.intensity === oldS.intensity },
      durationMin: { new: newS.durationMin, old: oldS.durationMin, deltaMin: (newS.durationMin || 0) - (oldS.durationMin || 0) },
      exerciseCount: { new: newS.exercises.length, old: oldS.exercises.length },
      roles: {
        new: newS.exercises.map(function (e) { return e.__role; }),
        old: oldS.exercises.map(function (e) { return e.__role; })
      },
      requiresWarmup: { new: newS.requiresWarmup, old: oldS.requiresWarmup, same: newS.requiresWarmup === oldS.requiresWarmup },
      // Ревью #3 #2 метрика: распределение shape/modality + renderability risk.
      doseShape: { new: _distribution(newS.exercises, 'doseShape'), old: _distribution(oldS.exercises, 'doseShape') },
      modality: { new: _distribution(newS.exercises, 'modality'), old: _distribution(oldS.exercises, 'modality') },
      nonHangCount: { new: newNonHang },
      nonRenderableCount: { new: newNonRenderable, uiRendererRisk: newNonRenderable > 0 },
      dangerBudget: { new: _dangerSnapshot(newS), old: _dangerSnapshot(oldS) }
    };
  }

  function _logShadow(diff) {
    _lastShadowDiff = diff;
    _telemetry.shadowCompareTotal += 1;
    _telemetry.lastShadowAt = Date.now();
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[fingers.engineRouter] shadow-compare diff', diff);
    }
  }

  function recommendDay(opts) {
    // Plumbing Гейта #1: enrichment ДО branch — mixEngine игнорирует unknown
    // opts, builder при flag=on получает реальные MVC/level.
    const enriched = _enrichOpts(opts);

    const useNew = Fingers.flags && Fingers.flags.newEngine === true;
    if (!useNew) {
      _setSource('old');
      return _callOld(enriched);
    }
    // Путь новой логики — Phase 4.2+. Пока sessionBuilder не зарегистрирован,
    // прозрачно fallback'имся на старый движок.
    const builder = Fingers.sessionBuilder;
    if (!builder || typeof builder.recommendDay !== 'function') {
      _setSource('fallback', 'missing-builder');
      return _callOld(enriched);
    }
    try {
      const result = builder.recommendDay(enriched);
      if (result === null || result === undefined) {
        _setSource('fallback', 'empty-builder-result');
        return _callOld(enriched);
      }
      // Контракт-guard перед отдачей пользователю: форма должна соответствовать
      // mixEngine. Это закрывает Риск 2 — кривой builder-выход НЕ попадает в прод.
      if (!isValidSession(result)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[fingers.engineRouter] new engine output failed contract — fallback to old', result);
        }
        _setSource('fallback-contract', 'contract');
        return _callOld(enriched);
      }
      _setSource('new');
      // Shadow-compare: возвращаем builder-результат, но логируем дифф.
      if (Fingers.flags.shadowCompare === true) {
        try {
          const oldResult = _callOld(opts);
          _logShadow(_diffSessions(result, oldResult));
        } catch (shadowErr) {
          _telemetry.shadowCompareErrors += 1;
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[fingers.engineRouter] shadow-compare error (ignored)', shadowErr);
          }
        }
      }
      return result;
    } catch (e) {
      // fail-safe: новый движок никогда не должен валить пользователю генерацию.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[fingers.engineRouter] new engine threw — fallback to old', e);
      }
      _setSource('fallback-error', 'exception');
      return _callOld(opts);
    }
  }

  Fingers.engineRouter = {
    recommendDay: recommendDay,
    isValidSession: isValidSession,
    _enrichOpts: _enrichOpts, // exposed for tests
    getTelemetry: _copyTelemetry,
    resetTelemetry: _resetTelemetry,
    DEFAULT_ROLLOUT_GATE: DEFAULT_ROLLOUT_GATE,
    configureCanary: configureCanary,
    loadCanaryFlag: loadCanaryFlag,
    evaluateRolloutGate: evaluateRolloutGate,
    enableCanaryIfGatePasses: enableCanaryIfGatePasses,
    get lastSource() { return _lastSource; },
    get lastShadowDiff() { return _lastShadowDiff; }
  };

  _loadCanaryFlagSoon();
  try {
    if (global && typeof global.addEventListener === 'function') {
      global.addEventListener('heys:client-changed', _loadCanaryFlagSoon);
      global.addEventListener('heysSyncCompleted', _loadCanaryFlagSoon);
    }
  } catch (_) { /* noop */ }

})(typeof window !== 'undefined' ? window : globalThis);
