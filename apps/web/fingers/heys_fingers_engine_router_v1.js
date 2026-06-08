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
  // mixEngine.recommendDay → `{intensity:string, exercises:Array}` с непустым
  // exercises. Иначе кривой выход уйдёт пользователю молча (Риск 2 ревью).
  function isValidSession(s) {
    if (!s || typeof s !== 'object') return false;
    if (typeof s.intensity !== 'string' || !s.intensity) return false;
    if (!Array.isArray(s.exercises) || s.exercises.length === 0) return false;
    return true;
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
    get lastSource() { return _lastSource; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
