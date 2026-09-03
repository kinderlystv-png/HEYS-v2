# Legacy map: `--color-slate-*`

Task 25 · analysis only · 2026-09-03

## Summary

| Metric                                                                        |                                         Value |
| ----------------------------------------------------------------------------- | --------------------------------------------: |
| **Total token occurrences** (`apps/web/styles/`)                              |                                       **562** |
| In migration scope (excl. `300-modals-and-day.css`, `731-ui-v4-activity.css`) |                                       **486** |
| Excluded in `300-modals-and-day.css`                                          |                                            76 |
| Excluded in `731-ui-v4-activity.css`                                          |                                             0 |
| Outside `apps/web/styles/`                                                    | **0** (all 562 live under `apps/web/styles/`) |
| Steps used                                                                    |                               10 (`50`–`900`) |
| Shadow uses                                                                   |                                         **0** |
| **Owner decision forks** (semantic conflict, see §5)                          |                                         **7** |

Property-kind totals count **token occurrences** on a declaration line (`color`
/ `background` / `border|outline` / shadow). A line with two tokens in a
`linear-gradient` counts twice.

### Scope

- **Primary:** `apps/web/styles/**`
- **Out of scope for migration mapping:** `731-ui-v4-activity.css` (no hits),
  `300-modals-and-day.css` (76 hits — mostly skeleton shimmer; noted, not
  mapped)
- **Tailwind:** `apps/web/styles/tailwind.css` holds 20 theme definitions +
  utility classes referencing slate; product modules account for the rest

### ROLE SEMANTICS source

Mappings below use role **meaning** from
`apps/web/styles/modules/002-ui-v4-palette-roles.css`, not hex proximity:

- **Ink ladder** (lines 56–63): `--v4-ink`, `--v4-ink-prose` (62%),
  `--v4-ink-data` (56%), `--v4-ink-label` (45%), `--v4-ink-secondary` (38%),
  `--v4-ink-mark` (30%); legacy `--v4-ink-2/3/4` where already wired
- **Line roles** (lines 181–191): `--v4-line` (divider 8%), `--v4-track` (empty
  segment / bar track 12%), `--v4-edge` (container outline 18%), `--v4-plan`
  (22%)
- **Surfaces** (lines 137–141, 281–293): `--v4-bg`, `--v4-surface`, `--v4-c1`
  (first surface / cards), `--v4-chip` / `--v4-chip-2` (second surface — tracks,
  quiet pills), `--v4-hero`, `--v4-float`

---

## 1. Steps used (rg-verified)

### 1.1 All `apps/web/styles/` (562 total)

| Step                |   Count | rg verify                                                                |
| ------------------- | ------: | ------------------------------------------------------------------------ | -------------------- |
| `--color-slate-50`  |       4 | `rg --pcre2 -o --no-filename -e '--color-slate-50(?:[^0-9]               | $)' apps/web/styles` |
| `--color-slate-100` |      90 | `…-100(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-200` |      90 | `…-200(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-300` |      10 | `…-300(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-400` |     104 | `…-400(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-500` |     121 | `…-500(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-600` |      39 | `…-600(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-700` |      81 | `…-700(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-800` |      17 | `…-800(?:[^0-9]                                                          | $)…`                 |
| `--color-slate-900` |       6 | `…-900(?:[^0-9]                                                          | $)…`                 |
| **Σ**               | **562** | `rg -o --no-filename -e '--color-slate-[0-9]+' apps/web/styles \| wc -l` |

### 1.2 Migration scope (486 total, excludes `300-modals-and-day.css`, `731-ui-v4-activity.css`)

| Step  |   Count |
| ----- | ------: |
| 50    |       4 |
| 100   |      67 |
| 200   |      65 |
| 300   |      10 |
| 400   |      98 |
| 500   |     113 |
| 600   |      36 |
| 700   |      72 |
| 800   |      15 |
| 900   |       6 |
| **Σ** | **486** |

Verify:

```bash
rg -o --no-filename -e '--color-slate-[0-9]+' apps/web/styles \
  --glob '!**/731-ui-v4-activity.css' --glob '!**/300-modals-and-day.css' | wc -l
# → 486
```

Per-step (PCRE2, same globs): replace `[0-9]+` with `50(?:[^0-9]|$)` etc.

### 1.3 By file (migration scope)

| File                                    | Tokens |
| --------------------------------------- | -----: |
| `modules/100-metrics-and-graphs.css`    |    163 |
| `modules/500-pwa-and-offline.css`       |    125 |
| `modules/612-training-step.css`         |     67 |
| `modules/000-base-and-gamification.css` |     51 |
| `modules/200-dark-and-effects.css`      |     26 |
| `modules/600-steps-and-aps.css`         |     21 |
| `tailwind.css`                          |     20 |
| `modules/610-aps-meal-flow.css`         |     13 |

