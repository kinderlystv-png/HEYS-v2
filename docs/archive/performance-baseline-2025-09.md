<!--
  ⚠️ АРХИВ — Документ от сентября 2025.
  Данные устарели: Supabase SDK удалён, бандлинг через bundle-legacy.mjs,
  текущие бандлы = 8.65MB raw / 1.95MB gzip.
  Актуальная информация → docs/SYNC_PERFORMANCE_REPORT.md
-->

> **⚠️ АРХИВ.** Документ от 04.09.2025. Описывает Supabase-эпоху (189KB
> Vite-бандл). Неактуален: Supabase SDK удалён, Vite-бандлы заменены на
> `bundle-legacy.mjs` (legacy bundle pipeline).  
> Актуальная информация:
> [SYNC_PERFORMANCE_REPORT.md](../SYNC_PERFORMANCE_REPORT.md)

---

# 📊 Performance Baseline Report

**Date:** 4 сентября 2025  
**Time:** Performance Optimization Sprint - Day 1

## 🎯 Baseline Measurements

### 📦 Bundle Analysis

- **Total Bundle Size:** 189.77KB
- **JavaScript:** 142.15KB (74.9%)
- **CSS:** 14.47KB (7.6%)
- **HTML:** 31.25KB (16.5%)
- **Total Files:** 18

### 📊 Bundle Breakdown

| File                                   | Size    | Type |
| -------------------------------------- | ------- | ---- |
| `heys_core_v12-ac6551da.js`            | 42.72KB | JS   |
| `heys_performance_monitor-b8643643.js` | 32.67KB | JS   |
| `index.html`                           | 31.25KB | HTML |
| `heys_storage_supabase_v1-463550c0.js` | 26.12KB | JS   |
| `heys_analytics_ui-279cbf8e.js`        | 25.50KB | JS   |
| `index-ba0dbd15.css`                   | 14.47KB | CSS  |

### 🔍 Dependencies Analysis

- **Duplicate Dependencies Found:** 5 (react, react-dom, zod, @heys/shared,
  @heys/core)
- **Large Dependencies:** date-fns, react, react-dom
- **Recommendations:** 11 optimization points identified

## ✅ Current Status Assessment

### 🟢 Positive Aspects

- Bundle size excellent: 189KB total (well under 500KB threshold)
- Clean build structure: No build errors
- Good compression: Terser minification working
- Modular architecture: Separate feature chunks

### 🟡 Areas for Improvement

- Duplicate dependencies: 5 packages duplicated across workspace
- Manual chunks not utilized: Empty vendor/react/core chunks
- Missing Lighthouse data: Need working page for performance metrics

## 🎯 Optimization Targets

| Metric         | Current | Target        | Status    |
| -------------- | ------- | ------------- | --------- |
| Bundle Size    | 189KB   | <170KB (-10%) | 🎯 Target |
| JavaScript     | 142KB   | <125KB        | 🎯 Target |
| CSS            | 14KB    | <12KB         | 🎯 Target |
| Duplicate Deps | 5       | 0             | 🎯 Target |

## 📋 Next Steps (Day 2, на тот момент)

1. Dependency Deduplication (`pnpm dedupe`)
2. Tree Shaking Enhancement
3. Code Splitting (route-based, lazy loading)
4. Asset Optimization

## 🎨 Build Configuration Status

### ✅ Optimized (на тот момент)

- Terser minification with aggressive settings
- CSS code splitting enabled
- Hidden source maps for production
- ES2020 target for modern browsers

---

**Performance Sprint Day 1: COMPLETE** ✅
