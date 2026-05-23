/**
 * @fileoverview Tests for shrink-guard family (plan rustling-dazzling-bentley.md F3+F4+F9+F14)
 *
 * Pure-logic simulation of:
 * 1. setAll tombstone-aware shrink-guard (F3) — heys_core_v12.js
 * 2. OverlayStore.writeRaw shrink-guard (F4) — heys_products_overlay_v1.js
 * 3. _allShrinkRemovalsTombstoned helper (F9) — heys_storage_supabase_v1.js
 * 4. resolveProductByItem best-match priority (F14) — heys_day_utils.js
 *
 * Контракты симулированы, не используют реальный IIFE bundle (тяжело mock'ать
 * window.HEYS). Если контракт изменится в коде, эти тесты должны быть обновлены
 * параллельно — они закрывают класс "случайный регресс в логике", не "точное
 * соответствие с источником".
 */

import { describe, expect, it } from 'vitest';

// === ШАРЫ ===

const TOMBSTONE_BYPASS_SOURCES = new Set(['delete-product', 'deduplicate', 'cloud-sync']);

/**
 * Симуляция F3: setAll shrink-guard.
 * Возвращает { allowed, reason, removed }.
 */
function setAllShrinkGuard({ prevProducts, newProducts, source, allowShrink, tombstones }) {
  const prevLen = Array.isArray(prevProducts) ? prevProducts.length : 0;
  const newLen = Array.isArray(newProducts) ? newProducts.length : 0;

  // Guard срабатывает только если allowShrink=true и source НЕ в bypass-allowlist
  if (!allowShrink || TOMBSTONE_BYPASS_SOURCES.has(source)) {
    return { allowed: true, reason: 'no-guard', removed: [] };
  }
  if (prevLen === 0 || newLen >= prevLen) {
    return { allowed: true, reason: 'no-shrink', removed: [] };
  }

  const newIds = new Set();
  for (const p of newProducts) {
    const pid = String((p && (p.id ?? p.product_id)) || '');
    if (pid) newIds.add(pid);
  }
  const removed = [];
  for (const p of prevProducts) {
    const pid = String((p && (p.id ?? p.product_id)) || '');
    if (pid && !newIds.has(pid)) removed.push({ id: pid, name: p && p.name });
  }
  if (removed.length === 0) {
    return { allowed: true, reason: 'no-id-removals', removed: [] };
  }

  const tombSet = new Set();
  const tombNameSet = new Set();
  for (const t of (tombstones || [])) {
    if (!t) continue;
    if (t.id != null) tombSet.add(String(t.id));
    if (t.name) tombNameSet.add(String(t.name).trim().toLowerCase());
  }
  const untombstoned = removed.filter((r) => {
    if (r.id && tombSet.has(String(r.id))) return false;
    if (r.name && tombNameSet.has(String(r.name).trim().toLowerCase())) return false;
    return true;
  });

  if (untombstoned.length > 0) {
    return { allowed: false, reason: 'untombstoned-removals', removed, untombstoned };
  }
  return { allowed: true, reason: 'all-tombstoned', removed };
}

/**
 * F9: _allShrinkRemovalsTombstoned helper (cloud-sync gate).
 */
function allShrinkRemovalsTombstoned(prevArr, newArr, tombstones) {
  if (!Array.isArray(prevArr) || !Array.isArray(newArr)) return false;
  const newIds = new Set();
  for (const p of newArr) {
    const pid = String((p && (p.id ?? p.product_id)) || '');
    if (pid) newIds.add(pid);
  }
  const removed = [];
  for (const p of prevArr) {
    const pid = String((p && (p.id ?? p.product_id)) || '');
    if (pid && !newIds.has(pid)) removed.push({ id: pid, name: p && p.name });
  }
  if (removed.length === 0) return true;
  const tombIds = new Set();
  const tombNames = new Set();
  for (const t of (tombstones || [])) {
    if (!t) continue;
    if (t.id != null) tombIds.add(String(t.id));
    if (t.name) tombNames.add(String(t.name).trim().toLowerCase());
  }
  return removed.every((r) => {
    if (r.id && tombIds.has(String(r.id))) return true;
    if (r.name && tombNames.has(String(r.name).trim().toLowerCase())) return true;
    return false;
  });
}

