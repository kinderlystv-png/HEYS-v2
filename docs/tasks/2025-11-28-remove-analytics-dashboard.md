# Task: Чистка неиспользуемых пакетов (analytics-dashboard + dead code)

> **Cleanup task** — удаление мёртвого кода, ~2500+ строк

## 🎯 WHY (Бизнес-контекст)

**Problem**: В monorepo накопились неиспользуемые пакеты и dead code:
- `packages/analytics-dashboard` — пустой legacy пакет, конфликтует с портом 3001
- `packages/analytics` — placeholder (10 строк), никто не импортирует
- `packages/gaming` — placeholder (1 строка), никто не импортирует
- `packages/shared/src/performance/` — 2 файла dead code (~1900 строк)

**Impact**: Замедляет dev workflow, путаница в архитектуре, лишний размер репозитория

**Value**: 
- Чище репозиторий
- Нет конфликта портов
- -2500+ строк мёртвого кода
- Понятнее архитектура

---

## 🔍 АУДИТ (28.11.2025)

### ✅ Проверено — безопасно удалить

| Пакет/Файл | Импорты | Строк | Статус |
|------------|---------|-------|--------|
| `packages/analytics-dashboard/` | 0 | ~500 | 🗑️ Удалить |
| `packages/analytics/` | 0 | ~10 | 🗑️ Удалить |
| `packages/gaming/` | 0 | ~10 | 🗑️ Удалить |
| `performance-analytics-dashboard.ts` | 0 (не экспортируется) | ~800 | 🗑️ Удалить |
| `real-time-performance-monitor.ts` | только выше | ~1077 | 🗑️ Удалить |

### 🟡 НЕ трогаем (out of scope)

| Пакет | Причина |
|-------|---------|
| `packages/threat-detection/` | Огромный (~1500+ строк), требует отдельного решения |
| `docs/reports/` | Документация, не код |

**Причина**: `threat-detection` — это enterprise-level security пакет. Даже если не используется сейчас, решение о его судьбе требует product discussion.

---

## 🤖 Output Preferences

**Workflow**: Implement directly  
**Code style**: Follow copilot-instructions.md

---

## 📋 WHAT (Чек-лист задач)

### Must Have — Удаление пакетов

- [ ] **Удалить packages/analytics-dashboard** — `rm -rf packages/analytics-dashboard`
  - **Why**: Пустой, конфликтует с портом 3001
  - **Acceptance**: Директория удалена

- [ ] **Удалить packages/analytics** — `rm -rf packages/analytics`
  - **Why**: Placeholder 10 строк, 0 импортов в apps/
  - **Acceptance**: Директория удалена

- [ ] **Удалить packages/gaming** — `rm -rf packages/gaming`
  - **Why**: Placeholder 1 строка, 0 импортов в apps/
  - **Acceptance**: Директория удалена

### Must Have — Удаление dead code файлов

- [ ] **packages/shared** — удалить performance-analytics-dashboard.ts
  - **Files**: `packages/shared/src/performance/performance-analytics-dashboard.ts`
  - **Why**: Dead code (не экспортируется из index.ts)
  - **Acceptance**: Файл удалён

- [ ] **packages/shared** — удалить real-time-performance-monitor.ts
  - **Files**: `packages/shared/src/performance/real-time-performance-monitor.ts`
  - **Why**: Dead code (1077 строк), используется только в файле выше
  - **Acceptance**: Файл удалён

### Must Have — Чистка ссылок на удалённые пакеты

- [ ] **pnpm-workspace.yaml** — убрать исключение analytics-dashboard
  - **Files**: `pnpm-workspace.yaml:5`
  - **Change**: Удалить строку `- '!packages/analytics-dashboard'`

- [ ] **scripts/version-alignment.js** — убрать ссылку на analytics-dashboard
  - **Files**: `scripts/version-alignment.js:30`
  - **Change**: Удалить `'packages/analytics-dashboard/package.json'` из массива

- [ ] **apps/web/package.json** — убрать dependencies на analytics и gaming
  - **Files**: `apps/web/package.json:25,27`
  - **Change**: Удалить `"@heys/analytics": "workspace:*"` и `"@heys/gaming": "workspace:*"`

- [ ] **apps/web/package.json** — убрать из build:deps
  - **Files**: `apps/web/package.json:11`
  - **Change**: Убрать `@heys/analytics` и `@heys/gaming` из команды build:deps

- [ ] **apps/web/vite.config.ts** — убрать из external
  - **Files**: `apps/web/vite.config.ts:26-27`
  - **Change**: Удалить `'@heys/analytics'` и `'@heys/gaming'` из external массива

- [ ] **apps/web/src/utils/dynamic-imports.ts** — убрать мёртвые FeatureImports
  - **Files**: `apps/web/src/utils/dynamic-imports.ts:336-346`
  - **Change**: Удалить `analytics` и `gaming` из FeatureImports (ссылаются на несуществующие компоненты)

