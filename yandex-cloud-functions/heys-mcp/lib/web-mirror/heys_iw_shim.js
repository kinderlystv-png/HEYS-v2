// heys_iw_shim.js — Insulin Wave Module Shim
// Версия: 1.0.0 | Дата: 2026-01-11
//
// ЦЕЛЬ: Подготовка namespace для модульной загрузки InsulinWave
// 
// КРИТИЧЕСКИЕ ПРАВИЛА:
// 1. НЕ добавляем публичные ключи — только __internals
// 2. Идемпотентность — можно загружать многократно
// 3. Не затираем существующий HEYS.InsulinWave если уже загружен монолит
//
// СТРУКТУРА:
// HEYS.InsulinWave = {
//   __internals: {
//     _loaded: { shim: true, constants: false, utils: false, ... },
//     _stubs: {} // для отладки загрузки модулей
//   }
// }

(function(global) {
  'use strict';
  
  // Создаём HEYS namespace если не существует
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Создаём/получаем InsulinWave namespace
  // НЕ затираем если уже существует (может быть загружен монолит)
  const IW = HEYS.InsulinWave = HEYS.InsulinWave || {};
  
  // Создаём alias IW (идемпотентно)
  if (!HEYS.IW) {
    HEYS.IW = IW;
  }
  
  // === ТОЛЬКО __internals — БЕЗ ПУБЛИЧНЫХ КЛЮЧЕЙ ===
  
  // Создаём __internals если не существует
  IW.__internals = IW.__internals || {};
  
  // Флаги загрузки модулей (идемпотентно)
  IW.__internals._loaded = IW.__internals._loaded || {};
  
  // Заглушки для отладки (внутренние, не публичные)
  IW.__internals._stubs = IW.__internals._stubs || {};
  
  // Отмечаем что shim загружен
  IW.__internals._loaded.shim = true;
  
  // Verbose init log removed (as per plan requirements)
  
})(typeof window !== 'undefined' ? window : global);