/**
 * F14: resolveProductByItem с best-match priority.
 */
const normalizeName = (s) =>
  String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е');

function coerceTs(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const parsed = Date.parse(String(v));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveProductByItem(item, productsList) {
  if (!item) return null;
  const list = Array.isArray(productsList) ? productsList : [];
  if (!list.length) return null;
  const productId = item.product_id ?? item.productId;
  const itemFingerprint = item.fingerprint || null;
  const itemName = String(item.name || '').trim();
  const itemNameNorm = normalizeName(itemName);
  const itemNameLower = itemName.toLowerCase();

  let idMatch = null;
  let fpMatch = null;
  const nameMatches = [];
  for (const product of list) {
    if (!product || typeof product !== 'object') continue;
    if (!idMatch && productId != null
        && String(product.id ?? product.product_id ?? '') === String(productId)) {
      idMatch = product;
      break;
    }
    if (!fpMatch && itemFingerprint && product.fingerprint && product.fingerprint === itemFingerprint) {
      fpMatch = product;
    }
    const productName = String(product.name || '').trim();
    if (productName) {
      const productNameLower = productName.toLowerCase();
      if (productNameLower === itemNameLower || normalizeName(productName) === itemNameNorm) {
        nameMatches.push(product);
      }
    }
  }
  if (idMatch) return idMatch;
  if (fpMatch) return fpMatch;
  if (nameMatches.length === 0) return null;
  if (nameMatches.length === 1) return nameMatches[0];

  let best = nameMatches[0];
  let bestTs = coerceTs(best.created_at ?? best.createdAt);
  for (let k = 1; k < nameMatches.length; k++) {
    const cand = nameMatches[k];
    const ts = coerceTs(cand.created_at ?? cand.createdAt);
    if (ts != null && (bestTs == null || ts < bestTs)) {
      best = cand;
      bestTs = ts;
    }
  }
  return best;
}

// ===  ТЕСТЫ ===

const mk = (id, name, extras = {}) => ({ id, name, kcal100: 100, ...extras });

describe('F3: setAll shrink-guard', () => {
  it('пропускает запись когда нет allowShrink (защита извне)', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [mk('p1', 'A')],
      source: 'evil',
      allowShrink: false,
      tombstones: [],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no-guard');
  });

  it('пропускает source delete-product даже без tombstone', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [mk('p1', 'A')],
      source: 'delete-product',
      allowShrink: true,
      tombstones: [],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no-guard');
  });

  it('пропускает source deduplicate', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [mk('p1', 'A')],
      source: 'deduplicate',
      allowShrink: true,
      tombstones: [],
    });
    expect(result.allowed).toBe(true);
  });

  it('пропускает source cloud-sync (есть own shrink-tolerance gate)', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [mk('p1', 'A')],
      source: 'cloud-sync',
      allowShrink: true,
      tombstones: [],
    });
    expect(result.allowed).toBe(true);
  });

  it('БЛОКИРУЕТ untombstoned shrink из недоверенного источника', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B'), mk('p3', 'C')],
      newProducts: [mk('p1', 'A')],
      source: 'evil-cleanup',
      allowShrink: true,
      tombstones: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('untombstoned-removals');
    expect(result.untombstoned).toHaveLength(2);
  });

  it('пропускает shrink когда все удалённые id tombstoned', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [mk('p1', 'A')],
      source: 'evil-cleanup',
      allowShrink: true,
      tombstones: [{ id: 'p2', name: 'B' }],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('all-tombstoned');
  });

  it('распознаёт tombstone по name если id различаются', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p_old_xx', 'Avocado')],
      newProducts: [],
      source: 'evil-import',
      allowShrink: true,
      tombstones: [{ name: 'Avocado' }], // tombstone без id, только name
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('all-tombstoned');
  });

  it('БЛОКИРУЕТ когда хоть один removal без tombstone', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A'), mk('p2', 'B')],
      newProducts: [],
      source: 'evil',
      allowShrink: true,
      tombstones: [{ id: 'p1', name: 'A' }], // только p1
    });
    expect(result.allowed).toBe(false);
    expect(result.untombstoned.map((r) => r.id)).toEqual(['p2']);
  });

  it('не trigger guard когда newLen >= prevLen (grow)', () => {
    const result = setAllShrinkGuard({
      prevProducts: [mk('p1', 'A')],
      newProducts: [mk('p1', 'A'), mk('p2', 'B')],
      source: 'evil',
      allowShrink: true,
      tombstones: [],
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no-shrink');
  });
});