---

## 2. Property-kind breakdown (migration scope, 486 tokens)

| Kind                                                   | Total | Rule                         |
| ------------------------------------------------------ | ----: | ---------------------------- |
| **text** (`color`, `stroke`, `caret-color`)            |   311 | ink / inverse-ink roles      |
| **fill+background** (`background`, gradients)          |   102 | surface / track / hero roles |
| **line+border** (`border*`, `outline`, `border-color`) |    73 | line / edge / track roles    |
| **shadow**                                             |     0 | —                            |

### Per step × kind

| Step | text | fill | line | shadow |   Σ |
| ---- | ---: | ---: | ---: | -----: | --: |
| 50   |    0 |    2 |    2 |      0 |   4 |
| 100  |   24 |   38 |    5 |      0 |  67 |
| 200  |    9 |   21 |   35 |      0 |  65 |
| 300  |    6 |    1 |    3 |      0 |  10 |
| 400  |   91 |    1 |    6 |      0 |  98 |
| 500  |  109 |    1 |    3 |      0 | 113 |
| 600  |   28 |    1 |    7 |      0 |  36 |
| 700  |   30 |   34 |    8 |      0 |  72 |
| 800  |   10 |    3 |    2 |      0 |  15 |
| 900  |    4 |    0 |    2 |      0 |   6 |

Classification: scan each line containing `--color-slate-N`; assign kind from
the property name on that line. Token-level count (gradient stops count
separately).

---

## 3. Proposed v4 role per (step × kind)

Justification references **role job**, not Tailwind step number.

