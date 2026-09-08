# UI v4 — инвентаризация dirty tree

**Дата:** 2026-09-08 (UTC+3)  
**Ветка:** `main`  
**HEAD на момент аудита:** `60809d5c4` — docs(ui): закрыть аудит мёртвых CSS
polosa5  
**Контекст:** параллельная работа (3 polosas); **ничего не удалять и не
восстанавливать** по этому документу — только учёт.

## Команды подсчёта

```powershell
Set-Location c:\Users\User\HEYS-v2
git status --short
(Get-ChildItem -File -Filter ".tmp-*").Count
(Get-ChildItem -Directory -Filter ".tmp-*").Count
git status --short scripts/ | Select-String "^ D"
git status --short apps/web/public/
git status --short | Where-Object { $_ -notmatch '^\?\?' } | Measure-Object
git status --short | Where-Object { $_ -match '^\?\?' } | Measure-Object
```

## Сводка пересчёта (факты этого хода)

| Метрика                                | Гипотеза | Факт                                    |
| -------------------------------------- | -------- | --------------------------------------- |
| `.tmp-*` файлы в корне                 | 99       | **109**                                 |
| `.tmp-*` каталоги в корне              | —        | **2** (`task153`/`task159` screenshots) |
| Удалённые tracked в `scripts/`         | 14       | **14**                                  |
| Удалённые tracked в `apps/web/public/` | 30       | **16** (8 bundle × `.js` + `.gz`)       |
| Всего удалённых tracked                | —        | **30** (14 + 16)                        |
| Изменённые tracked (не `??`)           | 34       | **32** (`M`/`MM`, без `D`)              |
| Неотслеживаемые (`??`)                 | —        | **733**                                 |
| Tracked dirty всего                    | —        | **62** (32 изменённых + 30 удалённых)   |

---

## 1. Tracked dirty — зоны и владение

### 1.1 `apps/web/` — generated / bundle scope (foreign к polosa-инвентарю)

