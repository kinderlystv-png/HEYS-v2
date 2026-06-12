# Fingers strangler — REVIEW HANDOFF (для агента-ревьюера)

Стартовый контекст для продолжения ревью strangler-цепочки `fingers` в
методологическом чате. Вставь как kickoff-промпт или держи открытым рядом.

---

## Latest pass · 2026-06-12 · implementation-map closeout

Этот блок — актуальный handoff после прохода по `IMPLEMENTATION_MAP.md`. Старые
секции ниже оставлены как история ревью strangler, но часть их TODO уже закрыта
последующими проходами.

**Что реализовано в этом pass:**

- **1.2 Progression live wiring:** `records.progressionSnapshot()` строит
  `recordsByQuality` из MVC-history (`finger_strength`) и session-log proxy
  остальных качеств, `engine_router._enrichOpts` прокидывает series/currentAxes,
  builder реально применяет `_progressionAllowsAtom`. `saveProgressionAxis()` и
  Settings «Оси прогрессии» сохраняют ручной выбор текущей оси.
- **1.5 Skill balance:** если leading limiter = `technique`/`mental`, live
  builder добавляет `skill-floor` через те же `_atomFits`/equipment/prereq
  gates.
- **1.6 Readiness/S2:** добавлен client-scoped `tissueHistory`; UI пишет
  high/max tissue-load при сохранении сессии, router прокидывает `history+now`,
  builder фильтрует S2 до выбора atom.
- **6 Periodization:** UI-старт цикла создаёт `periodization` plan и mirror
  legacy `mesocycle`; router читает `periodization.current()`, builder применяет
  `plannerContext`; Today показывает forward-календарь
  недель/фаз/ceiling/volume.
- **8.2 Benchmarks:** runtime targets переведены на Berta et al. 2025 Table 3
  weighted means: intermediate 70, advanced 87, elite 102% BW; Berta добавлен в
  bibliography и показан как SourceBadge в тест-батарее.
- **9.4/9.5 Safety explainability:** age/skin soft caps работают через
  validators, Settings даёт `skinStatus` и RED-S/weight advisory без назначения
  снижения веса.
- **UI explainability:** MixCard показывает `coachReason`, exercise chips,
  SourceBadge; MixTrace теперь выдерживает и legacy rich trace, и новый
  sessionBuilder trace, показывает progression/S2/S4/MEV-MAV/danger/age-skin.

**Что ревьюеру проверять первым:**

1. Живые цепочки, а не наличие модулей: progression → builder, tissueHistory →
   S2, periodization plan → plannerContext, assessment technique limiter →
   skill-floor.
2. Trace/modal compatibility: открыть 🧮 на live mix от `sessionBuilder`; он не
   должен падать при отсутствии legacy fields
   (`safety/constants/volume/dosing`).
3. UI rule: каждый методологический фактор, влияющий на рекомендацию, должен
   быть виден в `coachReason`, chips, MixTrace, Settings advisory или
   SourceBadge.
4. Остатки в карте должны остаться остатками: content photos for non-grip
   exercises, optional Berta percentile UI. Это не hidden live-wiring: первое —
   asset/content backlog, второе требует Supplementary decile Tables S2–S5,
   которых нет в repo-data, поэтому процентили нельзя рисовать научно из текущих
   данных.

**Проверки уже пройдены:**

- `pnpm exec vitest run ...` fingers subset: 16 files, 375 tests passed.
- `node apps/web/fingers/methodology/tools/status-sync.mjs --check` — OK.
- `node apps/web/fingers/methodology/tools/impl-coverage.mjs` — 61/61 coverage,
  0 orphans, 28/28 questions resolved.
- `git diff --check` — clean.

**Не делалось намеренно:** bundle rebuild / `pnpm build` / commit / push. В
рабочем дереве есть unrelated marketing/cloud changes; ревью fingers-scope лучше
ограничивать `apps/web/fingers`, `apps/web/__tests__/fingers-*`,
`apps/web/styles/modules/fingers.css`, `apps/web/scripts/bundle-fingers.cjs`.

---

## 0. Как пользоваться этим файлом

Ты — **code/methodology reviewer** между слоями strangler-fig рефактора движка
тренировок пальцев (`apps/web/fingers/`). Кодит другой агент/пользователь; ты
ревьюишь его диффы и принимаешь методологические развилки. Этот файл = вся
история ревью + правила работы. Источник истины по продукту —
`apps/web/fingers/ methodology/` (CONSTRUCTOR_SPEC, METHODOLOGY, PROTOCOL_POOL,
KICKOFF). История обходов — `REVIEW_step3-4.1.md`, `REVIEW_step4.3.md`, этот
файл.

---

## 1. Роль и метод работы (как ревьюить)

- **Read-only по умолчанию.** Режим ревью = «без правок»: читаешь, проверяешь,
  выносишь вердикт + находки. Код не трогаешь, если явно не попросили.
