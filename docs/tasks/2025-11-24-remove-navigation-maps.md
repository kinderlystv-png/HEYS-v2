---
template-version: 3.1.0
created: 2025-11-24
updated: 2025-11-24
purpose: Remove navigation maps anti-pattern from codebase
optimization: Task-First — reduce context bloat, improve maintainability
---

# Task: Удалить навигационные карты из проекта

> **PROMPT**: Убрать ASCII-карты из legacy JS файлов — освободить context window
> для AI, упростить maintenance

## 🎯 WHY (Бизнес-контекст)

**Problem**: Навигационные карты (ASCII art с номерами строк) занимают 39-45
строк в начале девяти legacy JS файлов (включая `packages/storage`). В
`heys_app_v12.js` вообще лежит карта от `index.html`. Номера строк устаревают
после каждого изменения, что создает риск неправильных правок AI-агентами.

**Impact**:

- **AI agents** — тратят токены на обработку устаревших карт вместо реального
  кода
- **Developers** — путаются из-за неактуальных line ranges
- **Maintenance** — нужно обновлять карты после каждого рефакторинга

**Value**:

- Освободим ~350-400 строк контекста (9 файлов × ~42 строки)
- Снизим риск галлюцинаций AI при редактировании по устаревшим номерам строк
- Уберём карту «не того файла» в `heys_app_v12.js`
- Упростим onboarding (используем IDE Outline вместо inline-карт)

---

## 🤖 Output Preferences

**Workflow**: Implement directly (план уже есть в todo-листе, действуем
пошагово)

**Code style**: Follow copilot-instructions.md — минимализм, практичность, без
over-engineering

---

## 📋 WHAT (Чек-лист задач)

### Must Have (критично для релиза)

