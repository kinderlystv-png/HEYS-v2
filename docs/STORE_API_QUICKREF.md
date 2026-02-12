# 🛡️ Store API Quick Reference v4.8.8

> **Last Updated:** February 12, 2026  
> **Status:** Production Ready  
> **Critical for:** React state management, data persistence, multi-client
> support

---

## 🎯 TL;DR

**NEVER** access localStorage directly via `utils.lsGet/lsSet` in React
components.  
**ALWAYS** use Store API as the single source of truth.

---

## ❌ Anti-Pattern (BROKEN in v4.8.7 and earlier)

```javascript
// ❌ WRONG — bypasses scoping, reads unscoped key
const products = window.HEYS.utils.lsGet('heys_products', []);
// Result: empty array → React falls back to stale state (42 products instead of 290)

// ❌ WRONG — direct localStorage write
localStorage.setItem('heys_products', JSON.stringify(data));
// Result: unscoped key → sync writes to different key → data lost
```

### Why It Breaks

1. **Store API** writes to scoped key: `heys_{clientId}_products`
2. **Direct access** reads unscoped key: `heys_products`
3. Keys don't match → React sees empty → falls back to stale data → patterns
   fail

---

## ✅ Correct Pattern v4.8.8

```javascript
// ✅ CORRECT — reads via Store API (handles scoping internally)
const products = window.HEYS?.products?.getAll?.() || [];
// Result: 290 products with micronutrients ✅

// ✅ CORRECT — writes via Store API
HEYS.products.setAll(newProducts);
// Result: scoped storage + memory cache + cloud sync ✅
```

---

## 📖 Store API Methods

### Products Management

```javascript
// Read all products (scoped by clientId)
HEYS.products.getAll();
// Returns: Product[] (290 items with micronutrients in production)

// Write products (scoped + cloud sync)
HEYS.products.setAll(productsArray);
// Side effects: localStorage + memory cache + cloud save

// Update single product
HEYS.products.update(productId, changes);
// Returns: boolean (success)

// Delete product
HEYS.products.delete(productId);
// Returns: boolean (success)
```

### Generic Store Access

```javascript
// Read from Store (generic key)
HEYS.store.get('heys_profile');
// Returns: any (automatically scoped)

// Write to Store (generic key)
HEYS.store.set('heys_profile', profileData);
// Side effects: localStorage + memory cache + cloud sync

// Delete from Store
HEYS.store.delete('heys_dayv2_2026-02-12');
// Returns: boolean (success)
```

---

## 🔒 Data Quality Protection (4 Layers)

### Layer 1: PRIMARY Quality Check (v4.8.6)

```javascript
// File: heys_storage_supabase_v1.js:5625-5635
const savingWithIron = value.filter((p) => p && p.iron && +p.iron > 0).length;
if (savingWithIron < 50) {
  logCritical(`🚨 [SAVE BLOCKED] Only ${savingWithIron} products with iron`);
  return; // Blocks immediately
}
// Effectiveness: 100% (0 stale saves post-v4.8.8)
```

### Layer 2: Pre-Sync Block

```javascript
// Prevents race conditions
if (waitingForSync.current === true) {
  return; // Don't load stale data before sync completes
}
```

### Layer 3: Quality-Based React Update (v4.8.7)

```javascript
setProducts((prev) => {
  const prevIron = prev.filter((p) => p.iron > 0).length;
  const loadedIron = loaded.filter((p) => p.iron > 0).length;

  // Only update if quality changed
  if (prevIron === loadedIron && prev.length === loaded.length) {
    return prev; // Skip re-render
  }

  return loaded; // Quality improved
});
```

### Layer 4: Architectural (v4.8.8)

**Store API prevents namespacing conflicts** by encapsulating scoping logic.

---

## 🎯 React Integration Pattern

