---
template-version: 3.3.0
created: 2025-11-24
updated: 2025-11-25
purpose: Task-First template — business logic focus, actionable checklist
optimization: Adapted for HEYS-v2 (Legacy + Modern Monorepo)
changelog:
  v3.3.0 — Synced with copilot-instructions v2.1.0, added HEYS.store pattern,
  pnpm lint v3.2.0 — Added UI Testing section, aligned with copilot-instructions
  v2.0.0 v3.1.0 — Added Quick Wins, Quick Reference, consolidated Testing
  Strategy
---

> **📖 HOW TO USE**:
>
> 1. **Quick Wins** (мелкие правки): Skip this file. Just ask in chat.
> 2. **Strategic tasks** (многошаговые): Copy →
>    `docs/tasks/YYYY-MM-DD-task-name.md`
> 3. Fill all `[placeholders]` with real data
> 4. Link in PR: "Task prompt: docs/tasks/2025-11-24-task-name.md"

---

# Task: [Краткое название — что делаем]

> **Workflow Hint**:
>
> - **Quick Wins**: Для однострочных правок не создавай файл — просто пиши в чат
> - **Strategic**: Для многошаговых задач заполни этот темплейт

## 🎯 WHY (Бизнес-контекст)

**Problem**: [Что не работает или чего не хватает — 1-2 строки]

**Impact**: [Кто страдает: users, team, business — 1 строка]

**Value**: [Что получим после решения — 1 строка, измеримо]

---

## 🤖 Output Preferences

**Workflow**: [Propose plan first | Implement directly | Explain logic first]

**Code style**: [Follow copilot-instructions.md | Minimal comments | Verbose
explanations]

---

## 📋 WHAT (Чек-лист задач)

> **Принцип**: 1 задача = 1 файл/метод + конкретное изменение + критерии приёмки

<details>
<summary>📝 Пример заполненной задачи (click to expand)</summary>

- [ ] **Legacy UI** — `apps/web/heys_day_v12.js:addMeal()` → add calorie
      validation
  - **Why**: Users accidentally add meals with 0 calories, breaking daily stats
  - **Acceptance**: Form shows error if calories < 1, localStorage not updated
  - **Files**: `apps/web/heys_day_v12.js:245-280`

</details>

### Must Have (критично для релиза)

- [ ] **Legacy UI** — `apps/web/heys_module_v12.js` → update logic
  - **Why**: [Бизнес-причина — зачем это нужно]
  - **Acceptance**: [Измеримый результат — как проверить]
  - **Files**: `apps/web/heys_*.js`

- [ ] **Modern Core** — `packages/core/src/Service.ts` → new logic
  - **Why**: [Бизнес-причина]
  - **Acceptance**: [Измеримый результат]
  - **Files**: `packages/core/src/...`

### Should Have (важно, но не блокер)

- [ ] **Shared** — `packages/shared/src/utils.ts` → reusable utility
  - **Why**: [Бизнес-причина]
  - **Acceptance**: [Измеримый результат]

- [ ] **Tests** — `packages/core/test/Service.spec.ts` → unit tests
  - **Why**: Prevent regressions
  - **Acceptance**: All tests PASS

### Could Have (nice to have)

- [ ] **Docs** — Update architecture diagram or README

---

## ✅ DONE (Критерии приёмки)

### Functional

- [ ] **Works as expected**: [Конкретный сценарий — что должно работать]
- [ ] **Edge cases handled**: [Пограничные случаи — пустые данные, ошибки сети]
- [ ] **Mobile-friendly**: UI elements are touch-friendly (≥44x44px)

### Quality Gates

- [ ] **Testing Strategy**:
  - **How**: [Manual browser test | Unit tests | E2E with Playwright]
  - **Where**: [localhost:3001 | Staging | Production]
  - **Edge cases**: [Empty data, network errors, zero-values, null]
