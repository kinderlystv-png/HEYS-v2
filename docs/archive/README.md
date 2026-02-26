# 🗃️ DOCUMENTATION ARCHIVE

> **Purpose:** Historical documentation and legacy files for reference  
> **Maintainer:** @docs-core  
> **Version:** 1.3.0

## 📁 Archive Structure

| Directory              | Priority | Contents                                    |
| ---------------------- | -------- | ------------------------------------------- |
| **[legacy/](legacy/)** | ⭐⭐⭐   | Superseded documentation (moved 2025-08-30) |
| **[2024/](2024/)**     | ⭐⭐     | Year-based archive for historical reference |

> **Version:** 1.4.0

## 📦 Merged & Archived (Feb 2026)

| Файл                                                      | Дата       | Почему архивировано                                    |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| [TECHNICAL_ARCHITECTURE.md](../TECHNICAL_ARCHITECTURE.md) | 26.02.2026 | Merged в [ARCHITECTURE.md](../ARCHITECTURE.md) v18.0.0 |

## 📦 Closed Tasks (→ docs/tasks/archive/)

| Файл                                                                                      | Дата       | Почему                                          |
| ----------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| [2025-12-01-sync-refactor-prompt.md](../tasks/archive/2025-12-01-sync-refactor-prompt.md) | 26.02.2026 | Scope A частично реализован, Scope B/C отложены |
| [2025-11-30-pwa-features.md](../tasks/archive/2025-11-30-pwa-features.md)                 | 26.02.2026 | Phase 0-1 реализованы                           |

## 📦 Performance & Loading (Sept 2025, Supabase-эпоха)

Файлы из спринта оптимизации Sept 2025. Устарели после перехода на
`bundle-legacy.mjs` и удаления Supabase SDK.

| Файл                                                                     | Дата       | Почему архивировано                                                                        |
| ------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| [performance-baseline-2025-09.md](performance-baseline-2025-09.md)       | 04.09.2025 | 189KB Vite-бандл (Supabase-эпоха). Текущий baseline — 8.65MB raw / 1.95MB gzip (9 бандлов) |
| [bundle-splitting-report-2025-09.md](bundle-splitting-report-2025-09.md) | 04.09.2025 | Vite `manualChunks` + Supabase. Заменён на `scripts/bundle-legacy.mjs`                     |

**Актуальная документация:**
[docs/SYNC_PERFORMANCE_REPORT.md](../SYNC_PERFORMANCE_REPORT.md)

## 🗃️ Legacy Archive

Contains 18 documents moved on 2025-08-30 during documentation standardization:

- **AI Context Documents:** Historical AI system documentation
- **Superseded Guides:** Replaced by current implementation guides
- **Old Configuration:** Legacy configuration files
- **Deprecated Systems:** Outdated system documentation

### Key Migration Map

| Legacy Document                | Current Location                        | Status       |
| ------------------------------ | --------------------------------------- | ------------ |
| `AI_PROJECT_CONTEXT.md`        | `../HEYS_Project_Context.md`            | ✅ Migrated  |
| `ANCHOR_SYSTEM_GUIDE.md`       | `../guides/anchor_automation.md`        | ✅ Rewritten |
| `DOCS_ACTUALIZATION_SYSTEM.md` | `../plans/DOCS_ACTUALIZATION_SYSTEM.md` | ✅ Moved     |

## 📋 Archive Policy

### Access Guidelines

- **Read-Only:** Archive documents should not be edited
- **Reference:** Use for historical context and migration tracking
- **Links:** May be broken due to file reorganization

### Retention Policy

- **Legacy documents:** Kept indefinitely for reference
- **Year-based archives:** 5-year retention policy
- **Periodic cleanup:** Annual review of archive contents

<!-- ANCHOR_ARCHIVE_MASTER -->

**MASTER INDEX:** Complete historical documentation archive