```javascript
import { useEffect, useState, useRef } from 'react';

function useProducts() {
  const [products, setProducts] = useState([]);
  const waitingForSync = useRef(false);

  useEffect(
    () => {
      // 1. Check if sync in progress
      if (waitingForSync.current === true) {
        return; // Skip stale data load
      }

      // 2. Load from Store API (NOT utils.lsGet!)
      const loadedProducts = window.HEYS?.products?.getAll?.() || [];

      // 3. Verify quality
      const loadedIron = loadedProducts.filter(
        (p) => p?.iron && +p.iron > 0,
      ).length;

      console.info(
        `[HEYS.sync] 🔍 Loaded: ${loadedProducts.length} products, ${loadedIron} with iron`,
      );

      // 4. Update React state with quality check
      setProducts((prev) => {
        const prevIron = Array.isArray(prev)
          ? prev.filter((p) => p?.iron && +p.iron > 0).length
          : 0;

        // Only update if quality changed
        if (prevIron === loadedIron && prev.length === loadedProducts.length) {
          console.info(`[HEYS.sync] 🚫 NOT updated (same quality)`);
          return prev;
        }

        console.info(
          `[HEYS.sync] 🔄 Updated: ${prev.length}→${loadedProducts.length}, ${prevIron}→${loadedIron} iron`,
        );
        return loadedProducts;
      });
    },
    [
      /* deps */
    ],
  );

  return { products, setProducts };
}
```

---

## 📊 Expected Production Values

```javascript
// After successful sync:
HEYS.products.getAll().length
// Expected: 293 ✅ (not 0 or 42 ❌)

HEYS.products.getAll().filter(x => x.iron > 0).length
// Expected: 290 ✅ (not 0 or 42 ❌)

// In console logs:
[HEYS.sync] 🔍 After sync: loadedProducts.length=293, withIron=290
// ✅ Correct

[HEYS.sync] 🔍 After sync: loadedProducts.length=0, withIron=0
// ❌ BROKEN — check if utils.lsGet used instead of Store API

// Patterns should activate:
micronutrient_radar: 100 ✅ (not 0 ❌)
antioxidant_defense: 79 ✅ (not 21 ❌)
heart_health: 70 ✅ (not 55 ❌)
healthScore: 71+ ✅ (not 66- ❌)
```

---

## 🐛 Debugging Checklist

### If React shows 42 products instead of 290:

1. ✅ Check if `utils.lsGet('heys_products')` used → **REPLACE with
   `products.getAll()`**
2. ✅ Check console logs: `withIron=?` → should be **290** (not 0 or 42)
3. ✅ Check localStorage keys: should have `heys_{clientId}_products` (not bare
   `heys_products`)
4. ✅ Verify Store API call: `window.HEYS?.products?.getAll?.()` → should return
   290+ items
5. ✅ Check quality check triggers: should NOT block saves (was blocking in
   v4.8.7-)

### If quality check blocks saves:

1. ⚠️ **v4.8.8 should NOT trigger blocks** (architectural fix resolved issue)
2. If blocks appear → check logs: `[SAVE BLOCKED] Only ${x} products with iron`
3. Investigate: Is React bypassing Store API? Is stale data being saved?
4. Verify: All React reads go through Store API (3 locations in
   `heys_app_sync_effects_v1.js`)

---

## 🔗 Related Files

| File                                          | Purpose                  | Version |
| --------------------------------------------- | ------------------------ | ------- |
| `apps/web/heys_app_sync_effects_v1.js`        | React integration        | v4.8.8  |
| `apps/web/public/heys_storage_supabase_v1.js` | Quality checks           | v4.8.6  |
| `apps/web/public/heys_core_v12.js`            | Store API implementation | Stable  |
| `apps/web/public/heys_storage_layer_v1.js`    | Scoping logic            | Stable  |

---

## 📚 Further Reading

- [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md#🛡️-критические-архитектурные-решения)
  — Full technical explanation
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md#🛡️-store-api-best-practices-v488)
  — API reference
- [ARCHITECTURE.md](ARCHITECTURE.md#🛡️-critical-architecture-evolution) — System
  evolution
- [CHANGELOG.md](../apps/web/CHANGELOG.md) — Release notes v4.8.8

---

## 📞 Need Help?

**If patterns fail to activate** or **data shows 42 instead of 290**:

1. Check console for DEBUG logs (`[HEYS.sync]` prefix)
2. Verify `products.getAll()` used (not `utils.lsGet`)
3. Run: `HEYS.products.getAll().filter(x => x.iron > 0).length` → should return
   **290**
4. Check [GitHub Issues](https://github.com/kinderlystv-png/HEYS-v2/issues) for
   similar problems

**Remember**: Store API is your friend. Direct localStorage access is the enemy.
🛡️

---

**© 2026 HEYS Development Team** | Architecture v4.8.8 — Production Ready