- **Не верь саммари — читай первоисточник.** На каждый модуль: сам модуль + его
  тесты + релевантная секция спеки + legacy-контракт (`mix_engine_v1.js`).
  Сверяй построчно (напр. assessment ↔
  `CONSTRUCTOR_SPEC §3.2 L320/L333/L334-335`).
- **Верифицируй прогоном, не доверием.** Где можно — гоняй детерминированный код
  в `node` (модули — чистые IIFE, регистрируются на `globalThis.HEYS.Fingers`),
  снимай эмпирику сам, не проси юзера лезть в браузер. Пример: распределение
  `doseShape` сгенерированных сессий считается в node за секунды (см. раздел 6).
- **Инварианты strangler, которые проверяешь каждый слой:** флаг default off;
  off-live-path; fail-closed на невалидный вход; **детерминизм** (нет
  `Date.now()`/ random — у проекта история clock-skew багов, см. корневой
  `BUGS_HISTORY.md`); контракт-совместимость с mixEngine **на вход И на выход**;
  safety-floor цел.
- **Главный контракт — это UI** (`session_ui_v1.js`), а не поля объекта сессии.
  UI-плеер знает только hang-протокол (`hangSec/restSec/repsPerSet/setsCount`).
  `isValidSession` проверяет session-level поля, НЕ renderability упражнения.
- **Каждый обход → файл** `REVIEW_step*.md`: вердикт (🟢/🟡/🔴), по-модульно с
  file:line, находки, чек-лист «до flag=on». Находки нумеруй, не теряй между
  обходами.
- **Стиль ответа** (проектный): на «что предлагаешь» — одно «предлагаю X, потому
  что Y» + вопрос «делать?»; не вываливать таблицы вариантов, которые юзер уже
  привёл.

---

## 2. Карта архитектуры

**Strangler-цепочка (новый движок):** `block_catalog` (3.1, 36 атомов×9 блоков)
→ `validators` (3.2, S1–S8 + V\_\*) → `assessment` (3.3, scoring лимитера §3.2)
→ `engine_router` (4.1, scaffold) → `sessionBuilder` (4.2, новый движок) за
флагом.

**Роутер** (`engine_router_v1.js`): `flags.newEngine` (default off) →
`mixEngine` (legacy) или `sessionBuilder`; `isValidSession` — контракт-guard;
`flags. shadowCompare` (default off) → гоняет оба, отдаёт builder, дифф в
`lastShadowDiff`.

**Legacy (то, что замещаем):** `mix_engine_v1.js` + `programs_catalog_v1.js` +
`session_ui_v1.js` — **всё hang-протокол only** (0 boulder/circuit/arc; плеер
дефолтит `hangSec||7`).

**Ключевые файлы:**
`apps/web/fingers/heys_fingers_{block_catalog,validators, assessment,engine_router,session_builder,mix_engine}_v1.js`;
тесты — `apps/web/__tests__/fingers-*.test.js`.

---

## 3. Ledger коммитов + статус

| Шаг     | Что                                                      | Commit                             |
| ------- | -------------------------------------------------------- | ---------------------------------- |
| 3.1     | block_catalog (36×9)                                     | `ea6dcfea`                         |
| 3.2     | validators S1–S8 + V\_\*                                 | `3e8a23dd`                         |
| 3.3     | assessment §3.2                                          | `f0d3d524`                         |
| 4.1     | engine_router scaffold                                   | `f0ea8a3c`                         |
| pre-4.2 | hardening (contract-guard + S2 fix + ниты #1)            | `256f5863`                         |
| 4.2     | sessionBuilder                                           | `b0bd2af3`                         |
| 4.3a-e  | level fail-closed / 16-полей контракт / shadow-compare   | `fc6f1b61`, `a69132c8`, `7add4450` |
| —       | shadow doseShape-distribution метрика                    | `7bbb3d62`                         |
| B1.5    | builder cut `{hang,reps}`                                | `5fabebad`                         |
| S9      | prerequisites enforcement + bonus `profile.age` fallback | `94f04a06`                         |

**Регрессия:** 198/198 (6 файлов). **Локальный долг:** ~11 непушенных коммитов
(`f0d3d524`→`94f04a06`); dep-агент подхватит при push.

---

## 4. Найдено и закрыто (по обходам)

**Ревью #1 (3.1–4.1):** 🟢. Спека реализована точно; strangler-дисциплина
эталонная. 2 шва до 4.2: (1) safety-floor antagonist/mobility не из
blockWeights; (2) роутер не валидирует выход. Ниты: S2 `Date.now()`,
формула-шорткат, фиделити каталога, validate()-ассерт, runAll presence-dispatch.

**Ревью #2 (4.2 sessionBuilder, в чате):** 🟡 → нашёл 3:

- 🔴 #1 `level` silent mis-level (default `'intermediate'` обходил S1
  fail-closed).
- 🔴 #2 output-контракт уже UI (mixEngine ~16 полей vs builder 5;
  `requiresWarmup` = S3-safety).