| Step    | Kind |   n | Proposed v4 role                                              | Semantics (from `002-ui-v4-palette-roles.css`)                                                                   |
| ------- | ---- | --: | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **50**  | fill |   2 | `--v4-float`                                                  | Lightest page canvas; floats above `--v4-bg` in hierarchy                                                        |
| **50**  | line |   2 | `--v4-line`                                                   | Hairline divider (8% ink) — used in Tailwind `border-slate-200` utilities only                                   |
| **100** | text |  24 | **fork** → `--v4-ink-prose` _or_ on-dark inverse              | Mostly `color:` on chart tooltips over `--color-slate-700` panels — ink on dark fill, not prose on light surface |
| **100** | fill |  38 | `--v4-c1`                                                     | Row hover, quiet panels — first surface (`--c1` cards/chips)                                                     |
| **100** | line |   5 | `--v4-line`                                                   | List / section dividers                                                                                          |
| **200** | text |   9 | **fork** → `--v4-ink-secondary` _or_ chart stroke `--v4-line` | Mix of `stroke:` on graphs and muted copy on dark panels                                                         |
| **200** | fill |  21 | `--v4-chip`                                                   | Disabled rows, skeleton mid-tones — second surface (tracks, quiet pills)                                         |
| **200** | line |  35 | `--v4-line`                                                   | Default `--border` alias (`000-base-and-gamification.css:175`), card outlines                                    |
| **300** | text |   6 | `--v4-ink-label`                                              | Dark-theme banner summary — label tier (45%)                                                                     |
| **300** | fill |   1 | `--v4-chip`                                                   | Single PWA block background                                                                                      |
| **300** | line |   3 | `--v4-edge`                                                   | Dashed training borders — container edge (18%), not hairline divider                                             |
| **400** | text |  91 | `--v4-ink-secondary`                                          | Placeholders, hints, de-emphasized labels (38% — «вторичный» слой чернил)                                        |
| **400** | fill |   1 | `--v4-track`                                                  | One-off metric badge fill — empty segment tone (12%)                                                             |
| **400** | line |   6 | `--v4-edge`                                                   | Focus `outline`, accent left border — container edge                                                             |
| **500** | text | 109 | `--v4-ink-2`                                                  | Already aliased in `:root` (`--color-slate-500: var(--v4-ink-2, …)`); secondary body copy (55%)                  |
| **500** | fill |   1 | **fork** → `--v4-track` or remove                             | Training step solid fill — structural, not ink                                                                   |
| **500** | line |   3 | **fork** → `--v4-edge`                                        | Border on training controls while token means ink-2 in `:root`                                                   |
| **600** | text |  28 | `--v4-ink-prose`                                              | Form labels, APS copy — running text (62%)                                                                       |
| **600** | fill |   1 | `--v4-track`                                                  | Training button fill                                                                                             |
| **600** | line |   7 | `--v4-edge`                                                   | Inputs on dark `--color-slate-800` shells                                                                        |
| **700** | text |  30 | `--v4-ink` / `--v4-ink-prose`                                 | Emphasis labels, section titles — primary / prose ink                                                            |
| **700** | fill |  34 | **fork** → `--v4-hero` or `--v4-surface`                      | Chart chrome, gradient stops — **surface/hero**, not ink (see §5 fork #2)                                        |
| **700** | line |   8 | `--v4-edge`                                                   | Chart frame borders on dark panels                                                                               |
| **800** | text |  10 | `--v4-ink`                                                    | Headings; already `var(--v4-ink, var(--color-slate-800))` at `000-base…:16274`                                   |
| **800** | fill |   3 | `--v4-hero`                                                   | Dark header bars; token remapped to `--v4-hero` in `200-dark-and-effects.css:36`                                 |
| **800** | line |   2 | `--v4-edge`                                                   | Tailwind utilities only                                                                                          |
| **900** | text |   4 | `--v4-ink`                                                    | Max-contrast titles                                                                                              |
| **900** | line |   2 | `--v4-plan`                                                   | Tailwind utilities — stronger line (22%) if kept as border                                                       |

**Note:** Several `:root` entries in `000-base-and-gamification.css:140–145` and
`200-dark-and-effects.css:24–38` **redefine** slate steps as legacy shims
(`500→v4-ink-2`, `800→v4-hero`, `900→v4-bg`). Migration should replace **use
sites**, then drop shims.

---

## 4. Token definitions (shim layer)

| Token                    | Declared value             | File                                |
| ------------------------ | -------------------------- | ----------------------------------- |
| `--color-slate-100`      | `#f1f5f9`                  | `000-base-and-gamification.css:140` |
| `--color-slate-200`      | `#e2e8f0`                  | `000-base…:141`, `200-dark…:24`     |
| `--color-slate-300`      | `#cbd5e1`                  | `200-dark…:26`                      |
| `--color-slate-400`      | `#94a3b8`                  | `000-base…:142`                     |
| `--color-slate-500`      | `var(--v4-ink-2, #64748b)` | `000-base…:143`                     |
| `--color-slate-700`      | `#334155`                  | `000-base…:145`                     |
| `--color-slate-800`      | `var(--v4-hero, #1e293b)`  | `200-dark…:36`                      |
| `--color-slate-900`      | `var(--v4-bg, #0f172a)`    | `200-dark…:38`                      |
| `--color-slate-50`…`900` | Tailwind oklch scale       | `tailwind.css` `@layer theme`       |

---

## 5. Ambiguous forks (owner decisions)

**7 forks** where the **same step** carries **conflicting semantic jobs**. Agent
does not pick; owner chooses mapping policy.

### Fork #1 — `--color-slate-500` ink vs chrome

| Use               | n (scoped) | Sites                                        |
| ----------------- | ---------: | -------------------------------------------- |
| Text (ink-2 tier) |        109 | PWA, metrics, base forms                     |
| Border            |          3 | `600-steps-and-aps.css:2096`, `tailwind.css` |
| Fill              |          1 | `600-steps-and-aps.css:2102`                 |

`:root` already equates `500 ≡ --v4-ink-2`. Border/fill uses break the ink
contract.

**Decision:** A) migrate border/fill to `--v4-edge` / `--v4-track` and keep 500
only as ink shim until removed · B) split token: drop `--color-slate-500` border
uses first · C) keep dual use (not recommended — breaks role gate).

---

### Fork #2 — `--color-slate-700` panel fill vs label ink

| Use                                  |   n | Example                            |
| ------------------------------------ | --: | ---------------------------------- |
| `background:` (chart/tooltip chrome) |  34 | `100-metrics-and-graphs.css:1318+` |
| `color:` (labels on light bg)        |  30 | `000-base…:971`, metrics legends   |
| `border-color:`                      |   8 | Chart frames                       |

Fill is **hero/surface** job; text is **ink** job. Same step cannot map to one
v4 role.

**Decision:** A) split: fill → `--v4-hero`, text → `--v4-ink-prose`, border →
`--v4-edge` · B) restyle charts to use `--v4-c1` panels so 700 ink can unify ·
C) introduce `--v4-chart-panel` role (new).

---

### Fork #3 — `--color-slate-100` inverse text vs surface fill

| Use                     |   n | Example                                            |
| ----------------------- | --: | -------------------------------------------------- |
| `color:` on dark panels |  24 | `100-metrics-and-graphs.css:1306` (text on 700 bg) |
| `background:`           |  38 | Hover rows, empty states                           |
| `border`                |   5 | Section separators                                 |