| Статус        | Файлы                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M`           | `bundle-manifest.json`, `index.html`, `heys_day_bundle_v1.js`, `heys_day_core_bundle_v1.js`, `heys_day_meals_bundle_v1.js`, `heys_pwa_module_v1.js` |
| `M` `public/` | `build-meta.json`, `bundle-manifest.json`, `lazy-manifest.json`, `sw.js`, `version.json`                                                            |
| `D` + `??`    | 8 boot/postboot bundle-пар (старые hash удалены, новые hash не закоммичены) — см. §3                                                                |

### 1.2 `docs/ui/` — foreign (другие polosas / дизайн)

- `UI_V4_DIVERGENCE_ROWS.json`, `UI_V4_DIVERGENCE_ROWS.md`
- `UI_V4_FINDINGS_FOR_DESIGNER.md`, `UI_V4_FINDINGS_HISTORY.md` (`MM` — staged +
  unstaged)
- handoff canvas zip + `design_handoff_heys_v4/*` (ACCEPTANCE-_, README,
  `_.v4.dc.html`)
- `??` — `handoff-v4/canvas/Тренажер база данных/` (новый пакет)

### 1.3 `scripts/` — mixed

| Статус | Файлы                                                                                                                                                            | Примечание                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `M`    | `.legacy-mismatch-classified.json`, `.polosa4-task69-touch-target-inventory.json`, `.task118-subscription-q-commit-msg.txt`, `ui-v4-check-foreign-fallbacks.mjs` | ongoing                                 |
| `D`    | 14 dotfiles — см. §2                                                                                                                                             | **локальное удаление, в HEAD ещё есть** |
| `??`   | сотни `scripts/.task*`, `scripts/.tmp-*`, `scripts/.polosa*`, commit-msg, measure/verdict apply                                                                  | WIP polosas 4/5 и задачник              |

### 1.4 `security-reports/` — generated (foreign)

- `sast-report.html`, `sast-report.json`, `sast-report.sarif`

### 1.5 Корень и `.cursor/` — untracked WIP

- `??` `.claude/isolated-index/`, `.cursor/.fm-cta-fix-bak/`,
  `.cursor/.package44-reg-apply.mjs`
- `??` 109× `.tmp-*` + 2 каталога — см. §4

---

## 2. Четырнадцать удалённых tracked scripts

**Статус:** файлы **есть в `HEAD`**, удалены только в рабочем дереве
(`git status`: `D`). Восстановление и коммит удалений **не делались**.

Для каждого: `git log --follow --oneline -5 -- <path>`.

| #   | Файл                                                    | Добавлен (коммит)                       | Класс                                             | Вердикт                                                                                                                                                                                      |
| --- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/.polosa4-task126-commit-msg.txt`               | `0aab0b4ef` task126 norm-correction     | одноразовый commit-msg                            | **OK удалить** после коммита task126                                                                                                                                                         |
| 2   | `scripts/.polosa4-task126-handoff.json`                 | `0aab0b4ef`                             | handoff-метаданные (не раннер)                    | **OK** — запись задачи; дублирует протокол                                                                                                                                                   |
| 3   | `scripts/.task101-pkg36-checkin-morning.mjs`            | `abb3b9b71` pkg36 acceptance            | batch verdict apply                               | **OK** — применён в pkg36                                                                                                                                                                    |
| 4   | `scripts/.task101-pkg36-curator-cabinet.mjs`            | `abb3b9b71`                             | batch verdict apply                               | **OK**                                                                                                                                                                                       |
| 5   | `scripts/.task101-pkg36-login.mjs`                      | `abb3b9b71`                             | batch verdict apply                               | **OK**                                                                                                                                                                                       |
| 6   | `scripts/.task101-pkg36-strength-builder.mjs`           | `abb3b9b71`                             | batch verdict apply                               | **OK**                                                                                                                                                                                       |
| 7   | `scripts/.task116-report-screens-verdicts.mjs`          | `3d354f570` cycle/period report screens | batch verdict apply (статические факты CSS/UI)    | **OK**                                                                                                                                                                                       |
| 8   | `scripts/.task118-subscription-q-apply.mjs`             | `716be0d4e` close subscription `?`      | batch verdict apply                               | **OK**                                                                                                                                                                                       |
| 9   | `scripts/.task122-finding09-rest-verdicts.mjs`          | `746823bc7` task122 E1 rest column      | batch verdict apply                               | **OK** — шаблонный FACT, не live measure                                                                                                                                                     |
| 10  | `scripts/.task122-pkg36-gap-strength-builder.mjs`       | `4c578ba97` / `abb3b9b71`               | документирование gap pkg36                        | **OK**                                                                                                                                                                                       |
| 11  | `scripts/.task122-report-computed-verdicts.mjs`         | `746823bc7`                             | batch apply **с embedded computed sand/blue hex** | **⚠ loss of verification method** — потеря воспроизводимого apply-скрипта с замеренными `#5c6a45` / `#a83c22` и т.д.; вердикты уже в `docs/ui/verdicts/`, но пересъёмку без скрипта сложнее |
| 12  | `scripts/.task124-subscription-debts-commit-msg.txt`    | `4edcd04d3` subscription converge       | commit-msg                                        | **OK**                                                                                                                                                                                       |
| 13  | `scripts/.task124-subscription-debts-verdicts.mjs`      | `4edcd04d3`                             | batch verdict apply                               | **OK**                                                                                                                                                                                       |
| 14  | `scripts/.task124-subscription-verdicts-commit-msg.txt` | `4edcd04d3`                             | commit-msg                                        | **OK**                                                                                                                                                                                       |

**Итог по scripts:** 13/14 — одноразовые handoff/verdict/commit-msg после
закрытых коммитов 2026-09-05; **1 файл**
(`task122-report-computed-verdicts.mjs`) — **потеря метода верификации** (не
live-калькулятор, но единственный зафиксированный apply с computed-числами для
дизайнерского контура отчётов).

**Рекомендация:** не коммитить удаление; при уборке polosa4 —
`git restore scripts/.task122-report-computed-verdicts.mjs` или перенести в
`scripts/archive/`; остальные 13 — можно удалить из дерева **после**
подтверждения, что вердикты в JSON и тесты зелёные.

---

## 3. Bundles `apps/web/public/` (16 deleted + 16 новых `??`)

### Удалённые (старые hash)

| Bundle                   | Старый hash (удалён) | Новый hash (`??`) |
| ------------------------ | -------------------- | ----------------- |
| boot-core                | `f909a35a1b21`       | `31c83dcd7c80`    |
| boot-calc                | `63abca3b4b14`       | `52104c849d6b`    |
| boot-day                 | `af78a3789d90`       | `ccedcf65b861`    |
| boot-app                 | `73a7d1dec5f6`       | `5d88c3bb01f1`    |
| boot-init                | `d472dc64aa0a`       | `5db080418f1b`    |
| postboot-1-game-lazy     | `17421c470dea`       | `e374e127cb86`    |
| postboot-2-insights-lazy | `acd329561510`       | `ef734cdcfaee`    |
| postboot-3-ui-lazy       | `ca5d6ebe4227`       | `30066d53640f`    |

По каждому: `.js` + `.gz` → **16 deleted**, **16 untracked**.

### Проверка manifest / index

Поиск старых hash в `apps/web/public/bundle-manifest.json`,
`apps/web/bundle-manifest.json`, `apps/web/index.html`,
`apps/web/public/lazy-manifest.json`:

- **Старые hash (`73a7…`, `63ab…`, `f909…`, `af78…`, `d472…`, `1742…`, `acd3…`,
  `ca5d…`):** **0 вхождений**
- **Новые hash:** все 8 присутствуют в обоих `bundle-manifest.json`, boot — в
  `index.html`, postboot — в `lazy-manifest.json`

### Локалка сломана?

**Нет** — при условии что на диске лежат **новые** `??` bundle-файлы и dirty
`index.html`/manifest указывают на них. Типичный preview после
`pnpm bundle:legacy:auto` / `bundles:sync`: старые hash удалены, новые не
закоммичены.

**Сломается**, если: закоммитить только manifest без новых `.js`, или откатить
`??` bundles, оставив новые hash в manifest.

---

## 4. Корневые `.tmp-*` (109 файлов + 2 каталога)

Классификация: имя + mtime (2026-09-04…08) + `rg '\.tmp-'` по репо +
сопоставление с коммитами task/polosa/p47/p48.

### Сводка корзин

| Корзина                     | Кол-во | Смысл                                                                                                                                          |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) spent**               | **57** | Черновики закрытых шагов: `*-commit.msg`, vitest/roles/drift `.log`, снимки strength 34/750, proposal `746823`, task155/task175/task181 drafts |
| **(b) active / referenced** | **38** | 36 файлов + 2 каталога screenshots; инвентари, measure-скрипты, polosa4/5/p47 drafts, paired analyze→report                                    |
| **(c) unclear**             | **16** | debug/FF-analyze, старые commit.msg без явного закрытия, `touch-audit.mjs`                                                                     |

### (a) Spent — 57 файлов (группы)

- **Commit-msg drafts (~40):** `dead-css-audit`, `strength-table-head`,
  `composition-rows`, `gamification-ach-ink`, `theme-fab-*`, `package48`,
  `p48-findings`, `tail-designer-refs`, `verdict-addresses`,
  `nc5-owner-question`, `otvet-22-47`, `completed-frame-evidence`,
  `press-state-fold-toggle`, `revoke-copy-test`, `lane6-address-baseline`,
  `strength-d14`, `messenger-decisionref`, `decision-ref`, polosa4/5 touch,
  task69*, task175/181, p47-* (часть), и др.
- **Logs (7):** `vitest-only/skip`, `roles-check`, `drift-check`,
  `task186-vitest`, `vitest-run1/2*.log`
- **Strength diff snapshots (8):** `34-750.css`, `34-superset.js`, `750-*`,
  `current-*`, `origin-*`
- **Closed task artifacts (2):** `proposal-746823.js`, `task155-*` (4 файла)

### (b) Active / referenced — 38

**Пары analyze → report (сохранить до удаления):**

- `.tmp-dark-literals-analyze.mjs` → `.tmp-dark-literals-report.json`
- `.tmp-analyze-200-dark.mjs` → `.tmp-200-dark-hits.json`

**Инвентари с числами для людей/дизайнеров (⚠ recommit или архив перед
delete):**

| Файл                             | Содержимое                          | Риск                                                       |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `.tmp-touch-inventory.json`      | 518 violations, captured 2026-09-06 | единственный полный снимок touch-gate; не в committed docs |
| `.tmp-touch-inventory.txt`       | текстовый дубликат                  | то же                                                      |
| `.tmp-address-problems.json`     | audit verdict-addresses             | не найден в `docs/` по имени                               |
| `.tmp-address-report.json`       | zones/rowsSeen/problems             | не закоммичен                                              |
| `.tmp-p43-drift.json`            | структура touch-inventory (pkg43)   | не закоммичен                                              |
| `.tmp-dark-literals-report.json` | fixable/diff/norole counts          | питает polosa5 dark-literals                               |
| `.tmp-200-dark-hits.json`        | hits byValue                        | питает 200-dark work                                       |

**Polosa / measure scripts (могут ещё вызываться):**

- task69: `apply-touch-fixes.mjs`, `widgets-row-measure.mjs`, commit `.msg`
- messenger: `chromium-measure.mjs`, `bare-count.mjs`, `scope-count.mjs`,
  `head-tail.css`
- ink: `ink2-measure-610-611.mjs`, `ink2-056.mjs`
- p47/sb: `sb-p47.diff`, `strip-p47-prose.mjs`, `compare-frames.mjs`,
  `compare-frames2.mjs`, `finish-diff.mjs`, `fix-moved-closest.mjs`
- water: `water-add-inventory.txt`, `water-check.txt`, `water-inv2/3.txt`,
  `water-audit.mjs`
- vitest patch: `patch-vitest.cjs/mjs`, `patch-vitest2.cjs`
- visual QA: `.tmp-task153-visual-qa.mjs` + `.tmp-task153-screenshots/`,
  `.tmp-task159-visual-qa.mjs` + `.tmp-task159-screenshots/`
- context: `canvas-refs-context.txt`
- polosa5/p47 commit drafts ещё в работе: `polosa5-commit.msg`,
  `polosa5-touch-commit.msg`, `pkg47-polosa5-commit.msg`, `p47-*.msg`,
  `package47-commit.msg`, `touch-gate-commit.msg`, `ink-ladder-commit.msg`,
  `ink2-dark-commit.msg`

**Ссылка из committed кода:** `scripts/pricing-sync-inventory.mjs` игнорирует
`scripts/.tmp-*` (не корневые).

### (c) Unclear — 16

```
.tmp-analyze-ff.mjs
.tmp-analyze-ff2.mjs
.tmp-block-debug.mjs
.tmp-commit-dark.msg
.tmp-commit-drums.msg
.tmp-commit-fingers.msg
.tmp-commit-modals.msg
.tmp-extract-debug.mjs
.tmp-findings-p48-touch-close.msg
.tmp-list-remaining.mjs
.tmp-old-lines.mjs
.tmp-old-lines2.mjs
.tmp-p48-singletons-findings.msg
.tmp-show-older-debug.mjs
.tmp-theme-fab-brace-fix.msg
.tmp-touch-audit.mjs
```

---

## 5. Рекомендации (без удаления сейчас)

1. **После остановки 3 polosas:** одним проходом `git restore scripts/` для 14
   deleted (или осознанно архивировать `task122-report-computed-verdicts.mjs`).
2. **Корзина (a) 57 файлов:** удалить с диска, когда нет открытых task с тем же
   номером в задачнике.
3. **Корзина (b):** перед delete — закоммитить или перенести в `docs/ui/audits/`
   JSON с числами (`touch-inventory`, `address-*`, `dark-literals-report`,
   `200-dark-hits`, `p43-drift`).
4. **Bundles:** не коммитить partial; либо source-only коммиты polosas, либо
   integration с полным `bundle:legacy` + новые hash-файлы.
5. **733 `??` в `scripts/`:** отдельная инвентаризация по владельцу polosa; этот
   документ их не классифицирует поштучно.
6. **Foreign dirty** (`docs/`, `security-reports/`, generated bundles): не
   трогать в рамках чужих polosas.

---

_Документ создан аудитом dirty tree 2026-09-08. Удалений и restore не
выполнялось._