- 🟡 #3 `intensity`-домен (bucket vs `sessionIntensity`). → Закрыты в 4.3: level
  fail-closed, 16 полей + legacy-aliases + `isValidSession` усилён,
  `intensity = sessionIntensity(exercises)` + `opts.intensity` override.

**Ревью #3 (4.3):** 🟢 как фикс; вскрыл 2 структурных гейта активации (см.
раздел 7). Эмпирика: 71% упражнений non-hang; **pure B1 (hang-only)
нежизнеспособен** — antagonist/mobility = `reps`, hang-only ломает safety-floor.
→ решение **B1.5**.

**Ревью #4 (после B1.5 cut):** 🔴 новый safety-шов — `S1`/`_atomFits` гейтят
только age+level, **`gates.prerequisites`/`dangerLevel` не проверялись**.
`aer_bfr_lowload` (BFR без `bfr_cuff_technique`) пробивался при честном
intermediate. → **закрыто S9** (`94f04a06`): новый prereq-валидатор + hook в
`_atomFits`, `completedPrerequisites=[]` default → fail-closed. BFR/min-edge/
fall-setup теперь блокируются, есть тесты.

---

## 5. Открыто / следующие действия

| Пункт     | Что                                                                                                       | Статус                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **(b)**   | MVC-derived `level` с полом+кэпом                                                                         | ждёт reviewer-OK по 3 решениям (раздел 6)                                                                 |
| **(c)**   | dev shadow-compare с doseShape-диффом → snapshot ревьюеру                                                 | после (b) (на live-opts без level → null)                                                                 |
| **(d)**   | UI `reps`-рендер (1 ветка в плеере по `doseShape`)                                                        | **первая live-path правка — только по явному go после snapshot**                                          |
| **S10**   | danger-budget (`gates.dangerLevel`) enforcement                                                           | низкий приоритет (S9 покрыл prereq; min-edge отрезан base\_>=2y, campus — B1.5) — решить, нужен ли вообще |
| —         | `coachReason`/`description` — человеческий текст вместо жаргона                                           | косметика, до live                                                                                        |
| **Шаг 5** | UI-плеер на остальные 4 doseShape (attempts/circuit/continuous/process) → разблокирует 19 non-hang атомов | большая работа, не Фаза 1                                                                                 |

---

## 6. Позиция ревьюера по открытым (b)-решениям

Все три — **OK** с заметками (мой голос):

1. **Mapping** MVC %BW → level через `assessment.BENCHMARKS.finger_strength`
   (`<58 beginner; <82 intermediate; <107 advanced; ≥107 elite`). ✅ OK —
   переиспользует существующий бенчмарк, консистентно с `computeDeficit`.
   Граница: бенчмарк = порог уровня, так что `< 58` (строго) → beginner.
2. **Cap = `'advanced'`** ✅ — elite-протоколы требуют не только силы пальцев
   (зрелость/стаж), а S9 уже гейтит min-edge (`base_>=2y`). Кэп `'intermediate'`
   избыточен. Согласен с твоим голосом.
3. **Источник/interaction**: explicit `opts.profile.level` > derive из
   `mvcPctBW` (floor/cap) > `'beginner'` (fail-safe). ✅ OK — правильный
   приоритет (явное > измеренное > безопасный дефолт). Добавь: explicit level НЕ
   обходит S9 (prereq-гейт отдельный — уже так).

Эмпирика для проверки (детерминированно в node): после реализации `_deriveLevel`
прогони builder на `{mvcPctBW: 30/65/90/120}` без explicit level → ожидаешь
`beginner/intermediate/advanced/advanced` (последний — кэп).

---

## 7. Два структурных гейта (big picture для методолога)

- **Гейт #1 — источник `level`:** live opts (зеркало mixEngine, который level не
  читает) его не несут → builder инертен (всегда null → fallback). Решается (b)
  MVC-derive. До этого новый движок безопасен, но не запускается вживую.
- **Гейт #2 — UI hang-only:** плеер знает только вис; каталог — 6 doseShape.
  Решение **B1.5**: builder ⊂ `{hang,reps}` (`5fabebad`) + UI-рендер `reps` (d).
  Полный non-hang (boulder/ARC/campus/circuit/process) = Шаг 5. Это главный гейт
  всей затеи.

---

## 8. Чек-лист ДО `flag=on` в проде

- [x] level fail-closed (#1) · полный output-контракт + isValidSession (#2) ·
      intensity-домен (#3).
- [x] B1.5 builder-cut `{hang,reps}` (`5fabebad`).
- [x] S9 prerequisites enforcement (`94f04a06`).
- [ ] (b) `level` = B (MVC-derive, floor `beginner`, cap `advanced`).
- [ ] (d) UI `reps`-рендер.
- [ ] (c) dev shadow snapshot → reviewer OK.
- [ ] S10 danger-budget — решить, нужен ли после S9.
- [ ] `coachReason`/`description` — человеческий текст.

> Дальше по плану: (b) + (опц. S10) одной сессией → (c) shadow snapshot ревьюеру
> → мой OK → (d) UI reps-render (первая live-path правка).