Text on `#334155` panels is **on-dark ink**, not `--v4-c1` surface.

**Decision:** A) inverse text → `rgba(var(--v4-ink-rgb), …)` on-dark token or
`--v4-on-hero` if defined · B) lighten panels to `--v4-c1` so prose ink works ·
C) keep literal `#f1f5f9` as exception (rejected by role gate).

---

### Fork #4 — `--color-slate-200` global border vs skeleton track

| Use                             |   n | Example                                            |
| ------------------------------- | --: | -------------------------------------------------- |
| `--border` alias + card borders |  35 | `000-base…:175` `--border: var(--color-slate-200)` |
| Skeleton / shimmer gradients    |  21 | paired with 100 in `linear-gradient`               |
| Text/stroke                     |   9 | Charts                                             |

Divider role (`--v4-line`) vs track/shimmer (`--v4-track`) vs stroke.

**Decision:** A) borders → `--v4-line`, skeleton stops → `--v4-track` · B)
single `--v4-line` for all (loses shimmer contrast) · C) defer skeleton zone to
`300-modals` migration.

---

### Fork #5 — `--color-slate-800` / `900` shim points at surface roles, used as ink

`200-dark-and-effects.css` maps `800→--v4-hero`, `900→--v4-bg`, yet utilities
use them as **text** (`text-slate-800`, training headings).

**Decision:** A) text uses → `--v4-ink` only; remove shim aliases · B) rename
shims to `--legacy-hero-slate` to stop ink/surface collision · C) keep shim for
dark landing only.

---

### Fork #6 — `--color-slate-400` placeholder ink vs focus outline

| Use                       |   n |
| ------------------------- | --: |
| Muted text / placeholder  |  91 |
| `outline` / border accent |   6 |

Ink-secondary (38%) vs edge (18% container outline).

**Decision:** A) split as proposed in §3 · B) focus rings use act/warn role
instead of edge.

---

### Fork #7 — `--color-slate-600` prose ink vs dark-shell border

Text (28) in APS/training forms vs `border-color` (7) on `--color-slate-800`
backgrounds (`612-training-step.css:678+`).

**Decision:** A) text → `--v4-ink-prose`, borders → `--v4-edge` on dark · B)
borders → `--v4-line` (lighter) for dark shells.

---

### Excluded zone note (`300-modals-and-day.css`, 76 tokens)

Not mapped here per task rules. **76** occurrences are predominantly skeleton
`linear-gradient` pairs (`100`+`200`). When that file is in scope, treat as
**track/shimmer** fork #4 extension, not ink.

---

## 6. rg commands used

```bash
# Total occurrences (all styles)
rg -o --no-filename -e '--color-slate-[0-9]+' apps/web/styles | wc -l
# → 562

# Migration scope total
rg -o --no-filename -e '--color-slate-[0-9]+' apps/web/styles \
  --glob '!**/731-ui-v4-activity.css' --glob '!**/300-modals-and-day.css' | wc -l
# → 486

# Per-step (no 50-in-500 false positives) — requires PCRE2
rg --pcre2 -o --no-filename -e '--color-slate-500(?:[^0-9]|$)' apps/web/styles
# (repeat for 50,100,200,300,400,600,700,800,900)

# Lines with matches per file
rg -c -e '--color-slate-[0-9]+' apps/web/styles

# Outside styles check
rg -l -e '--color-slate-[0-9]+' apps/web --glob '*.css' --glob '*.js' --glob '*.html'
# → only under apps/web/styles/

# Property spot-check (text)
rg --pcre2 -c -e '(color|stroke|caret-color):[^;{]*--color-slate-[0-9]+' apps/web/styles \
  --glob '!**/731-ui-v4-activity.css' --glob '!**/300-modals-and-day.css'
```

Property-kind table (§2) verified by token-level scan of migration-scope CSS
(same globs); totals reconcile to **486**.

---

## 7. Migration order (suggested)

1. Resolve forks **#2, #3, #5** (700/100/800 ink-vs-surface) before bulk replace
   — highest semantic risk
2. Replace **text-heavy** steps: `400`, `500`, `600` → ink ladder
3. Replace **line** cluster: `200` `--border` → `--v4-line`
4. Charts / metrics (`100-metrics-and-graphs.css`, 163 tokens)
5. PWA (`500-pwa-and-offline.css`, 125 tokens)
6. Training (`612-training-step.css`, 67 tokens)
7. Drop `:root` slate shims in `000-base` / `200-dark` after zero `rg` hits
8. `300-modals-and-day.css` in separate tranche (76 tokens)
