# @heys/web

## 13.2.0 — v4.8.8 AI Product Parser Update (February 12, 2026)

### Feature: Cholesterol Support + Schema Alignment 🧬

**Added cholesterol field parsing** — AI product parser now supports cholesterol (mg/100g), aligned with `shared_products` DB schema.

#### Changes

- **ADDED**: Cholesterol field support in AI parser
  - `AI_PRODUCT_FIELD_MAP`: Added `'cholesterol'` with Russian aliases `['холестерин', 'холестер', 'cholesterol']`
  - `EXTENDED_NUTRIENT_KEYS`: Added `'Chol': 'cholesterol'` for compact notation
- **FIXED**: Case mismatch between parser and DB
  - Changed `'badFat100'/'goodFat100'` → `'badfat100'/'goodfat100'` (lowercase)
  - Added `normalizeProductFields()` call in parser for app compatibility
- **VERIFIED**: Legacy fields not in use
  - `folate` column: 0/292 products (data in `vitamin_b9`)
  - `sodium` column: 0/292 products (data in `sodium100`)

#### New AI Prompt Format

```
ОБЯЗАТЕЛЬНО:
Название: X
...
Вредные жиры: X
Полезные жиры: X
...

ОПЦИОНАЛЬНО:
Холестерин: X (мг/100г)  ← NEW!
Натрий: X
...
```

#### Modified Files

- `apps/web/heys_models_v1.js` (v4.8.8 — AI parser update)
- `docs/AI_PRODUCT_PARSE_PROMPT.md` (NEW — comprehensive prompt guide)

#### Documentation

- [AI_PRODUCT_PARSE_PROMPT.md](../../docs/AI_PRODUCT_PARSE_PROMPT.md) — Full AI parsing guide with 50+ field examples
- Test file: `test_ai_parser_v4.8.8.html` — Interactive parser testing

---

## 13.1.0 — v4.8.8 React State Sync Fix (February 12, 2026)

### Critical Bug Fix 🛡️

**Fixed: React state namespacing conflict** — Resolved critical issue where React components displayed 42 products with micronutrients instead of 290, blocking pattern activation.

#### Changes

- **FIXED**: React now reads from Store API (`products.getAll()`) instead of direct `utils.lsGet` calls
- **FIXED**: Namespacing conflict resolved (scoped keys `heys_{clientId}_products` now accessible)
- **IMPROVED**: Quality-based state updates (compares iron count, not array length)
- **ADDED**: DEBUG logs for monitoring during testing phase (Lines 52, 89-100)

#### Impact

- ✅ Products with Fe: 42 → **290**
- ✅ `micronutrient_radar` pattern: 0 → **100**
- ✅ `antioxidant_defense`: 21 → **79**
- ✅ `heart_health`: 55 → **70**
- ✅ Health Score: 66 → **71**

#### Modified Files

- `apps/web/heys_app_sync_effects_v1.js` (v4.8.8 — 3 Store API changes)
- `apps/web/public/heys_storage_supabase_v1.js` (v4.8.6 — PRIMARY quality check stable)

#### Breaking Changes

⚠️ **CRITICAL**: Direct localStorage access via `utils.lsGet/lsSet` is now **anti-pattern**. ALWAYS use Store API:

```javascript
// ❌ NO LONGER SUPPORTED
const products = window.HEYS.utils.lsGet('heys_products', []);

// ✅ CORRECT v4.8.8+
const products = window.HEYS?.products?.getAll?.() || [];
```

---

## 13.0.1

### Patch Changes

- Updated dependencies
  [[`9e5ff14b72117f568b015b82202d5a4439f9bf41`](https://github.com/kinderlystv-png/HEYS-v2/commit/9e5ff14b72117f568b015b82202d5a4439f9bf41)]:
  - @heys/core@14.0.0
  - @heys/ui@14.0.0
  - @heys/search@14.0.0
