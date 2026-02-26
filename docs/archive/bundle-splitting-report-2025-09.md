<!--
  ⚠️ АРХИВ — Документ от сентября 2025.
  Описывает Vite manualChunks для Supabase-эпохи.
  Неактуален: Supabase SDK удалён, Vite-бандлы заменены на bundle-legacy.mjs.
  Актуальная информация → docs/SYNC_PERFORMANCE_REPORT.md
-->

> **⚠️ АРХИВ.** Документ от 04.09.2025. Описывает Vite `manualChunks`
> конфигурацию (Supabase-эпоха). Неактуален: Supabase SDK удалён, стратегия
> чанков заменена на `bundle-legacy.mjs` (9 бандлов, 246 файлов).  
> Актуальная информация: [SYNC_PERFORMANCE_REPORT.md](../SYNC_PERFORMANCE_REPORT.md)

---

# 📦 Bundle Splitting Optimization Report

**Date:** 04.09.2025  
**Performance Sprint:** Day 2 - Bundle Optimization

## 🎯 Optimization Summary

### Current State (на тот момент)

- **Chunks configured:** 0
- **Total JS size:** 138.23KB
- **Average chunk size:** 15.36KB

### Optimized Configuration (на тот момент)

- **New chunks:** 8
- **Chunk strategy:** Feature-based + vendor separation
- **Expected improvement:** Better caching, parallel loading

## 📊 Chunk Configuration (Supabase-эпоха, устарело)

```typescript
manualChunks: {
  vendor: ['react', 'react-dom', 'react/jsx-runtime'],
  ui: ['@heys/ui', '@heys/shared'],
  core: ['@heys/core'],
  analytics: ['@heys/analytics'],
  search: ['@heys/search'],
  gaming: ['@heys/gaming'],
  storage: ['@heys/storage', '@supabase/supabase-js'],  // Supabase удалён
  utils: ['zod', 'date-fns']
}
```

## 🎯 Recommendations (на тот момент)

1. Implement optimized manual chunks configuration
2. Separate vendor libraries for better caching
3. Create feature-based chunks for lazy loading
4. Use long-term caching with content hashes
5. Implement service worker for chunk caching
6. Add route-based code splitting
7. Implement dynamic imports for heavy features

## 🚀 Implementation Steps (на тот момент)

1. Update `apps/web/vite.config.ts` with new manual chunks
2. Test build with `pnpm --filter @heys/web run build`
3. Verify chunk sizes and loading performance
4. Implement dynamic imports for feature modules
5. Add service worker caching strategy

---

**Status:** Ready for implementation (на тот момент)  
**Next Phase:** Code Splitting & Lazy Loading (Day 3-4)