describe('F9: _allShrinkRemovalsTombstoned (cloud-sync gate)', () => {
  it('true когда нет удалений', () => {
    const r = allShrinkRemovalsTombstoned(
      [mk('p1', 'A')],
      [mk('p1', 'A')],
      []
    );
    expect(r).toBe(true);
  });

  it('false когда есть удаления без tombstone', () => {
    const r = allShrinkRemovalsTombstoned(
      [mk('p1', 'A'), mk('p2', 'B')],
      [mk('p1', 'A')],
      []
    );
    expect(r).toBe(false);
  });

  it('true когда все удалённые имеют tombstone (10% shrink → закрывает D10 live-bug)', () => {
    const prev = Array.from({ length: 10 }, (_, i) => mk('p' + i, 'name' + i));
    const next = prev.slice(0, 9); // удалили 1 из 10 (10%)
    const tomb = [{ id: 'p9', name: 'name9' }];
    const r = allShrinkRemovalsTombstoned(prev, next, tomb);
    expect(r).toBe(true);
  });

  it('false когда даже 1 из tombstone-удалений не покрыт', () => {
    const prev = [mk('p1', 'A'), mk('p2', 'B'), mk('p3', 'C')];
    const next = []; // все удалены
    const tomb = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]; // только 2 из 3
    expect(allShrinkRemovalsTombstoned(prev, next, tomb)).toBe(false);
  });

  it('matching по name работает (id-mismatch ок)', () => {
    const prev = [{ id: 'p_with_id', name: 'Молоко' }];
    const next = [];
    const tomb = [{ name: 'молоко' }]; // tombstone по name lowercase
    expect(allShrinkRemovalsTombstoned(prev, next, tomb)).toBe(true);
  });
});

