// heys_kernel_bibliography_v1.js — ОБЩЕЕ ЯДРО: реестр источников (механизм).
//
// Single source of truth для механизма «реестр библиографии»: индекс по id,
// lookup, resolve-списка, поиск отсутствующих, сила источника. ДАННЫЕ (записи
// источников) и UI (бейджи/модалки) — доменные, здесь только
// data-agnostic логика. Меняем механизм здесь → меняется у всех режимов.
//
// Namespace ядра: HEYS.TrainingKernel.* (рядом с HEYS.TrainingFocus — UI-примитивы).
//
// Public API (HEYS.TrainingKernel.bibliography):
//   createRegistry(items, opts?) → {
//     get(id), all(), resolve(ids), missing(ids), strengthOf(id), byId, size
//   }
//   items: Array<item> | Object<id,item>; opts.idKey (default 'id').
//   Поле item.strength опционально (для strengthOf).

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.bibliography && TK.bibliography.__registered) return; // idempotent

  function toList(items) {
    if (Array.isArray(items)) return items.slice();
    if (items && typeof items === 'object') {
      return Object.keys(items).map(function (k) { return items[k]; });
    }
    return [];
  }

  function createRegistry(items, opts) {
    const o = opts || {};
    const idKey = o.idKey || 'id';
    const list = toList(items);
    const byId = Object.create(null);
    list.forEach(function (it) {
      if (it && it[idKey] != null) byId[it[idKey]] = it;
    });
    function get(id) { return byId[id] || null; }
    function all() { return list.slice(); }
    function resolve(ids) { return (Array.isArray(ids) ? ids : []).map(get).filter(Boolean); }
    function missing(ids) { return (Array.isArray(ids) ? ids : []).filter(function (id) { return !byId[id]; }); }
    function strengthOf(id) { const it = byId[id]; return it && it.strength != null ? it.strength : null; }
    return {
      get: get, all: all, resolve: resolve, missing: missing,
      strengthOf: strengthOf, byId: byId, size: list.length
    };
  }

  TK.bibliography = {
    __registered: true,
    createRegistry: createRegistry
  };
})(typeof window !== 'undefined' ? window : globalThis);