- [ ] **Type safety**: `pnpm type-check` PASS (0 errors)
- [ ] **Linting**: `pnpm lint` PASS (0 errors)
- [ ] **Tests**: `pnpm test:all` PASS
- [ ] **Build**: `pnpm build` PASS

### UI Testing (для UI задач)

**Mobile (Chrome DevTools → iPhone SE):**

- [ ] Основной функционал работает
- [ ] Touch targets ≥44px (`min-h-11`)
- [ ] Интерактивные элементы не конфликтуют
- [ ] Анимации плавные

**Desktop (>768px):**

- [ ] Hover-эффекты работают
- [ ] Keyboard навигация (Enter, Escape)

**Общее:**

- [ ] Нет ошибок в console

### Performance

- [ ] **Bundle**: No significant size increase in legacy JS (<50KB per file
      preferred)
- [ ] **Latency**: No blocking operations on main thread

### Documentation

- [ ] **PR created**: Link to this PROMPT in PR description
- [ ] **Code reviewed**: Self-review completed

---

## 🤖 AI Context (Technical Specs)

### 📐 Architecture

- **Legacy (`apps/web/`)**: Production runtime — React 18 (CDN), inline
  components
- **Modern (`packages/`)**: TypeScript packages for reusable logic
- **Full guide**: `.github/copilot-instructions.md`

### ❌ Anti-Patterns (DO NOT)

1. **NO** monkey patching `document.createElement` or `console.*`
2. **NO** FPS tracking, memory profiling (это nutrition app, не game engine)
3. **NO** rewriting Legacy JS to TypeScript without explicit request
4. **NO** global event listeners without cleanup
5. **NO** premature optimization ("Минимализм и практичность")

### 🔑 Key Patterns

- **Storage (Legacy)**: `U.lsSet('heys_key', val)` → auto-adds clientId
- **Storage (Modern)**: `HEYS.store.set('key', val)` → cache + watchers
- **Supabase**: Use `DatabaseService.ts` (Modern) or `cloud.*` (Legacy)
- **Analytics**: `HEYS.analytics.trackSearch()` (simple)

---

## 📂 Quick Reference

### File Locations

- **Legacy App**: `apps/web/` — `index.html`, `heys_app_v12.js`,
  `heys_core_v12.js`, `heys_day_v12.js`, `heys_user_v12.js`,
  `heys_models_v1.js`, `heys_storage_layer_v1.js`
- **Modern Packages**: `packages/core/`, `packages/shared/`,
  `packages/storage/`, `...`

### Commands

```bash
# Development
pnpm install        # Bootstrap (Node ≥18, pnpm ≥8)
pnpm dev           # Start dev server → localhost:3001

# Quality Gates
pnpm type-check    # TypeScript validation
pnpm test:all      # Run all tests
pnpm build         # Production build

# Quick Check (перед коммитом)
pnpm type-check && pnpm lint && pnpm build
```

### Key Docs

- **[Copilot Instructions](.github/copilot-instructions.md)** — AI workflow,
  patterns
- **[Architecture](docs/ARCHITECTURE.md)** — System design
- **[Performance Audit](PERFORMANCE_MONITOR_AUDIT.md)** — Performance rules

---

## 📝 Notes

- **Priority**: [high | medium | low]
- **Complexity**: [S | M | L | XL] (estimate: hours or days)
- **Blockers**: [List dependencies or blockers]
- **Related Tasks**: [Links to other PROMPTs or issues]
- **Created**: {{YYYY-MM-DD}}

---

## 🚀 Usage

1. Copy template → `docs/tasks/YYYY-MM-DD-slug.md`
2. Fill all sections (don't skip WHY/Output Preferences)
3. Use in PR: "Task prompt: docs/tasks/2025-11-24-slug.md"
4. Archive completed tasks → `docs/tasks/archive/`

---

**Version**: 3.3.0 | **Updated**: 2025-11-25  
**Changes**: v3.3.0 — Synced with copilot-instructions v2.1.0 (Storage patterns,
pnpm lint)

---
