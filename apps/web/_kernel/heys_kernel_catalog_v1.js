// heys_kernel_catalog_v1.js — ОБЩЕЕ ЯДРО: индекс каталога (id + группировки).
//
// Single source механизма каталога, который дублировали block_catalog (пальцы) и
// atom_catalog (мобильность): индекс по id + группировки по полям. ДАННЫЕ (атомы/
// блоки) и доменная схема-валидация (validate/validateAtom) остаются в доменах.
//
// Public API (HEYS.TrainingKernel.catalog):
//   createIndex(items, { idKey='id', groupBy:[fields] }) → {
//     get(id), all(), by(field, value), ids(), byId, size
//   }
//   items: Array | Object<id,item>; группировка только по скалярным полям.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.catalog && TK.catalog.__registered) return; // idempotent

  function toList(items) {
    if (Array.isArray(items)) return items.slice();
    if (items && typeof items === 'object') return Object.keys(items).map(function (k) { return items[k]; });
    return [];
  }

  function createIndex(items, opts) {
    const o = opts || {};
    const idKey = o.idKey || 'id';
    const groupBy = Array.isArray(o.groupBy) ? o.groupBy : [];
    const list = toList(items);
    const byId = Object.create(null);
    const groups = {};
    groupBy.forEach(function (f) { groups[f] = Object.create(null); });
    list.forEach(function (it) {
      if (!it) return;
      if (it[idKey] != null) byId[it[idKey]] = it;
      groupBy.forEach(function (f) {
        const v = it[f];
        if (v == null) return;
        (groups[f][v] = groups[f][v] || []).push(it);
      });
    });
    function get(id) { return byId[id] || null; }
    function all() { return list.slice(); }
    function by(field, value) {
      const g = groups[field];
      return g && g[value] ? g[value].slice() : [];
    }
    function ids() { return Object.keys(byId); }
    return { get: get, all: all, by: by, ids: ids, byId: byId, size: list.length };
  }

  TK.catalog = {
    __registered: true,
    createIndex: createIndex
  };
})(typeof window !== 'undefined' ? window : globalThis);
