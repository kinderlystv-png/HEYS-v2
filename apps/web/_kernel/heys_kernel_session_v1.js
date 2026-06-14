// heys_kernel_session_v1.js — ОБЩЕЕ ЯДРО: small session-builder primitives.
//
// These helpers are intentionally low-level: deterministic clone/uniq, issue
// checks, seeded noise, seed rotation, and stable score sorting. Domain builders
// keep their slot maps, scoring formulas, safety policies, and exercise shapes.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.session && TK.session.__registered) return; // idempotent

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uniq(arr) {
    const seen = {};
    return (arr || []).filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  function hasIssueLevel(issues, level) {
    return (issues || []).some(function (i) { return i && i.level === level; });
  }

  function issueCodes(issues, level) {
    return (issues || [])
      .filter(function (i) { return i && (!level || i.level === level); })
      .map(function (i) { return i.code; });
  }

  function seededNoise(id, seed) {
    if (!seed) return 0;
    const raw = String(id || '') + ':' + String(seed);
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 100;
  }

  function rotateBySeed(list, seed) {
    const arr = Array.isArray(list) ? list : [];
    const n = arr.length;
    if (!n || !seed) return arr;
    const off = ((Math.floor(seed) % n) + n) % n;
    if (off === 0) return arr;
    return arr.slice(off).concat(arr.slice(0, off));
  }

  function stableSortByScore(items, scoreFn, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    return (items || []).map(function (item, idx) {
      return { item: item, idx: idx, score: Number(scoreFn(item, idx)) || 0 };
    }).sort(function (a, b) {
      const delta = a.score - b.score;
      return delta ? delta * dir : a.idx - b.idx;
    }).map(function (x) { return x.item; });
  }

  function sortByScoreThenKey(items, scoreFn, keyFn, direction) {
    const dir = direction === 'asc' ? 1 : -1;
    return (items || []).slice().sort(function (a, b) {
      const sa = Number(scoreFn(a)) || 0;
      const sb = Number(scoreFn(b)) || 0;
      if (sa !== sb) return (sa - sb) * dir;
      const ka = String(keyFn ? keyFn(a) : '');
      const kb = String(keyFn ? keyFn(b) : '');
      return ka.localeCompare(kb);
    });
  }

  function firstPassing(items, predicates) {
    const list = Array.isArray(items) ? items : [];
    const checks = Array.isArray(predicates) ? predicates : [];
    for (let i = 0; i < list.length; i++) {
      let ok = true;
      for (let j = 0; j < checks.length; j++) {
        if (typeof checks[j] === 'function' && !checks[j](list[i], i)) {
          ok = false;
          break;
        }
      }
      if (ok) return list[i];
    }
    return null;
  }

  function rankCandidates(items, opts) {
    const o = opts || {};
    const list = Array.isArray(items) ? items : [];
    const filters = Array.isArray(o.filters) ? o.filters : [];
    const issueFn = typeof o.issues === 'function' ? o.issues : function () { return []; };
    const blockIssue = typeof o.blockIssue === 'function' ? o.blockIssue : null;
    const scoreFn = typeof o.score === 'function' ? o.score : function () { return 0; };
    const candidateFn = typeof o.candidate === 'function'
      ? o.candidate
      : function (item, issues, score) { return { item: item, issues: issues, score: score }; };
    const out = [];
    list.forEach(function (item, index) {
      for (let i = 0; i < filters.length; i++) {
        if (typeof filters[i] === 'function' && !filters[i](item, index)) return;
      }
      const issues = issueFn(item, index) || [];
      if (blockIssue && (issues || []).some(blockIssue)) return;
      out.push(candidateFn(item, issues, Number(scoreFn(item, issues, index)) || 0, index));
    });
    const keyFn = typeof o.key === 'function' ? o.key : null;
    return keyFn
      ? sortByScoreThenKey(out, function (x) { return Number(x.score) || 0; }, keyFn, o.direction || 'desc')
      : stableSortByScore(out, function (x) { return Number(x.score) || 0; }, o.direction || 'desc');
  }

  TK.session = {
    __registered: true,
    cloneJson: cloneJson,
    uniq: uniq,
    hasIssueLevel: hasIssueLevel,
    issueCodes: issueCodes,
    seededNoise: seededNoise,
    rotateBySeed: rotateBySeed,
    stableSortByScore: stableSortByScore,
    sortByScoreThenKey: sortByScoreThenKey,
    firstPassing: firstPassing,
    rankCandidates: rankCandidates
  };
})(typeof window !== 'undefined' ? window : globalThis);