- [ ] **Remove maps from apps/web/** — Delete ASCII navigation blocks from all
      heys\_\*.js files
  - **Why**: Основные production файлы (app, core, day, user, reports, storage,
    models) содержат карты
  - **Acceptance**: Все 8 файлов начинаются с краткого JSDoc (≤3 строки) вместо
    карты (~39 строк)
  - **Files**:
    - `apps/web/heys_app_v12.js` (lines 1-39) ⚠️ **КАРТА ДЛЯ index.html, НЕ ДЛЯ
      ЭТОГО ФАЙЛА!**
    - `apps/web/heys_core_v12.js` (lines 1-45)
    - `apps/web/heys_day_v12.js` (lines 1-45)
    - `apps/web/heys_user_v12.js` (lines 1-41)
    - `apps/web/heys_reports_v12.js` (lines 1-39)
    - `apps/web/heys_storage_layer_v1.js` (lines 1-39)
    - `apps/web/heys_storage_supabase_v1.js` (lines 1-39)
    - `apps/web/heys_models_v1.js` (lines 1-39)

- [ ] **Remove maps from packages/** — Delete ASCII blocks from legacy storage
      files
  - **Why**: `packages/storage/src/legacy/` содержит старые файлы с картами
  - **Acceptance**: Legacy файлы начинаются с JSDoc вместо карты
  - **Files**: `packages/storage/src/legacy/heys_storage_indexeddb_v1.js` (lines
    1-39)

- [ ] **Delete generation scripts** — Remove bat/ps1 files that created maps
  - **Why**: Эти скрипты больше не нужны и могут добавить карты обратно
  - **Acceptance**: Файлы удалены из repo (не архивированы, используем git
    history)
  - **Files**:
    - `ADD_NAVIGATION_MAPS.bat` (exists, confirmed)
    - `TOOLS/Update-AllNavigationMaps.ps1` (exists, confirmed)

- [ ] **Update copilot-instructions.md** — Add anti-pattern rule
  - **Why**: Предотвратить добавление карт обратно future AI-агентами
  - **Acceptance**: В секцию "Anti-Patterns (DO NOT)" добавлено правило о картах
  - **Files**: `.github/copilot-instructions.md`

### Should Have (важно, но не блокер)

- [ ] **Replace with JSDoc** — Add minimal file headers (1-3 lines)
  - **Why**: Краткий контекст полезен, но без line ranges
  - **Acceptance**: Каждый файл начинается с:
    ```javascript
    /**
     * [Module name] — [brief description]
     * @see [related files if needed]
     */
    ```
  - **Files**: Все файлы из Must Have списка

- [ ] **Verify boundaries** — Ensure oldString captures ONLY comment block, no
      code
  - **Why**: Критично не удалить функциональный код вместе с картой
  - **Acceptance**: Для каждого файла oldString заканчивается на `*/` и
    следующая строка — это код (может быть закомментированный Service Worker
    код, как в heys_app_v12.js)
  - **Safety**: Read 60+ lines (не 50) чтобы захватить контекст после карты
  - **⚠️ CRITICAL**: `heys_app_v12.js` содержит карту для **index.html**, а не
    для самого файла — это legacy артефакт, карта всё равно устарела и подлежит
    удалению

### Could Have (nice to have)

- [ ] **Verify encoding** — Ensure files remain UTF-8
  - **Why**: Legacy файлы на Windows могут иметь проблемы с кодировкой
  - **Acceptance**: Файлы читаются корректно после правки

---

## ✅ DONE (Критерии приёмки)

### Functional

- [ ] **grep search confirms**: No files contain "🗺️ НАВИГАЦИОННАЯ КАРТА" or
      "├──" patterns
- [ ] **JSDoc headers present**: All modified files start with minimal (≤3
      lines) JSDoc
- [ ] **No functional code changed**: Only comment blocks removed, no logic
      touched

### Testing Strategy

- [ ] **How**: Manual verification + `pnpm dev` startup check
- [ ] **Where**: localhost:3001 — app должно стартовать без ошибок
- [ ] **Who**: Developer self-check (no QA needed for comment-only changes)

### Quality Gates (не блокируют релиз)

- [ ] **Type safety**: `pnpm type-check` (запускаем только если pipeline
      требует; для legacy JS можно отметить N/A)
- [ ] **Linting**: `pnpm lint` (только если конфиг покрывает указанные файлы)
- [ ] **Smoke build**: `pnpm dev` уже запускается в разделе Testing —
      дополнительных сборок не требуется, просто подтвердить, что запуск прошёл
      без ошибок

### Performance

- [ ] **Bundle**: File sizes уменьшились на ~1-2 KB каждый (удалены комментарии)
- [ ] **Latency**: No impact (только комментарии)

### Documentation

- [ ] **PR created**: Title: "refactor: remove navigation maps anti-pattern"
- [ ] **Task prompt linked**: Body содержит "Based on
      docs/tasks/2025-11-24-remove-navigation-maps.md"
- [ ] **Code reviewed**: Self-review completed

---

## 🤖 AI Context (Technical Specs)

### 📐 Навигационные карты — Anti-Pattern

**Проблема**:

1. **Context Window waste** — ASCII-карты съедают 39-45 строк × 9 файлов =
   ~350-400 строк tokens
2. **Outdated line numbers** — После каждого edit'а номера строк в карте
   устаревают
3. **AI hallucinations** — AI может прочитать карту, увидеть "lines 82-139", но
   код уже сместился
4. **Bad architecture signal** — Если файлу нужна карта → файл слишком большой
5. **⚠️ WRONG FILE MAPS** — `heys_app_v12.js` содержит карту для `index.html`
   (copy-paste ошибка)

**Современный подход**:

- **IDE Outline** (Ctrl+Shift+O в VS Code) — навигация по символам
- **JSDoc** — краткие описания функций (не line ranges!)
- **Refactoring** — разбить файл >400 строк на модули

### Что удаляем

**Pattern 1: ASCII box с эмодзи**

```javascript
/*
┌─────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА foo.js (500 строк) │
├─────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                          │
│    ├── Section 1 (82-139)                   │
│    └── Section 2 (140-250)                  │
└─────────────────────────────────────────────┘
*/
```

**Pattern 2: Line range indicators**

```javascript
│    ├── handleSave() - сохранение (51-70)    │
```

### Что оставляем

**Minimal JSDoc** (1-3 lines max):

```javascript
/**
 * HEYS Day Tab — day statistics, meal tracking
 * @see heys_core_v12.js для product search
 */
```

## 📂 Quick Reference

### File Locations

- **apps/web/heys_app_v12.js** — Main app entry, React root
- **apps/web/heys_core_v12.js** — Product search, localStorage
- **apps/web/heys_day_v12.js** — Day stats, meals
- **apps/web/heys_user_v12.js** — User profile, BMI/BMR
- **apps/web/heys_reports_v12.js** — Reports, analytics
- **apps/web/heys_storage_layer_v1.js** — Storage layer
- **apps/web/heys_storage_supabase_v1.js** — Supabase integration
- **apps/web/heys_models_v1.js** — Data models
- **packages/storage/src/legacy/heys_storage_indexeddb_v1.js** — IndexedDB
  storage

### Scripts to Delete

- `ADD_NAVIGATION_MAPS.bat`
- `TOOLS/Update-AllNavigationMaps.ps1`

### Commands

```bash
# Поиск карт
Get-ChildItem -Path apps/web -Recurse -File -Include *.js -ErrorAction SilentlyContinue |
  Select-String "🗺️ НАВИГАЦИОННАЯ КАРТА" |
  Select-Object Path, LineNumber

