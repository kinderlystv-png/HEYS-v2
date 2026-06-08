// heys_fingers_engine_router_v1.js — Strangler router (Phase 1 / step 4 part 1).
//
// Источник плана: KICKOFF.md «Strangler-fig» + cloud-agent brief Шаг 4.
//
// Назначение: единая точка `recommendDay(opts)` которая по флагу
// `HEYS.Fingers.flags.newEngine` направляет вызов на старый mix_engine
// (default) или на новый sessionBuilder (Phase 4.2+, пока не реализован).
//
// **Безопасные инварианты:**
// 1. Default флага = false → роутер прозрачно делегирует в `mixEngine.recommendDay`.
//    При flag=off результат **бит-в-бит** идентичен прямому вызову mix_engine
//    (см. fingers-engine-router.test.js — регресс «strangler не меняет поведение»).
// 2. UI пока вызывает `mixEngine.recommendDay` напрямую — роутер лежит off-live-path,
//    подключение UI = отдельный шаг 4 part N.
// 3. При flag=on:
//    - sessionBuilder отсутствует / возвращает null|undefined → fallback на mix_engine.
//    - sessionBuilder бросает — try/catch → warn в console + fallback на mix_engine.
//    Это гарантирует «новый движок не валит сессию пользователю» на любой стадии.
//
// Public API:
//   HEYS.Fingers.flags.newEngine               — boolean флаг (default false)
//   HEYS.Fingers.engineRouter.recommendDay(opts)
//   HEYS.Fingers.engineRouter.lastSource       — 'old'|'new'|'fallback'|'fallback-error'|'fallback-contract'
//   HEYS.Fingers.engineRouter.isValidSession(s)— контракт-guard (для тестов/телеметрии)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__engineRouterRegistered) return; // idempotent
  Fingers.__engineRouterRegistered = true;

  // Флаги — namespace. Не перезаписываем, если установлен внешне.
  Fingers.flags = Fingers.flags || {};
  if (typeof Fingers.flags.newEngine !== 'boolean') {
    Fingers.flags.newEngine = false; // безопасный default
  }
  if (typeof Fingers.flags.shadowCompare !== 'boolean') {
    Fingers.flags.shadowCompare = false; // shadow-compare выключен по умолчанию
  }

  // Хранилище последнего shadow-diff для тестов/телеметрии.
  let _lastShadowDiff = null;

  // Диагностика последнего вызова (для тестов/телеметрии).
  let _lastSource = null;

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
  function _diffSessions(newS, oldS) {
    if (!newS || !oldS) return { onlyOne: !newS ? 'old' : 'new' };
    return {
      intensity: { new: newS.intensity, old: oldS.intensity, same: newS.intensity === oldS.intensity },
      durationMin: { new: newS.durationMin, old: oldS.durationMin, deltaMin: (newS.durationMin || 0) - (oldS.durationMin || 0) },
      exerciseCount: { new: newS.exercises.length, old: oldS.exercises.length },
      roles: {
        new: newS.exercises.map(function (e) { return e.__role; }),
        old: oldS.exercises.map(function (e) { return e.__role; })
      },
      requiresWarmup: { new: newS.requiresWarmup, old: oldS.requiresWarmup, same: newS.requiresWarmup === oldS.requiresWarmup }
    };
  }

  function _logShadow(diff) {
    _lastShadowDiff = diff;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[fingers.engineRouter] shadow-compare diff', diff);
    }
  }

  function recommendDay(opts) {
    const useNew = Fingers.flags && Fingers.flags.newEngine === true;
    if (!useNew) {
      _lastSource = 'old';
      return _callOld(opts);
    }
    // Путь новой логики — Phase 4.2+. Пока sessionBuilder не зарегистрирован,
    // прозрачно fallback'имся на старый движок.
    const builder = Fingers.sessionBuilder;
    if (!builder || typeof builder.recommendDay !== 'function') {
      _lastSource = 'fallback';
      return _callOld(opts);
    }
    try {
      const result = builder.recommendDay(opts);
      if (result === null || result === undefined) {
        _lastSource = 'fallback';
        return _callOld(opts);
      }
      // Контракт-guard перед отдачей пользователю: форма должна соответствовать
      // mixEngine. Это закрывает Риск 2 — кривой builder-выход НЕ попадает в прод.
      if (!isValidSession(result)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[fingers.engineRouter] new engine output failed contract — fallback to old', result);
        }
        _lastSource = 'fallback-contract';
        return _callOld(opts);
      }
      _lastSource = 'new';
      // Shadow-compare: возвращаем builder-результат, но логируем дифф.
      if (Fingers.flags.shadowCompare === true) {
        try {
          const oldResult = _callOld(opts);
          _logShadow(_diffSessions(result, oldResult));
        } catch (shadowErr) {
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
      _lastSource = 'fallback-error';
      return _callOld(opts);
    }
  }

  Fingers.engineRouter = {
    recommendDay: recommendDay,
    isValidSession: isValidSession,
    get lastSource() { return _lastSource; },
    get lastShadowDiff() { return _lastShadowDiff; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