describe('F14: resolveProductByItem best-match priority', () => {
  it('возвращает id-match даже если name тоже match', () => {
    const list = [
      { id: 'pA', name: 'common-name' },
      { id: 'pTarget', name: 'common-name' },
    ];
    const item = { product_id: 'pTarget', name: 'common-name' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('pTarget');
  });

  it('возвращает fingerprint-match когда id отсутствует', () => {
    const list = [
      { id: 'pA', name: 'XX', fingerprint: 'fp_other' },
      { id: 'pB', name: 'XX', fingerprint: 'fp_TARGET' },
    ];
    const item = { name: 'XX', fingerprint: 'fp_TARGET' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('pB');
  });

  it('возвращает name-match когда нет id/fingerprint match', () => {
    const list = [
      { id: 'pA', name: 'Almonds' },
      { id: 'pB', name: 'Walnuts' },
    ];
    const item = { product_id: 'p_unknown', name: 'Walnuts' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('pB');
  });

  it('при 2 name-match выбирает с created_at старше (tiebreaker)', () => {
    const list = [
      { id: 'p_newer', name: 'Duplicate', created_at: '2026-05-01T00:00:00Z' },
      { id: 'p_older', name: 'Duplicate', created_at: '2025-01-01T00:00:00Z' },
    ];
    const item = { name: 'Duplicate' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('p_older');
  });

  it('при 2 name-match без created_at возвращает первый', () => {
    const list = [
      { id: 'p_first', name: 'NoTs' },
      { id: 'p_second', name: 'NoTs' },
    ];
    const item = { name: 'NoTs' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('p_first');
  });

  it('case-insensitive + ё/е normalization match', () => {
    const list = [
      { id: 'p1', name: 'СЫР ТВЕРДЫЙ' }, // upper, без ё
    ];
    const item = { name: 'сыр твёрдый' }; // lower, с ё
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('p1');
  });

  it('возвращает null когда нет ни одного match', () => {
    const list = [{ id: 'pA', name: 'Apple' }];
    const item = { product_id: 'pX', name: 'Pear' };
    expect(resolveProductByItem(item, list)).toBeNull();
  });

  it('возвращает null для пустого list', () => {
    expect(resolveProductByItem({ name: 'X' }, [])).toBeNull();
  });

  it('id-match имеет приоритет над fingerprint-match', () => {
    const list = [
      { id: 'p_fp', name: 'A', fingerprint: 'fp_target' },
      { id: 'p_id', name: 'A' },
    ];
    const item = { product_id: 'p_id', fingerprint: 'fp_target', name: 'A' };
    const result = resolveProductByItem(item, list);
    expect(result.id).toBe('p_id');
  });
});

describe('F4: OverlayStore.writeRaw shrink-guard (parallel logic to F3)', () => {
  // writeRaw имеет тот же tombstone-check паттерн, но default — guard on
  // (allowShrink:true ОБХОДИТ guard, без него — проверяем).
  function writeRawGuard({ prevRows, newRows, allowShrink, tombstones }) {
    if (allowShrink) return { allowed: true, reason: 'allowShrink' };
    if (newRows.length >= prevRows.length) return { allowed: true, reason: 'no-shrink' };
    const newIds = new Set(newRows.map((r) => String(r.id || '')).filter(Boolean));
    const removed = [];
    for (const r of prevRows) {
      const pid = String(r.id || '');
      if (pid && !newIds.has(pid)) removed.push({ id: pid, name: r.name });
    }
    if (removed.length === 0) return { allowed: true, reason: 'no-id-removals' };
    const tombIds = new Set();
    const tombNames = new Set();
    for (const t of (tombstones || [])) {
      if (!t) continue;
      if (t.id != null) tombIds.add(String(t.id));
      if (t.name) tombNames.add(String(t.name).trim().toLowerCase());
    }
    const untombstoned = removed.filter((r) => {
      if (r.id && tombIds.has(String(r.id))) return false;
      if (r.name && tombNames.has(String(r.name).trim().toLowerCase())) return false;
      return true;
    });
    if (untombstoned.length > 0) {
      return { allowed: false, reason: 'untombstoned', untombstoned };
    }
    return { allowed: true, reason: 'all-tombstoned' };
  }

  it('allowShrink:true пропускает (applyCloudSnapshot path)', () => {
    const r = writeRawGuard({
      prevRows: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }],
      newRows: [],
      allowShrink: true,
      tombstones: [],
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('allowShrink');
  });

  it('БЛОКИРУЕТ shrink без allowShrink + без tombstone (removeRow без tombstone setup)', () => {
    const r = writeRawGuard({
      prevRows: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }],
      newRows: [{ id: 'r1', name: 'A' }],
      allowShrink: false,
      tombstones: [],
    });
    expect(r.allowed).toBe(false);
    expect(r.untombstoned).toHaveLength(1);
  });

  it('пропускает shrink с tombstone-coverage (delete-product flow: tombstone до writeRaw)', () => {
    const r = writeRawGuard({
      prevRows: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }],
      newRows: [{ id: 'r1', name: 'A' }],
      allowShrink: false,
      tombstones: [{ id: 'r2', name: 'B' }],
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('all-tombstoned');
  });
});
