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

  function asList(value, fallback) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'function') return value;
    return fallback || [];
  }

  function buildPipeline(slots, opts) {
    const o = opts || {};
    const slotList = Array.isArray(slots) ? slots : [];
    const out = [];
    const trace = [];
    const slotResults = [];
    const candidatesFn = typeof o.candidates === 'function' ? o.candidates : function () { return []; };
    const filtersOpt = asList(o.filters, []);
    const issuesFn = typeof o.issues === 'function' ? o.issues : function () { return []; };
    const blockIssue = typeof o.blockIssue === 'function' ? o.blockIssue : null;
    const scoreFn = typeof o.score === 'function' ? o.score : function () { return 0; };
    const candidateFn = typeof o.candidate === 'function'
      ? o.candidate
      : function (item, issues, score, index, slot) {
        return { item: item, issues: issues, score: score, index: index, slot: slot };
      };
    const keyFn = typeof o.key === 'function' ? o.key : null;
    const selectFn = typeof o.select === 'function' ? o.select : function (ranked) { return ranked[0] || null; };
    const materializeFn = typeof o.materialize === 'function'
      ? o.materialize
      : function (picked) { return picked && (picked.item || picked); };
    const traceFn = typeof o.trace === 'function' ? o.trace : null;

    slotList.forEach(function (slot, slotIndex) {
      const raw = candidatesFn(slot, slotIndex) || [];
      const filters = typeof filtersOpt === 'function' ? (filtersOpt(slot, slotIndex) || []) : filtersOpt;
      const ranked = rankCandidates(raw, {
        filters: filters,
        issues: function (item, index) { return issuesFn(item, slot, index); },
        blockIssue: blockIssue ? function (issue, item, index) { return blockIssue(issue, item, slot, index); } : null,
        score: function (item, issues, index) { return scoreFn(item, slot, issues, index); },
        candidate: function (item, issues, score, index) {
          return candidateFn(item, issues, score, index, slot);
        },
        key: keyFn ? function (candidate) { return keyFn(candidate, slot); } : null,
        direction: o.direction || 'desc'
      });
      const picked = selectFn(ranked, slot, slotIndex);
      const item = picked ? materializeFn(picked, slot, slotIndex) : null;
      const traceRow = traceFn
        ? traceFn({ slot: slot, slotIndex: slotIndex, raw: raw, candidates: ranked, picked: picked, item: item })
        : {
          slot: slot && slot.id,
          picked: picked && (picked.id || (picked.item && picked.item.id) || (picked.atom && picked.atom.id)) || null,
          candidateCount: ranked.length,
          reason: picked ? 'picked' : 'no_safe_candidate'
        };
      trace.push(traceRow);
      slotResults.push({ slot: slot, raw: raw, candidates: ranked, picked: picked, item: item, trace: traceRow });
      if (item) out.push(item);
    });

    return {
      items: out,
      trace: trace,
      slots: slotResults
    };
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
    rankCandidates: rankCandidates,
    buildPipeline: buildPipeline
  };
})(typeof window !== 'undefined' ? window : globalThis);
