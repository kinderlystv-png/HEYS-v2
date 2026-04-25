// heys_products_overlay_v1.js
// Phase α: foundation for overlay-only products architecture (see plan structured-mixing-stallman.md).
// Flag-gated. While overlay_products_v2 is OFF, this module is dormant — exports OverlayStore
// for QA testing but no part of HEYS reads from it.
//
// Schema (overlay row):
//   Type A (linked to shared_products):
//     { id, shared_origin_id, fingerprint?, overrides:{}, in_my_list:bool,
//       user_modified:bool, cloned_at?, shared_updated_at? }
//   Type B (custom, no shared origin):
//     { id, _custom:true, name, ...full nutrient schema..., in_my_list:bool,
//       user_modified?:bool, fingerprint? }
//
// Per-client storage key: 'heys_products_overlay_v2' (Store layer adds heys_<cid>_ prefix).

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const STORE_KEY = 'heys_products_overlay_v2';

  // Idempotent module load guard — prevents leaked listeners + closure stomp on double-include.
  if (HEYS.OverlayStore && HEYS.OverlayStore.STORE_KEY === STORE_KEY) {
    return;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Memoized merged view cache. Key invariants:
  //  - getAll() returns referentially-identical array unless invalidated.
  //  - Invalidated on: overlay write, shared cache update, heysSyncCompleted.
  //  - Object.freeze applied in dev (HEYS.flags isEnabled 'dev_module_logging').
  // ─────────────────────────────────────────────────────────────────────
  let _mergedViewCache = null;
  let _mergedViewSharedRef = null;

  function invalidateMergedView() {
    _mergedViewCache = null;
    _mergedViewSharedRef = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Raw store I/O (no merging). Per-client via Store layer scoping.
  // ─────────────────────────────────────────────────────────────────────
  function readRaw() {
    try {
      const v = HEYS.store && HEYS.store.get && HEYS.store.get(STORE_KEY, []);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function writeRaw(rows) {
    if (!Array.isArray(rows)) return false;
    try {
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(STORE_KEY, rows);
        invalidateMergedView();
        // γ.3: notify other tabs that overlay changed.
        _broadcastOverlayWrite(rows.length);
        return true;
      }
    } catch (e) {
      console.warn('[OverlayStore] writeRaw failed:', e && e.message);
    }
    return false;
  }

  // γ.3: cross-tab overlay sync via BroadcastChannel (mirrors heys_day_updates pattern).
  let _bc = null;
  let _bcSendingTabId = null;
  function _initBroadcastChannel() {
    if (_bc !== null) return _bc;
    try {
      if (typeof global !== 'undefined' && 'BroadcastChannel' in global) {
        _bcSendingTabId = (global.crypto && global.crypto.randomUUID)
          ? global.crypto.randomUUID()
          : (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
        _bc = new global.BroadcastChannel('heys_products_overlay_v2');
        _bc.onmessage = (ev) => {
          try {
            if (!ev || !ev.data || ev.data.tabId === _bcSendingTabId) return;
            if (ev.data.type === 'overlay-write') {
              invalidateMergedView();
            }
          } catch (_) { /* noop */ }
        };
      }
    } catch (e) {
      console.warn('[OverlayStore] BroadcastChannel init failed (non-fatal):', e && e.message);
      _bc = null;
    }
    return _bc;
  }

  function _broadcastOverlayWrite(rowCount) {
    const ch = _initBroadcastChannel();
    if (!ch) return;
    try {
      ch.postMessage({ type: 'overlay-write', tabId: _bcSendingTabId, rows: rowCount, ts: Date.now() });
    } catch (_) { /* noop */ }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Merged view: overlay rows + shared base.
  //
  // sharedById: Map(shared_origin_id → sharedRow). MUST be obtained from
  // cloud.getSharedIndex() so that all granular ops in one transaction see
  // the same snapshot.
  //
  // Returns:
  //   - Array (frozen in dev) of full product objects when ready.
  //   - null when sharedById is empty AND any Type A overlay row exists.
  //     Caller (the wrapper at HEYS.products.getAll) MUST fall back to
  //     legacy _origGetAll() and schedule a retry on heys:shared-products-updated.
  // ─────────────────────────────────────────────────────────────────────
  function toMergedView(sharedById) {
    const rows = readRaw();
    if (rows.length === 0) return Object.freeze([]);

    // Empty-shared-cache guard: if any Type A row exists, refuse to render
    // a broken view. Caller falls back to legacy.
    const hasTypeA = rows.some(r => r && !r._custom && r.shared_origin_id);
    if (hasTypeA && (!sharedById || sharedById.size === 0)) return null;

    const out = [];
    for (const r of rows) {
      if (!r) continue;
      if (r.in_my_list === false) continue; // soft-removed; getById may bypass this
      if (r._custom) {
        out.push(r);
        continue;
      }
      const base = sharedById && sharedById.get(String(r.shared_origin_id));
      if (!base) {
        // Shared row missing for a Type A overlay — keep overlay as-is so the row
        // does not vanish from UI. Future shared refresh re-merges.
        out.push(r);
        continue;
      }
      const merged = Object.assign({}, base, r.overrides || {}, {
        id: r.id,
        shared_origin_id: r.shared_origin_id,
        fingerprint: r.fingerprint || base.fingerprint,
        user_modified: !!r.user_modified,
      });
      out.push(merged);
    }

    // Dev-mode: freeze to fail fast on accidental mutation.
    try {
      if (HEYS.flags?.isEnabled?.('dev_module_logging')) Object.freeze(out);
    } catch (_) { /* noop */ }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Memoized public read. Wrapper at HEYS.products.getAll() should call this
  // and fall back to legacy on `null` return.
  // ─────────────────────────────────────────────────────────────────────
  function getMergedView() {
    const cloud = HEYS.cloud;
    const sharedById = cloud && typeof cloud.getSharedIndex === 'function'
      ? cloud.getSharedIndex()
      : new Map();

    // Map-reference equality: cloud.getSharedIndex() memoizes a stable Map
    // reference per content version (rebuilt on _invalidateSharedIndex).
    // Reference comparison is correct AND collision-free (vs prior size+charcode hash).
    if (_mergedViewCache !== null && _mergedViewSharedRef === sharedById) {
      return _mergedViewCache;
    }

    const view = toMergedView(sharedById);
    _mergedViewCache = view; // null is also cacheable — invalidate via heys:shared-products-updated
    _mergedViewSharedRef = sharedById;

    // γ.2: write health metric on first successful merged read post-flip.
    // Once per session — guarded by _healthWrittenThisSession.
    if (view && view !== null && Array.isArray(view) && view.length > 0) {
      _maybeWriteHealth(view);
    }

    return view;
  }

  // γ.2: health metric + first-flip toast (once per session).
  let _healthWrittenThisSession = false;
  function _maybeWriteHealth(merged) {
    if (_healthWrittenThisSession) return;
    try {
      const flagOn = HEYS.flags?.isEnabled?.('overlay_products_v2');
      if (!flagOn) return; // health is for the overlay-canonical state
      _healthWrittenThisSession = true;

      const rows = readRaw();
      const customCount = rows.filter(r => r && r._custom).length;
      const linkedCount = rows.length - customCount;
      const withIron = merged.filter(p => p && Number(p.iron) > 0).length;
      const withCalcium = merged.filter(p => p && Number(p.calcium) > 0).length;
      const withSodium = merged.filter(p => p && Number(p.sodium100) > 0).length;

      const health = {
        ts: Date.now(),
        total: merged.length,
        withIron,
        withCalcium,
        withSodium,
        overlayRows: rows.length,
        customRows: customCount,
        sharedLinkedRows: linkedCount,
        flagState: !!flagOn,
      };
      try {
        global.localStorage.setItem('heys_overlay_health', JSON.stringify(health));
      } catch (_) { /* noop */ }
      console.info('[HEYS.products] overlay health', health);

      // First-flip toast — show once per user per device.
      const NOTIFIED_KEY = 'heys_overlay_user_notified';
      if (global.localStorage.getItem(NOTIFIED_KEY) !== 'true') {
        try {
          if (HEYS.Toast?.success) {
            HEYS.Toast.success('Данные нутриентов восстановлены — статистика iron/calcium теперь точнее.');
          }
          global.localStorage.setItem(NOTIFIED_KEY, 'true');
        } catch (_) { /* noop */ }
      }
    } catch (e) {
      console.warn('[HEYS.products] health write failed (non-fatal):', e && e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Granular write API (used by setAll shim in phase β; harmless to land now).
  // ─────────────────────────────────────────────────────────────────────
  function upsertRow(row) {
    if (!row || row.id == null) return false;
    const rows = readRaw();
    const idx = rows.findIndex(r => r && String(r.id) === String(row.id));
    if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], row);
    else rows.push(row);
    return writeRaw(rows);
  }

  function removeRow(id) {
    if (id == null) return false;
    const rows = readRaw();
    const sid = String(id);
    const filtered = rows.filter(r => r && String(r.id) !== sid);
    if (filtered.length === rows.length) return false;
    return writeRaw(filtered);
  }

  function getRowById(id) {
    if (id == null) return null;
    const sid = String(id);
    const rows = readRaw();
    return rows.find(r => r && String(r.id) === sid) || null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Migration utility (phase β will call this from the boot path with a sharedById
  // snapshot). Translates legacy flat array → overlay rows.
  //
  // Strategy:
  //  - Has shared_origin_id with matching shared row: Type A. Compute deltas
  //    between local fields and shared fields; sparse `overrides` keeps only diffs.
  //  - Otherwise: Type B (_custom: true), copy full data.
  //  - PRESERVES every `id` (essential for dayv2 stamp resolution).
  // ─────────────────────────────────────────────────────────────────────
  const NUTRIENT_FIELDS = [
    'kcal100', 'protein100', 'fat100', 'carbs100',
    'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100', 'fiber100',
    'iron', 'calcium', 'magnesium', 'phosphorus', 'potassium', 'sodium100',
    'vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK',
    'vitaminB1', 'vitaminB2', 'vitaminB3', 'vitaminB6', 'vitaminB9', 'vitaminB12',
    'gi', 'harm',
  ];

  function _eqLoose(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-6;
    return false;
  }

  // Helper: build aux indexes for shared by fingerprint and normalized name.
  // Used for fallback linking when local row lacks `shared_origin_id`.
  let _sharedByFingerprintRef = null;
  let _sharedByFingerprint = null;
  let _sharedByNameRef = null;
  let _sharedByName = null;
  function _normalizeName(n) {
    return String(n || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е');
  }
  function _getSharedAuxIndexes(sharedById) {
    if (_sharedByFingerprintRef !== sharedById) {
      const byFp = new Map();
      const byName = new Map();
      sharedById.forEach((sp) => {
        if (!sp) return;
        if (sp.fingerprint) byFp.set(String(sp.fingerprint), sp);
        if (sp.name) byName.set(_normalizeName(sp.name), sp);
      });
      _sharedByFingerprint = byFp;
      _sharedByName = byName;
      _sharedByFingerprintRef = sharedById;
      _sharedByNameRef = sharedById;
    }
    return { byFingerprint: _sharedByFingerprint, byName: _sharedByName };
  }

  // Generate stable fallback id when legacy product has none.
  // Use fingerprint hash → 'p_fp_<hex>' for deterministic id (same fingerprint = same id).
  // Otherwise normalize name to 'p_name_<hash>'. Last resort: random uid.
  function _ensureProductId(p) {
    if (p.id != null) return p.id;
    if (p.fingerprint) return 'p_fp_' + String(p.fingerprint).slice(0, 16);
    if (p.name) {
      const norm = String(p.name).toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-zа-я0-9_]/gi, '');
      return 'p_name_' + norm.slice(0, 24);
    }
    return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function migrate(flatArr, sharedById) {
    if (!Array.isArray(flatArr)) return { ok: false, reason: 'input-not-array' };
    if (!sharedById || sharedById.size === 0) {
      return { ok: false, reason: 'shared-cache-empty' };
    }
    const aux = _getSharedAuxIndexes(sharedById);
    const out = [];
    let typeA = 0;
    let typeB = 0;
    let typeAByFallback = 0; // linked to shared via fingerprint/name (no shared_origin_id in legacy)
    let idGenerated = 0; // products that lacked an id (legacy data) — we generated one
    for (const p of flatArr) {
      if (!p) continue;
      // CRITICAL: if id is missing, generate stable fallback. Otherwise migrate would drop the row,
      // leaving legacy data orphaned in localStorage with no overlay representation.
      if (p.id == null) {
        p.id = _ensureProductId(p);
        idGenerated++;
      }
      let sid = p.shared_origin_id ? String(p.shared_origin_id) : null;
      let sharedRow = sid && sharedById.get(sid);
      let linkedByFallback = false;

      // Fallback linking: if no explicit shared_origin_id, try fingerprint then name match.
      // This rescues legacy data that predates shared linkage.
      if (!sharedRow) {
        if (p.fingerprint) {
          sharedRow = aux.byFingerprint.get(String(p.fingerprint));
          if (sharedRow) { sid = String(sharedRow.id); linkedByFallback = true; typeAByFallback++; }
        }
        if (!sharedRow && p.name) {
          sharedRow = aux.byName.get(_normalizeName(p.name));
          if (sharedRow) { sid = String(sharedRow.id); linkedByFallback = true; typeAByFallback++; }
        }
      }

      if (sharedRow) {
        const overrides = {};
        for (const f of NUTRIENT_FIELDS) {
          if (p[f] !== undefined && !_eqLoose(p[f], sharedRow[f])) overrides[f] = p[f];
        }
        // Preserve local name if it differs (esp. on fallback link by normalized name —
        // legacy "Молоко 2,5" matches shared "Молоко 2,5%" but display should keep local).
        if (p.name && p.name !== sharedRow.name) {
          overrides.name = p.name;
        }
        if (Array.isArray(p.portions) && p.portions.length > 0) {
          // Portions: store full array as override on any content diff.
          // Length-only check would silently lose user edits to portion grams/labels.
          const sharedPortions = Array.isArray(sharedRow.portions) ? sharedRow.portions : [];
          let portionsDiffer = p.portions.length !== sharedPortions.length;
          if (!portionsDiffer) {
            for (let i = 0; i < p.portions.length; i++) {
              const lp = p.portions[i] || {};
              const sp = sharedPortions[i] || {};
              if (lp.label !== sp.label || !_eqLoose(lp.grams, sp.grams) || !_eqLoose(lp.kcal, sp.kcal)) {
                portionsDiffer = true;
                break;
              }
            }
          }
          if (portionsDiffer) overrides.portions = p.portions;
        }
        out.push({
          id: p.id,
          shared_origin_id: sid,
          fingerprint: p.fingerprint || sharedRow.fingerprint || null,
          overrides,
          in_my_list: true,
          user_modified: !!p.user_modified,
          cloned_at: p.cloned_at || p.clonedAt || null,
          shared_updated_at: p.shared_updated_at || sharedRow.shared_updated_at || sharedRow.updated_at || null,
        });
        typeA++;
      } else {
        out.push(Object.assign({}, p, {
          _custom: true,
          in_my_list: true,
          user_modified: p.user_modified !== false,
        }));
        typeB++;
      }
    }
    return { ok: true, rows: out, typeA, typeB, typeAByFallback, idGenerated };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Verifier: id-set parity + full nutrient field parity (ε = 1e-6).
  // Used by phase β migration to halt on mismatch.
  // ─────────────────────────────────────────────────────────────────────
  function verifyMigration(preFlat, postMerged) {
    const errors = [];
    const preIds = new Set(preFlat.filter(r => r && r.id != null).map(r => String(r.id)));
    const postIds = new Set(postMerged.filter(r => r && r.id != null).map(r => String(r.id)));

    for (const id of preIds) {
      if (!postIds.has(id)) {
        errors.push({ kind: 'missing-id', id });
      }
    }

    const postById = new Map();
    for (const r of postMerged) if (r && r.id != null) postById.set(String(r.id), r);

    const fieldsToCheck = NUTRIENT_FIELDS.concat(['name']);
    for (const pre of preFlat) {
      if (!pre || pre.id == null) continue;
      const post = postById.get(String(pre.id));
      if (!post) continue; // already reported above
      for (const f of fieldsToCheck) {
        if (pre[f] === undefined && post[f] === undefined) continue;
        if (!_eqLoose(pre[f], post[f])) {
          // Allow merged view to FILL missing local fields from shared.
          // Only undefined/null are "absence" — explicit 0 is data and must round-trip.
          if (pre[f] === undefined || pre[f] === null) continue;
          // For `name`: allow post == normalized-equal-to pre (fallback-link case where
          // legacy "Молоко 2,5" matched shared "Молоко 2,5%"; UI keeps local via override
          // but if override missed, normalize-equal is acceptable).
          if (f === 'name' && _normalizeName(pre.name) === _normalizeName(post.name)) continue;
          errors.push({ kind: 'field-mismatch', id: pre.id, field: f, pre: pre[f], post: post[f] });
        }
      }
      // Portions length check (separate — array, not numeric).
      const prePortLen = Array.isArray(pre.portions) ? pre.portions.length : 0;
      const postPortLen = Array.isArray(post.portions) ? post.portions.length : 0;
      if (prePortLen > 0 && prePortLen !== postPortLen) {
        errors.push({ kind: 'portions-length', id: pre.id, pre: prePortLen, post: postPortLen });
      }
    }
    return { ok: errors.length === 0, errors: errors.slice(0, 20), totalErrors: errors.length };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Wire shared-cache invalidation event listener.
  // Anyone refreshing _sharedProductsCache should dispatch this event.
  // ─────────────────────────────────────────────────────────────────────
  if (typeof global !== 'undefined' && global.addEventListener) {
    try {
      global.addEventListener('heys:shared-products-updated', invalidateMergedView);
      global.addEventListener('heysSyncCompleted', invalidateMergedView);
      // γ.1 kill-switch: when overlay flag toggles, invalidate memo so the next
      // getAll() reads via the freshly-evaluated wrapper path (overlay vs legacy).
      global.addEventListener('heys:flag-changed', (e) => {
        if (e && e.detail && e.detail.name === 'overlay_products_v2') {
          invalidateMergedView();
        }
      });
    } catch (_) { /* noop */ }
  }

  // γ.3: init BroadcastChannel listener at module load so cross-tab invalidation
  // works even before any local writeRaw() call.
  _initBroadcastChannel();

  // ─────────────────────────────────────────────────────────────────────
  // Diagnostics surface — readable from devtools console.
  // Plan ref: fix block 9 + 10. Solo dev / power user inspection.
  // ─────────────────────────────────────────────────────────────────────
  HEYS.diagnostics = HEYS.diagnostics || {};

  HEYS.diagnostics.overlay = function () {
    const cid = (HEYS.currentClientId && String(HEYS.currentClientId)) || '<no-cid>';
    const legacyKey = `heys_${cid}_products`;
    const tryParse = (raw) => { try { return raw == null ? null : JSON.parse(raw); } catch (_) { return null; } };
    const legacyVal = tryParse(global.localStorage && global.localStorage.getItem(legacyKey));
    const rows = readRaw();
    const customCount = rows.filter(r => r && r._custom).length;

    const out = {
      flag_overlay_products_v2: HEYS.flags?.isEnabled?.('overlay_products_v2'),
      flag_dual_write_legacy: HEYS.flags?.isEnabled?.('dual_write_legacy'),
      overlay_rows: rows.length,
      overlay_typeA: rows.length - customCount,
      overlay_typeB_custom: customCount,
      legacy_len: Array.isArray(legacyVal) ? legacyVal.length : (typeof legacyVal === 'string' ? `<${legacyVal.length} chars>` : null),
      shared_cache_size: HEYS.cloud?.getSharedIndex?.()?.size ?? 0,
      health: tryParse(global.localStorage && global.localStorage.getItem('heys_overlay_health')),
      migrated_at: global.localStorage && global.localStorage.getItem('heys_overlay_migrated_at'),
      migration_status: global.localStorage && global.localStorage.getItem('heys_overlay_migration_status'),
      migration_version: global.localStorage && global.localStorage.getItem('heys_overlay_migration_version'),
      migration_aborted: global.localStorage && global.localStorage.getItem('heys_overlay_migration_aborted'),
      perf_alpha: tryParse(global.localStorage && global.localStorage.getItem('heys_overlay_phase_alpha_perf')),
      cid,
    };
    try { console.table(out); } catch (_) { console.log(out); }
    return out;
  };

  // Detailed comparison: legacy LS vs overlay vs derived merged view.
  // Use this when you suspect overlay drift from legacy.
  HEYS.diagnostics.compareStores = function () {
    const cid = (HEYS.currentClientId && String(HEYS.currentClientId)) || '<no-cid>';
    const legacyKey = `heys_${cid}_products`;
    const overlayKey = `heys_${cid}_${STORE_KEY}`;
    const tryParseLs = (raw) => {
      if (!raw) return null;
      try {
        if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) return HEYS.store.decompress(raw);
        return JSON.parse(raw);
      } catch (_) { return null; }
    };
    const legacyArr = tryParseLs(global.localStorage.getItem(legacyKey));
    const overlayArr = readRaw();
    const sharedById = HEYS.cloud?.getSharedIndex?.() || new Map();
    const merged = toMergedView(sharedById) || [];

    // Find products in legacy missing from overlay.
    const overlayIds = new Set(overlayArr.map(r => String(r?.id || '')));
    const inLegacyNotInOverlay = (Array.isArray(legacyArr) ? legacyArr : [])
      .filter(p => p && !overlayIds.has(String(p.id)))
      .map(p => ({ id: p.id, name: p.name, fingerprint: (p.fingerprint || '').slice(0, 12) }));

    const out = {
      legacy_len: Array.isArray(legacyArr) ? legacyArr.length : -1,
      overlay_len: overlayArr.length,
      merged_len: merged.length,
      shared_size: sharedById.size,
      legacy_with_iron: Array.isArray(legacyArr) ? legacyArr.filter(p => p && Number(p.iron) > 0).length : 0,
      merged_with_iron: merged.filter(p => p && Number(p.iron) > 0).length,
      missing_from_overlay_count: inLegacyNotInOverlay.length,
      missing_from_overlay_sample: inLegacyNotInOverlay.slice(0, 10),
    };
    try { console.table(out); } catch (_) { console.log(out); }
    if (inLegacyNotInOverlay.length > 0) {
      console.info('[HEYS.diagnostics] Products in legacy but NOT in overlay (first 10):', out.missing_from_overlay_sample);
    }
    return out;
  };

  HEYS.diagnostics.retryOverlayMigration = function () {
    if (!global.localStorage) return;
    global.localStorage.removeItem('heys_overlay_migration_aborted');
    global.localStorage.removeItem('heys_overlay_migrated_at');
    global.localStorage.removeItem('heys_overlay_migration_status');
    global.localStorage.removeItem('heys_overlay_migration_version');
    console.info('[HEYS.diagnostics] Overlay migration markers cleared. Reload to retry.');
  };

  // γ.4: manual re-migration without page reload. Useful when shared base
  // changed or after a one-shot upgrade to migrate() fallback logic. Reads
  // current legacy via HEYS.products.getAll() (post-self-heal) and re-translates
  // into overlay shape, capturing fingerprint/name fallback links to shared.
  // Also stamps migration markers (status=success, version=current) so the
  // interceptor's dual-write hook resumes immediately.
  HEYS.diagnostics.relinkOverlay = function () {
    const cloud = HEYS.cloud;
    const sharedById = cloud && cloud.getSharedIndex && cloud.getSharedIndex();
    if (!sharedById || sharedById.size === 0) {
      console.warn('[HEYS.diagnostics] relinkOverlay: shared cache empty');
      return null;
    }
    const Products = HEYS.products;
    if (!Products || !Products.getAll) {
      console.warn('[HEYS.diagnostics] relinkOverlay: HEYS.products unavailable');
      return null;
    }
    // Source: post-self-heal merged view from legacy (NOT raw LS).
    // We must temporarily disable overlay flag if on, to read legacy directly.
    const flagWasOn = HEYS.flags?.isEnabled?.('overlay_products_v2');
    if (flagWasOn) HEYS.flags.disable('overlay_products_v2');
    let flat = null;
    try {
      flat = Products.getAll();
    } finally {
      if (flagWasOn) HEYS.flags.enable('overlay_products_v2');
    }
    if (!Array.isArray(flat)) {
      console.warn('[HEYS.diagnostics] relinkOverlay: legacy getAll did not return array');
      return null;
    }
    const result = migrate(flat, sharedById);
    if (!result.ok) {
      console.warn('[HEYS.diagnostics] relinkOverlay aborted:', result.reason);
      return result;
    }
    writeRaw(result.rows);
    invalidateMergedView();
    _healthWrittenThisSession = false; // re-run health write on next read

    // Stamp migration markers so dual-write hook resumes (gate is migration_status === 'success').
    try {
      const CURRENT_MIGRATION_VERSION = 2;
      global.localStorage.setItem('heys_overlay_migrated_at', String(Date.now()));
      global.localStorage.setItem('heys_overlay_migration_status', 'success');
      global.localStorage.setItem('heys_overlay_migration_version', String(CURRENT_MIGRATION_VERSION));
      global.localStorage.removeItem('heys_overlay_migration_aborted');
    } catch (_) { /* noop */ }

    console.info('[HEYS.diagnostics] relinkOverlay ok', {
      typeA: result.typeA,
      typeAByFallback: result.typeAByFallback,
      typeB: result.typeB,
      total: result.rows.length,
    });
    return result;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Phase α benchmark harness — run via HEYS.diagnostics.benchOverlay() in console.
  // Phase β gate: p95Cold < 5 ms, p95Warm < 0.1 ms (200 rows × 364 shared).
  // ─────────────────────────────────────────────────────────────────────
  HEYS.diagnostics.benchOverlay = function (iters = 200) {
    const cloud = HEYS.cloud;
    if (!cloud || !cloud.getSharedIndex) {
      console.warn('[bench] cloud.getSharedIndex unavailable');
      return null;
    }
    const sharedById = cloud.getSharedIndex();
    if (sharedById.size === 0) {
      console.warn('[bench] shared cache empty; load shared products first');
      return null;
    }
    const overlayLen = readRaw().length;
    const samples = { cold: [], warm: [] };
    // COLD samples — invalidate before each call, measure full toMergedView.
    for (let i = 0; i < iters; i++) {
      invalidateMergedView();
      const t0 = performance.now();
      toMergedView(sharedById);
      samples.cold.push(performance.now() - t0);
    }
    // WARM samples — prime cache once, then measure memoized hits without invalidation.
    invalidateMergedView();
    getMergedView(); // prime
    for (let i = 0; i < iters; i++) {
      const t1 = performance.now();
      getMergedView();
      samples.warm.push(performance.now() - t1);
    }
    const p = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * q)];
    const result = {
      iters,
      overlay_rows: overlayLen,
      shared_size: sharedById.size,
      cold_p50: +p(samples.cold, 0.5).toFixed(3),
      cold_p95: +p(samples.cold, 0.95).toFixed(3),
      warm_p50: +p(samples.warm, 0.5).toFixed(3),
      warm_p95: +p(samples.warm, 0.95).toFixed(3),
      gate_cold_ok: p(samples.cold, 0.95) < 5,
      gate_warm_ok: p(samples.warm, 0.95) < 0.1,
    };
    console.table(result);
    try {
      global.localStorage.setItem('heys_overlay_phase_alpha_perf', JSON.stringify(Object.assign(result, { ts: Date.now() })));
    } catch (_) { /* noop */ }
    return result;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────
  HEYS.OverlayStore = {
    STORE_KEY,
    readRaw,
    writeRaw,
    upsertRow,
    removeRow,
    getRowById,
    toMergedView,
    getMergedView,
    invalidate: invalidateMergedView,
    migrate,
    verifyMigration,
    NUTRIENT_FIELDS,
  };

  // Brief boot note (only if dev logging on; otherwise silent in prod).
  try {
    if (HEYS.flags?.isEnabled?.('dev_module_logging')) {
      console.info('[OverlayStore] loaded (flag overlay_products_v2:', HEYS.flags?.isEnabled?.('overlay_products_v2'), ')');
    }
  } catch (_) { /* noop */ }

  // Pre-overlay snapshot cleanup — purge rollback snapshots older than 90 days.
  // Snapshots (heys_products_pre_overlay_<ts>) are written before each migration
  // as forensic-recovery; after 3 months they are dead weight in LS.
  try {
    const SNAPSHOT_TTL_MS = 90 * 86400 * 1000;
    const now = Date.now();
    const ls = global.localStorage;
    if (ls) {
      const toDelete = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.indexOf('heys_products_pre_overlay_') === 0) {
          const ts = parseInt(k.slice('heys_products_pre_overlay_'.length), 10);
          if (Number.isFinite(ts) && (now - ts) > SNAPSHOT_TTL_MS) toDelete.push(k);
        }
      }
      if (toDelete.length > 0) {
        for (const k of toDelete) ls.removeItem(k);
        console.info('[HEYS.products] snapshot cleanup', { removed: toDelete.length, ttlDays: 90 });
      }
    }
  } catch (_) { /* noop */ }

})(typeof window !== 'undefined' ? window : globalThis);