- [ ] **tsconfig.json** — убрать paths и references
  - **Files**: `tsconfig.json:39-40, 61-66`
  - **Change**: Удалить paths для `@heys/gaming` и `@heys/analytics`, удалить references

- [ ] **packages/core/vitest.config.ts** — убрать aliases
  - **Files**: `packages/core/vitest.config.ts:30,33`
  - **Change**: Удалить `'@heys/analytics'` и `'@heys/gaming'` из alias

- [ ] **packages/shared/vitest.config.ts** — убрать aliases
  - **Files**: `packages/shared/vitest.config.ts:28,31`
  - **Change**: Удалить `'@heys/analytics'` и `'@heys/gaming'` из alias

- [ ] **scripts/dead-code-eliminator.js** — убрать analytics из сканирования
  - **Files**: `scripts/dead-code-eliminator.js:38`
  - **Change**: Удалить `'packages/analytics/src'` из sourceDirectories

- [ ] **.eslintrc.cjs** — убрать исключения для удалённых пакетов
  - **Files**: `.eslintrc.cjs:154,157,159,212-215`
  - **Change**: Удалить строки с `packages/analytics/`, `packages/gaming/`, `packages/analytics-dashboard/`

### Should Have

- [ ] **todo.md** — перенести задачу в ✅ ВЫПОЛНЕНО
  - **Files**: `todo.md`
  - **Acceptance**: Задача в секции "ВЫПОЛНЕНО"

### ❌ НЕ делаем (out of scope)

- ~~Удалять `packages/threat-detection/`~~ — требует product decision
- ~~Обновлять `docs/dead-code-analysis.json`~~ — автогенерируемый файл
- ~~Удалять docs/reports/~~ — это документация

---

## ✅ DONE (Критерии приёмки)

### Quality Gates

- [ ] `pnpm install` — работает без ошибок
- [ ] `pnpm type-check` — PASS  
- [ ] `pnpm build` — PASS
- [ ] `grep -r "analytics-dashboard\|@heys/analytics\|@heys/gaming" packages/` — нет результатов

---

## 📂 Ключевые файлы

| Файл | Действие | Строк |
|------|----------|-------|
| `packages/analytics-dashboard/` | 🗑️ Удалить | ~500 |
| `packages/analytics/` | 🗑️ Удалить | ~10 |
| `packages/gaming/` | 🗑️ Удалить | ~10 |
| `packages/shared/src/performance/performance-analytics-dashboard.ts` | 🗑️ Удалить | ~800 |
| `packages/shared/src/performance/real-time-performance-monitor.ts` | 🗑️ Удалить | ~1077 |
| `pnpm-workspace.yaml:5` | ✏️ Убрать исключение | — |
| `scripts/version-alignment.js:30` | ✏️ Убрать ссылку | — |
| `apps/web/package.json` | ✏️ Убрать deps + build:deps | — |
| `apps/web/vite.config.ts:26-27` | ✏️ Убрать external | — |
| `apps/web/src/utils/dynamic-imports.ts` | ✏️ Убрать FeatureImports | — |
| `tsconfig.json` | ✏️ Убрать paths + references | — |
| `packages/core/vitest.config.ts` | ✏️ Убрать aliases | — |
| `packages/shared/vitest.config.ts` | ✏️ Убрать aliases | — |
| `scripts/dead-code-eliminator.js` | ✏️ Убрать из сканирования | — |
| `.eslintrc.cjs` | ✏️ Убрать исключения | — |
| `todo.md` | ✏️ Перенести в ВЫПОЛНЕНО | — |

**Итого удаляется**: ~2500 строк dead code + ~18 ссылок в конфигах

---

## 💡 Рекомендации на будущее (не в этой задаче)

### packages/threat-detection — что делать?

**Факты:**
- ~1500+ строк enterprise security кода
- 0 импортов в production
- ML-модели, Anomaly Detection, Incident Response

**Варианты:**
1. **Удалить** — если HEYS это просто nutrition app
2. **Оставить в archive/** — если планируется enterprise версия
3. **Выделить в отдельный репо** — если это отдельный продукт

**Рекомендация**: Создать отдельную задачу `2025-XX-XX-threat-detection-decision.md`

---

## 📝 Notes

- **Priority**: medium
- **Complexity**: M (~15-20 минут) — больше файлов для чистки чем изначально
- **Blockers**: нет
- **Cleanup**: ~2500 строк dead code + чистка конфигов
- **Follow-up**: Решение по `threat-detection` — отдельная задача
- **Created**: 2025-11-28
- **Updated**: 2025-11-28 — добавлены файлы конфигурации (package.json, vite.config, tsconfig, dynamic-imports)