# Проверка что карт больше нет
rg "🗺️ НАВИГАЦИОННАЯ КАРТА|├──|└──" apps/web/ packages/

# Smoke-test после удаления
pnpm dev
```

### Key Docs

- **[Your audit comment]** — Original critique of navigation maps
- **[Copilot Instructions](.github/copilot-instructions.md)** — Add anti-pattern
  rule here
- **[Performance Audit](PERFORMANCE_MONITOR_AUDIT.md)** — Example of removing
  bloat (-1099 lines)

---

## ⚠️ Risks & Mitigation

| Risk                              | Impact                                           | Mitigation                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Удалить код вместе с картой**   | 🔴 HIGH — приложение сломается                   | Read 60+ lines per file, verify `oldString` ends with `*/`, review `git diff` before commit. **ОСОБОЕ ВНИМАНИЕ**: `heys_app_v12.js` начинается с закомментированного кода Service Worker сразу после карты — не удалить его! |
| **Неточное совпадение oldString** | 🟡 MEDIUM — replace fail, но ничего не сломается | Use EXACT text from read_file (с пробелами, переносами), не редактировать вручную                                                                                                                                            |
| **Encoding corruption (Windows)** | 🟡 MEDIUM — русские символы → кракозябры         | Verify UTF-8 encoding preserved, check эмодзи (🗺️) не повреждены                                                                                                                                                             |
| **Скрипты восстановят карты**     | 🟢 LOW — легко откатить                          | Удалить `.bat` и `.ps1` файлы, добавить правило в copilot-instructions.md                                                                                                                                                    |

## 📝 Notes

- **Priority**: medium (не блокирует features, но улучшает DX)
- **Complexity**: M (3-4 hours — 9 файлов × multi_replace + docs update)
- **Blockers**: None (comment-only changes, no logic dependencies)
- **Related Tasks**:
  - Similar cleanup: PERFORMANCE_MONITOR_AUDIT.md (removed 1316 → 217 lines)
  - Future: Consider splitting files >500 lines into modules
- **Safety**: Create branch `remove-navigation-maps` from `mobile_v1` before
  changes
- **Rollback**: Easy — just `git revert` if something breaks
- **Created**: 2025-11-24
- **Template**: Task-First v3.1.0 (HEYS-v2 Edition)

---

## 🚀 Implementation Plan (from todo-list)

1. ✅ **Find all files** — grep search for navigation maps (DONE)
2. 🔄 **Analyze structure** — read first 60 lines of EACH file to capture EXACT
   ASCII string + verify next line is code (CRITICAL)
3. **Create branch** — `git checkout -b remove-navigation-maps`
4. **Prepare replacements** — Build multi_replace array with oldString (comment
   block) + newString (JSDoc header)
5. **Safety check** — Verify each oldString ends with `*/` and doesn't include
   functional code
6. **Remove maps** — multi_replace_string_in_file for all 9 files (atomic
   operation)
7. **Review diff** — `git diff` to confirm ONLY comments removed (no
   `window.HEYS`, `const`, `function` deleted)
8. **Test** — `pnpm dev` → localhost:3001 works
9. **Delete scripts** — rm ADD_NAVIGATION_MAPS.bat, TOOLS/\*.ps1
10. **Update docs** — Add anti-pattern rule to copilot-instructions.md
11. **Commit** — `git commit -m "refactor: remove navigation maps anti-pattern"`

---

## 📊 Expected Results

**Before**:

- 9 files × ~42 lines avg = ~378 lines of ASCII art
- Outdated line numbers after each edit
- AI confusion when reading "lines 82-139" (code already moved)
- **КРИТИЧЕСКАЯ ОШИБКА**: `heys_app_v12.js` содержит карту для `index.html`
  (неправильный файл!)

**After**:

- 9 files × 3 lines JSDoc = ~27 lines (14x reduction!)
- No outdated line numbers (no line numbers at all)
- AI reads actual code structure via AST, not text maps
- Future AI prevented from adding maps back (via copilot-instructions rule)
- Карта "не того файла" удалена

**Saved context**: ~350 lines ≈ 1200-1700 tokens per file read
