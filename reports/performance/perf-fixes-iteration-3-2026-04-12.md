# Performance Fixes Iteration 3 (Day Meals Render Path)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Removed O(N²) meal index lookup in meals rendering.
   - Before: each displayed meal used `findIndex` over full `day.meals`.
   - After: single precomputed `Map<mealId, index>` per render pass.
2. Memoized rendered meals list in `useMealsDisplay`.
   - Wrapped `renderMealsList(...)` call in `React.useMemo` to avoid unnecessary
     list tree rebuilds when dependencies are stable.

## Validation

- Rebuild path:
  - `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
  - Auto-sync rebuilt intermediate modules and final `boot-calc, boot-day`.
- Bundle/file validation:
  - `apps/web/bundle-manifest.json`
  - `apps/web/public/bundle-manifest.json`
  - `apps/web/index.html`
  - `apps/web/public/sw.js`
- Browser verification:
  - loaded assets:
    - `http://127.0.0.1:3001/boot-calc.bundle.c9c8f69b4d92.js`
    - `http://127.0.0.1:3001/boot-day.bundle.39483e35d9ef.js`
- Audit run:
  - `reports/performance/multi-user-perf-audit-2026-04-12T18-00-35-126Z.json`

## Notes

- Code-path optimization is in place for large meal lists and should reduce
  render cost growth as meal count increases.
- Synthetic scenario metrics still show high variance between runs; scroll jank
  metric remains saturated and needs deeper instrumentation refinement and/or
  virtualization-level UI work in heavy sections.
