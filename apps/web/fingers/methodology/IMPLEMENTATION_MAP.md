# Карта реализации (методология → код)

Трассировка «каждая единица методологии → как ложится в код». Цель — чтобы при
реализации **ничего не потерялось**: пустая ячейка в матрице видна сразу.

**Это не пересказ методологии**, а ключ-таблица по стабильным ID. Содержание
«что/зачем» живёт в [`METHODOLOGY.md`](METHODOLOGY.md); дизайн модели/движка — в
[`CONSTRUCTOR_SPEC.md`](CONSTRUCTOR_SPEC.md); пробелы готовности — в
[`IMPLEMENTATION_READINESS.md`](IMPLEMENTATION_READINESS.md). Здесь — связка.

**Синхронизация.** Документы НЕ синхронизируются по содержанию (это
небезопасно). Синхронизация — по **покрытию ID**: скрипт
[`tools/impl-coverage.mjs`](tools/impl-coverage.mjs) сверяет, что у каждой
единицы методологии (подразделы `N.M`, блоки `block-X`, валидаторы `Sk`,
part-level `part-N`) есть строка здесь, и нет осиротевших строк. Правишь
методологию → чекер покажет, где карта отстала. Запускать по правилу «правка
завершена» (см. `CLAUDE.md`).

**Колонки:** ID · что (методология, кратко) · реализация (что становится в коде)
· модуль(и) HEYS · фаза (0 метод./1 MVP/2 greenfield) · **заполн.** — состояние
_этой карты_ (✅ ячейка заполнена / 🟫 черновик-класс / ⬜ пусто).

⚠️ «Заполн.» — про авторство карты, **НЕ про готовность кода**. Готовность кода
выражают «Фаза» + [`IMPLEMENTATION_READINESS.md`](IMPLEMENTATION_READINESS.md);
что уже частично есть в текущем коде — помечено в ячейке «реализация» словом
«уже/есть».

> **Статус:** карта заполнена целиком — на каждую из 61 единицы есть карточка
> (полная или групповая для однородных частей 4/5/7). Дальнейшая работа — не
> «заполнение», а **решение открытых вопросов пула** (28 шт.) и углубление по
> мере реализации. Чекер `impl-coverage.mjs` держит покрытие и связность пула.

---

## 🎯 План дальнейшей работы (трекер · снимок 2026-06-12)

Движок strangler собран; в исходнике `engine_router` default уже
`flags.newEngine = true`. Live-wiring pass 2026-06-12 подключил главные hidden
gaps к реальной сборке сессии; ниже остались только контент/optional хвосты до
«полного режима пальцев». Отмечай `[x]` по мере.

**Решение (2026-06-12, live-wiring audit): флип не равен завершению.** Safety и
рендер сессий доведены до рабочего состояния, но «научные» модули должны быть
подключены к живым входам, иначе они остаются как мотор без ремня к колёсам.

**A. После включения нового движка — ближайшее:**

- [x] `flags.newEngine` default=true в `engine_router` (fallback на legacy при
      null/throw/contract-fail остаётся)
- [ ] Dev-смоук в браузере: hang + reps сессия (RPE/pain/abort/рендер
      `RepsCounterDisplay`)
- [ ] Наблюдение `engineRouter.lastShadowDiff`/fallback-rate на живых данных
- [x] level-capture UI ✅ — onboarding+settings; уровень = стаж нагрузки на
      пальцы (не грейд); advanced/elite требуют confirm (открывают малое
      ребро/высокую нагрузку) — safety-трение на self-attestation
- [x] tech-debt: консолидация `useCountdownCycle`/`useRepsCycle` в общее ядро ✅
      (commit `0f9ef53e`, A4): `useTimerCore` — общее ядро, оба хука тонкие
      обёртки; покрыто `fingers-timer-cycle`/`fingers-reps-cycle`

**B. Фаза 2 — методология есть, движок отсутствует или частичный:**

- [x] **Периодизация (ч.6) — live wiring** ✅ 2026-06-12: UI-старт
      тренировочного цикла теперь создаёт `periodization`-plan через
      `periodization.buildPlan(...)->savePlan(...)`, `mesocycle.current()`
      читает active plan, `engine_router` прокидывает `current()` в
      `plannerContext`, а `session_builder` реально клампит bucket/volume по
      фазе; Today показывает forward-календарь недель, фаз, ceiling и volume%.
- [x] **UI-плеер на остальные doseShape (Шаг 5 a–d)** ✅ 2026-06-09 —
      attempts/circuit/continuous/process в проде: Runner+Display каждого,
      `RENDERABLE_DOSESHAPES` расширен с `{hang,reps}` до всех 6 (B1.5-cut
      снят), тесты `fingers-{continuous,attempts,circuit,process}-display`.
      Non-hang атомы (болдер/ARC/кампус/техника/тактика) теперь рендерятся.
- [x] Прогрессия/вариативность (1.2/1.3) — live enforcement ✅ 2026-06-12:
      `records.progressionSnapshot()` собирает `recordsByQuality`:
      `finger_strength` из MVC-history, остальные качества из session-log proxy,
      `engine_router._enrichOpts` прокидывает series/currentAxes в builder,
      default-ось seed'ится от explicit maturity (intermediate+ → load),
      `_progressionAllowsAtom` реально ограничивает выбор атомов;
      `saveProgressionAxis()` + Settings UI сохраняют ручной выбор текущей оси.
- [x] FDP/FDS edge-ротация (1.3 / §3.3) ✅ — `edge_history` копит
      кросс-сессионный lean-лог хватов (crimp=FDP / open=FDS из grips
      primaryMuscles, client-scoped, окно 21д), `session_builder` чередует хваты
      к под-нагруженному сгибателю (reorder-only); запись на завершении сессии в
      `session_ui`
- [x] МЭД / MEV-MAV (1.7 / §3.7) ✅ — MAV режет недельный quality-объём
      (`_enforceQualityMav`), MEV объясняет недобор без форса нагрузки
- [x] UI ввода тест-батареи (8.1) ✅ — вкладка «Тесты» (`test_battery`): форма 9
      тестов → `saveAssessmentBattery` → лимитёр + веса блоков + due-бейджи
- [x] Ретест-напоминания (8.4) + графики прогресса (8.6) ✅ — баннер
      due-тестов + спарклайны MVC-истории (тренд силы по бенчмарк-хватам) во
      вкладке «Тесты»
- [x] transfer-мостик (1.1 M3) ✅ — фингерборд-сила в сессии без
      application-блока добирает один атом max_strength/power на board/wall
      (`session_builder` additive-floor); fail-safe: нет board/wall → не
      навязывается
- [x] под-режимы aerobic (3.2) ✅ — `energySubMode` capacity/power на атомах E +
      `qualityCatalog.deriveAerobicMode`; selector клонит долю интермиттента по
      уровню (Baláš 2016)
- [x] homed Фаза-2 валидаторы («Заметки целостности») ✅ 2026-06-12:
      `V_ageModifier` (35+) и `V_skinStatus` дают advisory `volumeMultiplier`,
      `session_builder` применяет их как мягкий volume-cap и показывает в trace.

**C. Числовая база:**

- [x] 🟢-апгрейд runtime-бенчмарков §3.5 — Berta 2025 Table 3 sex-neutral
      weighted means: intermediate 70% BW, advanced 87% BW, elite 102% BW.
      Supplementary Tables S2–S5 остаются будущей percentile-UI, не блокером
      limiter/scoring.

**Регрессионный re-shadow после `flag=on`** (числовой guardrail — держать при
дальнейших правках движка):

- **doseShape:** доля non-renderable атомов = 0 (все 6 рендерятся); floor
  антагонист/мобильность в пределах `legacy ± 1 слот`.
- **danger:** кумулятивный `Σ a2ForceRatio` каждой сессии ≤
  `DANGER_BUDGET[bucket]` (recovery 8 / moderate 24 / max 48) — как legacy, без
  превышений.
- **контракт:** `isValidSession = true` на 100% сэмпла opts;
  `lastSource = 'new'` (не fallback) на валидных входах с проброшенным
  уровнем/MVC.
- **safety-baseline 0 регрессий:** S1 fail-closed, S9 BFR/min-edge блок, S8
  pain-стоп (reps наследует через shared shell).

---

## 📍 Сводка готовности (КАНОН — синкается в METHODOLOGY + KICKOFF)

<!-- STATUS:SOURCE:START -->

### Готовность режима пальцев · Методология / Движок / UI

Оси: **Метод.** (наука) · **Движок** (логика strangler) · **UI**
(пользовательский поток). Легенда: ✅ готово · 🟡 частично · ⬜ Фаза 2 (бэклог)
· — n/a.

| Раздел               | Метод. | Движок | UI  |
| -------------------- | :----: | :----: | :-: |
| 0. Сводка школ       |   ✅   |   ✅   |  —  |
| 1. Принципы          |   ✅   |   ✅   | ✅  |
| 2. 9 качеств         |   ✅   |   ✅   | ✅  |
| 3. Физиология        |   ✅   |   ✅   | ✅  |
| 4. Каталог A–I       |   ✅   |   ✅   | 🟡  |
| 5. Протоколы         |   ✅   |   ✅   | ✅  |
| 6. Периодизация      |   ✅   |   ✅   | ✅  |
| 7. Уровни            |   ✅   |   ✅   | ✅  |
| 8. Тесты / бенчмарки |   ✅   |   ✅   | ✅  |
| 9. Безопасность      |   ✅   |   ✅   | ✅  |
| 10. Источники        |   ✅   |   ✅   | ✅  |

**Поставка:** движок + UI всех 6 doseShape включены через `flags.newEngine=true`
по default с fail-safe fallback на legacy. Безопасность и рендер рабочие;
оставшиеся пробелы — не «написать науку», а подключить живые входы к уже
существующим научным модулям. Детальный per-подраздел аудит — в таблице «Аудит:
Движок vs UI» ниже в этом файле.

<!-- STATUS:SOURCE:END -->

> Правишь сводку — **только здесь** (между `STATUS:SOURCE`), потом
> `node tools/status-sync.mjs` синкнёт в `METHODOLOGY.md` и `KICKOFF.md`.

---

## 📊 Аудит реализации: Движок vs UI (детально · 2026-06-12)

Четыре оси аудита: **Метод.** (наука написана/проаудирована) · **Движок**
(логика в strangler-цепочке) · **UI** (пользовательский рендер/поток). Легенда:
✅ готово · 🟡 частично · ⬜ Фаза 2 (бэклог) · — n/a.

**Правило UI-представления:** если подраздел методологии влияет на решение
движка, он должен быть виден пользователю хотя бы как tooltip/annotation,
trace/reason, badge/chip или краткое объяснение в уместном месте flow. `UI —`
допустимо только для чисто внутренних механизмов или dev-only tooling; если
Метод ✅ и Движок ✅, но пользователю непонятно, что было учтено, это UI-бэклог,
а не n/a.

### 🎯 Что осталось реализовать — по осям

Сводка пробелов на раздел: где наука (**Метод**), где логика (**Движок**), где
видимость (**UI**). Ячейка: `✅` — сделано, ничего не осталось; `—` — только для
настоящего n/a по правилу выше; иначе — **конкретно что доделать**. Детализация
по подразделам — в таблице ниже.

| Раздел               | Метод — осталось | Движок — осталось                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | UI — осталось                                                                                               |
| -------------------- | :--------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0. Сводка школ       |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                           |
| 1. Принципы          |        ✅        | **1.2** live-cap включён для MVC-history и session-log proxy остальных качеств; stored/default axis различаются, explicit maturity seed не запирает intermediate+ ниже load; `saveProgressionAxis()` сохраняет ручную ось. **1.5** technique/mental limiter добавляет live skill-floor через те же safety/equipment gates. **1.6** S2 live-history подключена: high/max tissue-load пишется в client-scoped history, router прокидывает `history+now`, builder фильтрует свежие ткани до выбора atom | ✅ 1.1/1.2/1.5/1.6/1.7/1.8 trace/reason + явный readinessOverride input + Settings «Оси прогрессии» готовы  |
| 2. 9 качеств         |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅ Quality chips/tooltips в MixExerciseList: какое качество тренируется и почему блок попал в день          |
| 3. Физиология        |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅ MixExerciseList/MixTrace показывают energy system, tissue freshness, danger и ось прогрессии             |
| 4. Каталог A–I       |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **контент**: фото `/exercises/*.webp` для не-хватовых (болдер-мувы/антагонисты/мобильность) — сейчас эмодзи |
| 5. Протоколы         |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅                                                                                                          |
| 6. Периодизация      |        ✅        | ✅ live-source подключён: UI-старт тренировочного цикла создаёт `periodization`-plan через `buildPlan(...)->savePlan(...)`; `engine_router` читает `current()` и `session_builder` применяет `plannerContext` (ceiling/volume/focus, включая `selectModel` 6.4). Legacy `mesocycle` оставлен как mirror/Today-совместимость.                                                                                                                                                                         | ✅ Today показывает forward-календарь плана: недели, фазы, ceiling и volume%; phase/reason есть в MixTrace  |
| 7. Уровни            |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅                                                                                                          |
| 8. Тесты / бенчмарки |        ✅        | ✅ runtime-бенчмарки `assessment.BENCHMARKS.finger_strength` обновлены на Berta 2025 Table 3 weighted means (70/87/102% BW); scoring/limiter используют один target на уровень. Decile Tables S2–S5 — будущая percentile-UI, не блокер движка                                                                                                                                                                                                                                                        | ✅ (8.1 ввод + 8.4 ретест + 8.6 графики готовы); опционально percentile-UI по deciles S2–S5                 |
| 9. Безопасность      |        ✅        | **9.4**: вес/RED-S — advisory-рамка, не жёсткий гейт (по решению); **9.5/3.3**: 35+ и skinStatus soft-cap уже работают                                                                                                                                                                                                                                                                                                                                                                               | ✅ RED-S/weight advisory в Settings + skin-status input/reason готовы                                       |
| 10. Источники        |        ✅        | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅ SourceBadge/BibliographyModal видны в протоколах, live mix и тест-батарее Berta 2025                     |

**Итог (после live-wiring pass 2026-06-12):** методология написана и
проаудирована везде, но часть «науки» пока не доезжает до реального выбора
сессии. **Движок:** (а) progression 1.2 больше не hidden-gap: `recordsByQuality`
доезжает в live builder, finger_strength берётся из MVC-history, остальные
качества — из session-log proxy, stored axis уважается, default axis seed'ится
от explicit maturity, ручная ось сохраняется через Settings; (б) readiness/S2
получила live-history: high/max tissue-load пишется на завершении сессии,
`engine_router` прокидывает `history+now`, builder фильтрует свежую ткань до
выбора atom, и reason виден в MixTrace/coachReason; (в) periodization 6 получила
live-source и UI-календарь: старт цикла создаёт `periodization`-plan, фаза
клампит живую session-builder сборку, а Today показывает план недель вперёд; (г)
8.2 runtime-бенчмарки переведены на Berta 2025 Table 3; (д) 9.4 вес/RED-S
сознательно advisory. **Что РЕАЛЬНО работает на живом пути:** выбор
`focusQuality` по сохранённому `leadingLimiter` из тест-батареи (§1.4/§8),
потолок bucket по readiness/cooldown, periodization phase clamp, S2 tissue
freshness, S4 FTL-кап, MAV-обрезка, aerobic-под-режимы, FDP/FDS edge-ротация,
transfer-мостик M3, `variantSeed` reroll.

**Live-wiring verdicts по спорным цепочкам:**

| Цепочка                     | Вердикт | Живой caller / отсутствие caller                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Влияние                                                                                                                                                                                                 |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6. Periodization            | PASS    | UI-старт цикла вызывает `periodization.buildPlan(...)->savePlan(...)` и mirror-ит legacy `mesocycle`; Today читает `mesocycle.preview()` и показывает forward-календарь; `engine_router._enrichOpts` зовёт `periodization.current()`; `session_builder` применяет `plannerContext`.                                                                                                                                                                                                                                                                                                                                                                         | Фаза плана реально клампит live mix-сессию, а пользователь видит текущую и будущие недели/фазы/ceiling/volume.                                                                                          |
| 1.4/8 Assessment limiter    | PASS    | `records.assessLatestBattery()` читает сохранённую battery (`apps/web/fingers/heys_fingers_records_store_v1.js:455-471`), router кладёт `assessmentResult.leadingLimiter` в `focusQuality` (`apps/web/fingers/heys_fingers_engine_router_v1.js:318-323`), builder читает `focusQuality` при подборе (`apps/web/fingers/heys_fingers_session_builder_v1.js:688-692`, `745-746`).                                                                                                                                                                                                                                                                             | Сохранённый лимитер реально меняет приоритет quality в живой mix-сборке.                                                                                                                                |
| 1.6 Readiness / S2          | PASS    | `tissueHistory.recordSession()` пишет high/max tissue-load (`apps/web/fingers/heys_fingers_tissue_history_v1.js:89-128`), `session_ui` вызывает запись при частичном/полном сохранении (`apps/web/fingers/heys_fingers_session_ui_v1.js:3698-3701`, `5332-5338`), `engine_router._enrichOpts` прокидывает `history+now` (`apps/web/fingers/heys_fingers_engine_router_v1.js:349-360`), builder применяет S2 как candidate-filter (`apps/web/fingers/heys_fingers_session_builder_v1.js:720-737`); Settings пишет `readinessOverride`, а MixCard прокидывает его в live `recommendDay` (`apps/web/fingers/heys_fingers_session_ui_v1.js:1410`, `4902-4912`). | Per-tissue 48/72h freshness защищает живую генерацию; reason и явный readiness override видны в UI.                                                                                                     |
| 1.2 Progression enforcement | PASS    | `recordProgressionSession()` пишет session-log series (`apps/web/fingers/heys_fingers_records_store_v1.js:307-330`), `saveProgressionAxis()` сохраняет ручную ось (`apps/web/fingers/heys_fingers_records_store_v1.js:248-257`), `progressionSnapshot()` отдаёт `recordsByQuality/currentAxes/axisSources` (`apps/web/fingers/heys_fingers_records_store_v1.js:350-410`), `engine_router._enrichOpts` прокидывает их и seed'ит default axis от explicit maturity (`apps/web/fingers/heys_fingers_engine_router_v1.js:330-395`), builder строит constraints (`apps/web/fingers/heys_fingers_session_builder_v1.js:869-897`, `900-906`).                      | Axis-cap реально меняет выбор атомов; explicit intermediate+ с MVC-history не запирается ниже load; non-MVC quality cap работает через session-log; ручная ось сохраняется и видна в Settings/MixTrace. |

> ⚠️ **Скрытые пробелы, которые карта раньше прятала как «✅»:** «module
> exists + покрыт тестами» ≠ «работает в проде». Прогрессия (1.2), S2 (1.6) и
> периодизация (6) уже получили live-input/live-source; этот критерий дальше
> держим для оставшихся пробелов (контент-фото, optional percentile-UI 8.2).

| Подраздел                      | Метод — осталось | Движок — осталось                                                                                                                                                                                                                                                                | UI — осталось                                                                                                           | Live-факт                                                                                                                                            |
| ------------------------------ | :--------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Специфичность              |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ coachReason поясняет transfer-мостик, когда фингерборд-сила дополняется board/wall application-блоком.               | `focusQuality` меняет порядок quality в builder; transfer-мостик M3 добавляет board/wall application-блок, если есть фингерборд-сила без применения. |
| 1.2 Прогресс. перегрузка       |        ✅        | ✅ `recordsByQuality` собирается из MVC-history (`finger_strength`) и session-log proxy (остальные качества), прокидывается через `engine_router._enrichOpts`; stored axis уважается, default axis seed'ится от explicit maturity; `saveProgressionAxis()` сохраняет ручную ось. | ✅ MixTrace показывает allowedAxis/action; Settings «Оси прогрессии» даёт ручной выбор текущей оси.                     | PASS: live-cap работает для MVC и non-MVC quality series; explicit intermediate+ не теряет max-hang; ручная ось персистится.                         |
| 1.3 Вариативность / плато      |        ✅        | Plateau-switch получает live-series через 1.2 для MVC и session-log качеств; FDP/FDS edge-ротация и `variantSeed` уже работают.                                                                                                                                                  | ✅                                                                                                                      | PASS: ротация/reroll живые; plateau live получает series по качествам, которые реально появлялись в завершённых сессиях.                             |
| 1.4 Лимитер                    |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | PASS: сохранённая тест-батарея читается роутером, `leadingLimiter` становится `focusQuality` и влияет на подбор.                                     |
| 1.5 Техника / железо           |        ✅        | ✅ technique/mental leadingLimiter добавляет skill-floor через live builder; validator остаётся недельной проверкой.                                                                                                                                                             | ✅ coachReason поясняет, что навык не вытеснен силовым блоком.                                                          | PASS: техника как quality реально попадает в live generator, когда она ведущий лимитер.                                                              |
| 1.6 Восстановление             |        ✅        | ✅ live first pass: `tissueHistory` пишет high/max tissue-load, router прокидывает `history+now`, builder фильтрует S2-конфликтующие atom до выбора; readiness/cooldown bucket уже клампит интенсивность.                                                                        | ✅ S2 tissue-freshness reason в MixTrace/coachReason + явный readinessOverride input в Settings.                        | PASS: S2 freshness работает в live generator; reason и ручной override видны в UI.                                                                   |
| 1.7 МЭД (MEV/MAV)              |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ MixTrace показывает MEV/MAV quality-bands; coachReason говорит, когда MAV срезал объём или MEV объяснил недобор.     | MAV режет недельный quality-объём, MEV объясняет недобор без форса нагрузки.                                                                         |
| 1.8 Нагрузка / риск            |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ MixTrace/coachReason показывают S4 FTL-cap, danger-budget и почему сессия стала легче/короче.                        | S4 FTL-cap + danger-budget работают в builder/router.                                                                                                |
| 2. 9 качеств                   |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ Quality chip/tooltip в MixExerciseList.                                                                              | `quality_catalog` — источник quality/emphasis/energySystem; exercise objects несут `quality`.                                                        |
| 3.1 Сила/выносл. по времени    |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ Energy chip/tooltip в MixExerciseList и дозировка в trace.                                                           | `deriveEnergySystem(workSec)` есть; exercise objects несут `energySystem`.                                                                           |
| 3.2 Энергосистемы (под-режимы) |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ Chip `capacity/power/base` в MixExerciseList; aerobic selector виден через `energySubMode`.                          | `energySubMode` capacity/power + aerobic selector по уровню работают.                                                                                |
| 3.3 Ткани / горлышко           |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ Tissue/danger/progression-axis chips + S2/age/skin reason в MixTrace.                                                | `grips_catalog` danger + S2/S9; 35+ и skinStatus дают soft volume-cap через `V_ageModifier`/`V_skinStatus`.                                          |
| 4. Каталог A–I                 |        ✅        | ✅                                                                                                                                                                                                                                                                               | Контент-фото `/exercises/*.webp` для не-хватовых: болдер-мувы, антагонисты, мобильность; сейчас emoji fallback.         | 36×9 атомы и все 6 `doseShape` рендерятся.                                                                                                           |
| 5.x Протоколы                  |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | Атомы имеют dose/loadModel/doseConfidence; UI runner'ы покрывают hang/reps/continuous/attempts/circuit/process.                                      |
| 6. Периодизация                |        ✅        | ✅ live first pass: UI-старт цикла создаёт `periodization`-plan и mirror-ит legacy `mesocycle`; router читает `current()`, builder клампит bucket/volume/focus по фазе.                                                                                                          | ✅ Today forward-календарь показывает весь план, текущую неделю, phase ceiling и volume%; phase/reason есть в MixTrace. | PASS: live-source, phase clamp и UI-календарь работают.                                                                                              |
| 7. Уровни                      |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | `profile.level`/MVC enrichment + level-capture UI; S1 minLevel/minAge gates.                                                                         |
| 8.1 Тест-батарея               |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | UI сохраняет battery через `records.saveAssessmentBattery`; router потом читает `assessLatestBattery`.                                               |
| 8.2 Бенчмарки                  |        ✅        | ✅ `assessment.BENCHMARKS.finger_strength` и builder fallback используют Berta 2025 Table 3 weighted means: intermediate 70% BW, advanced 87% BW, elite 102% BW; beginner остаётся `null`/нет нормы.                                                                             | Опционально percentile-UI по supplementary decile Tables S2–S5.                                                         | PASS: scoring/level/limiter получили peer-reviewed runtime baseline; deciles не нужны для одного target benchmark.                                   |
| 8.3 Аудит лимитера             |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | `scoreLimiters` → `leadingLimiter`; виден в тест-батарее и влияет на живой `focusQuality`.                                                           |
| 8.4 Частота тестов             |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | `dueTests` + due-бейджи/баннер; графики MVC-истории через `records.getMvcHistory`.                                                                   |
| 9.2 Правила → валидаторы       |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | S1–S9 + V\_\*; pain/warmup/abort surfaced в runner shell.                                                                                            |
| 9.3 Возраст / зоны роста       |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅                                                                                                                      | `age_gating`/S1 + age-warning в onboarding.                                                                                                          |
| 9.4 Вес / RED-S                |        ✅        | ✅ Advisory by design: вес используется для %BW/%MVC, но движок не назначает снижение веса и не делает RED-S hard-gate.                                                                                                                                                          | ✅ Settings показывает аккуратное RED-S/weight предупреждение без назначения веса.                                      | PASS by design: safety-инвариант виден пользователю и не превращён в опасную фичу.                                                                   |
| 9.5 Реабилитация / red-flags   |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ Skin-status input в Settings + reason в MixTrace/coachReason; pain/red-flag UI уже есть.                             | `S8_painStop` + `S9`; skinStatus работает как advisory soft-cap, не hard-gate.                                                                       |
| 10. Источники                  |        ✅        | ✅                                                                                                                                                                                                                                                                               | ✅ SourceBadge/BibliographyModal для протоколов, live mix и Berta-бенчмарков тест-батареи.                              | `sourceIds` + `bibliography`; расширять по мере добавления/замены чисел.                                                                             |

**Инфраструктура (вне нумерации методологии):**

| Слой                           | Движок | UI  | Заметка                                                                                                               |
| ------------------------------ | :----: | :-: | --------------------------------------------------------------------------------------------------------------------- |
| Strangler-роутер + canary-gate |   ✅   |  —  | `engine_router`: fail-closed fallback/contract-gate, shadowCompare, danger-budget; **`flags.newEngine=true` default** |
| Timer-ядро (A4)                |   ✅   | ✅  | `useTimerCore` — оба хука тонкие обёртки; все 6 runner'ов на shared `useExerciseShell` (S8 pain/RPE/snapshot/abort)   |
| Персистенция / boot            |   ✅   |  —  | client-scoped (инвариант №9, P0.1) + multi-tab timer-lock (P0.2)                                                      |
| Профиль                        |   ✅   | ✅  | `getProfile`/`saveProfilePatch` + level-capture                                                                       |
| Экспорт                        |   ✅   | ✅  | CSV + debug-JSON (current-client-scoped)                                                                              |

> **Поставка:** ядро тренировочной логики и UI всех 6 doseShape включены через
> **`flags.newEngine=true`** default с fallback на legacy `mix_engine` при
> ошибке/пустом/неконтрактном выходе. Безопасность выверена полностью (P0, gate
> fail-closed, S1–S9, S8 во всех runner'ах). Дальше — доводка hidden live-wiring
> пробелов на живых данных.
>
> **Главный UI-бэклог §6 закрыт:** Today показывает forward-календарь плана
> мезоцикла. _(ввод тест-батареи 8.1 + ретест-напоминания 8.4 + графики
> прогресса 8.6 — ✅ 2026-06-11.)_ **Контент-бэклог:** фото `/exercises/*.webp`
> для не-хватовых упражнений (болдер-мувы, антагонисты, мобильность) — сейчас
> эмодзи-fallback в превью микса. **UI-бэклог:** percentile-UI по Berta deciles;
> RED-S/вес surface закрыт как advisory без назначения веса.

---

## Часть 0 — сводка школ

| ID       | Что                    | Реализация                      | Модуль                     | Фаза |       Заполн.       |
| -------- | ---------------------- | ------------------------------- | -------------------------- | :--: | :-----------------: |
| `part-0` | Авто-сводка долей школ | Не рантайм-фича; dev-инструмент | `tools/school-weights.mjs` |  —   | ✅ (вне приложения) |

## Часть 1 — принципы (становятся инвариантами/валидаторами, не экранами)

| ID    | Что                                                                                                                      | Реализация                                                                                                                                             | Модуль                                                           | Фаза |   Заполн.   |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | :--: | :---------: |
| `1.1` | Специфичность: тег-оси атома (качество/позиция/энергосистема/длительность/темп-RFD); несовместимые цели не в одном блоке | Поля атома `quality,energySystem,doseShape,workSec`(+темп); валидатор «совместимость блоков в сессии» (роль→слот); transfer-связка max→применение      | `quality_catalog`, `validators`, `mix_engine.SLOT_ACCEPT/roleOf` |  1   | ✅ карточка |
| `1.2` | Прогрессивная перегрузка по осям (объём→плотность→edge→вес→скорость)                                                     | Enum осей с рангом безопасности + `progressionPolicy`; `V_progressionOrder` (не прыгать на вес/скорость); `nextProgression` (Ф2, нужна метрика объёма) | `quality_catalog`, `validators`, `periodization_engine`          | 1–2  | ✅ карточка |
| `1.3` | Вариативность / плато                                                                                                    | `detectPlateau` (records) → смена переменной в рамках качества                                                                                         | `records`, `periodization_engine`                                |  2   | ✅ карточка |
| `1.4` | Бей в лимитер (многофакторно)                                                                                            | Профиль из теста → `scoreLimiters` (блокер) → веса приоритетов блоков                                                                                  | `assessment`, `mix_engine`                                       | 0–2  | ✅ карточка |
| `1.5` | Приоритет техники/движения                                                                                               | Уровневое распределение время навык/железо + гард «не одно железо»                                                                                     | `periodization_engine`, `validators`                             | 1–2  | ✅ карточка |
| `1.6` | Восстановление (свежесть/сон/питание)                                                                                    | Модель свежести (=S2, нужна tissue-история); recover-атомы; сон/нутри advisory                                                                         | `readiness`, `records`, `validators`                             | 1–2  | ✅ карточка |
| `1.7` | Минимально-эффективная доза                                                                                              | Границы MEV/MAV per quality + минимальный шаг прогрессии                                                                                               | `mix_engine.applyVolume`, `block_catalog`                        |  1   | ✅ карточка |
| `1.8` | Управление нагрузкой/риском                                                                                              | Индекс к S3/S4/S6/S8 (разминка/объём/антагонисты/боль)                                                                                                 | `validators`, `mix_engine`, `age_gating.painGate`                |  1   | ✅ карточка |

## Часть 2 — модель спортсмена (9 качеств + врезки)

| ID       | Что                                                                                                     | Реализация                                                                                                                                                                                                                                  | Модуль                          | Фаза |   Заполн.   |
| -------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | :--: | :---------: |
| `part-2` | Под-единицы: (а) 9 качеств-осей; (б) врезка вес/RED-S; (в) врезка плечо↔пальцы; (г) женская физиология | (а) `quality_catalog` — 9 осей `quality`; (б) вес → safety-инвариант «не предписываем», см. `9.4`/`S?`; (в) многофакторность → веса в scoring лимитера, см. `8.3`; (г) гендер-нейтрально (всё от теста/относит. силы) — без отд. протоколов | `quality_catalog`, `assessment` |  1   | ✅ карточка |

## Часть 3 — физиология

| ID    | Что                                               | Реализация                                                      | Модуль                        | Фаза |   Заполн.   |
| ----- | ------------------------------------------------- | --------------------------------------------------------------- | ----------------------------- | :--: | :---------: |
| `3.1` | Граница сила/выносливость по времени              | `deriveEnergySystem(workSec)`                                   | `quality_catalog`             |  1   | ✅ карточка |
| `3.2` | Энергосистемы предплечья; интермиттент>continuous | Под-режимы energySystem; дозы D/E (CF-якорь)                    | `block_catalog`               | 1–2  | ✅ карточка |
| `3.3` | Ткани/биомеханика хватов (a2ForceRatio)           | Риск-профиль грипов → danger-budget; doseConfidence 🟡 на ratio | `grips_catalog`, `validators` |  1   | ✅ карточка |

## Часть 4 — каталог воздействий (блоки → block_catalog + пул атомов)

| ID        | Что                                                         | Реализация                                                                                                                                    | Модуль                                         | Фаза |  Заполн.  |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | :--: | :-------: |
| `block-A` | Сила пальцев (max hangs/repeaters/no-hang/density/min-edge) | Атомы пула `fs_*` как данные block_catalog; пример `fs_maxhang_20mm_half`={doseShape:hang, loadModel:rm_margin}; гейты minLevel/minAge/danger | `block_catalog`, `grips_catalog`, `mix_engine` |  1   |    ✅     |
| `block-B` | Макс. сила тела (лимит-болдер/тяги/доска)                   | Атомы `str_*`; modality board/weights                                                                                                         | `block_catalog`                                | 1–2  | ✅ группа |
| `block-C` | Мощность/контакт/RFD                                        | Атомы `pow_*` (вкл. `pow_rfd_pulls`); doseShape attempts                                                                                      | `block_catalog`                                |  2   | ✅ группа |
| `block-D` | Анаэробная ёмкость                                          | Атомы `pe_*`; doseShape circuit; якорь CF                                                                                                     | `block_catalog`                                |  2   | ✅ группа |
| `block-E` | Аэробная база (ARC/CF/BFR)                                  | Атомы `aer_*`; continuous; CF-якорь                                                                                                           | `block_catalog`                                |  2   | ✅ группа |
| `block-F` | Техника (drills/CLA/variety)                                | Атомы `tech_*`; modality drill/wall; не дозируется нагрузкой                                                                                  | `block_catalog`                                |  2   | ✅ группа |
| `block-G` | Антагонисты/прехаб                                          | Атомы `ant_*`; doseShape reps; 🟠 профилактика                                                                                                | `block_catalog`                                |  1   | ✅ группа |
| `block-H` | Мобильность/разминка                                        | Атомы `mob_*`; warmup как процедура сессии                                                                                                    | `block_catalog`, `warmup_runner`               |  1   | ✅ группа |
| `block-I` | Ментальное/тактика                                          | Атомы `mental_*`; doseShape process (чек-лист)                                                                                                | `block_catalog`                                |  2   | ✅ группа |

## Часть 5 — протоколы (числа; источник истины — пул)

| ID    | Что                             | Реализация                                     | Модуль                        | Фаза |             Заполн.              |
| ----- | ------------------------------- | ---------------------------------------------- | ----------------------------- | :--: | :------------------------------: |
| `5.0` | Логика пула (оси классификации) | Схема атома §1.2; машинная загрузка пула       | `block_catalog`               |  0   | ✅ группа (блокер: machine-load) |
| `5.1` | Сила пальцев — числа            | Данные `fs_*` + transfer-функция rm_margin→вес | `block_catalog`, `assessment` | 0–1  |     ✅ группа (блокер: доза)     |
| `5.2` | Макс. сила тела — числа         | Данные `str_*`                                 | `block_catalog`               |  1   |            ✅ группа             |
| `5.3` | Мощность/RFD — числа            | Данные `pow_*`                                 | `block_catalog`               |  2   |            ✅ группа             |
| `5.4` | Анаэробная ёмкость — числа      | Данные `pe_*`                                  | `block_catalog`               |  2   |            ✅ группа             |
| `5.5` | Аэробная база — числа           | Данные `aer_*`                                 | `block_catalog`               |  2   |            ✅ группа             |
| `5.6` | Антагонисты — числа             | Данные `ant_*`                                 | `block_catalog`               |  1   |            ✅ группа             |
| `5.7` | Разминка                        | Процедура ramp-up                              | `warmup_runner`               |  1   |          ✅ (есть база)          |
| `5.8` | Карта подраздел→протоколы       | Линковка doc-level (не код)                    | —                             |  —   |             ✅ (doc)             |

## Часть 6 — периодизация

| ID    | Что                                           | Реализация                             | Модуль                 | Фаза |          Заполн.          |
| ----- | --------------------------------------------- | -------------------------------------- | ---------------------- | :--: | :-----------------------: |
| `6.1` | Линейная (Anderson)                           | Генератор макро/мезо линейной модели   | `periodization_engine` |  2   |        ✅ карточка        |
| `6.2` | Нелинейная (Bechtel)                          | Параметрический шаблон ротации         | `periodization_engine` |  2   | ✅ карточка (нет шаблона) |
| `6.3` | DUP (Hörst) + последовательность энергосистем | Недельный undulating-шаблон            | `periodization_engine` |  2   |        ✅ карточка        |
| `6.4` | Выбор модели (формат×лимитер)                 | Правило `selectModel(формат, лимитер)` | `periodization_engine` |  2   |        ✅ карточка        |
| `6.5` | Тейперинг                                     | Микроцикл `taper` (объём↓, интенс=)    | `periodization_engine` |  2   |        ✅ карточка        |
| `6.6` | Maintenance/in-season                         | Микроцикл `maintenance` (≤1×/нед)      | `periodization_engine` |  2   |        ✅ карточка        |

## Часть 7 — прогрессия по уровням

| ID    | Что                 | Реализация                                          | Модуль                     | Фаза |  Заполн.  |
| ----- | ------------------- | --------------------------------------------------- | -------------------------- | :--: | :-------: |
| `7.1` | Новичок             | Уровневые гейты блоков (`profile.level`+`minLevel`) | `validators`, `age_gating` |  1   | ✅ группа |
| `7.2` | Ранний средний      | То же                                               | `validators`               |  1   | ✅ группа |
| `7.3` | Средний/продвинутый | То же                                               | `validators`               |  1   | ✅ группа |
| `7.4` | Элита               | То же                                               | `validators`               |  1   | ✅ группа |

## Часть 8 — тестирование

| ID    | Что                                                        | Реализация                                                            | Модуль                                 | Фаза |       Заполн.        |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | :--: | :------------------: |
| `8.1` | Батарея (IRCRA: finger-hang/powerslap/pull/CF/мобильность) | Тест-раннеры + хранение результатов; нормировка %bw; CF 4-мин all-out | `assessment`, `calibration`, `records` |  1   |          ✅          |
| `8.2` | Бенчмарки/предикторы по уровням                            | Berta 2025 Table 3 runtime targets → интерпретация теста              | `assessment`                           | 0–1  |     ✅ карточка      |
| `8.3` | Аудит лимитера (MacLeod)                                   | Scoring лимитера: отклонения тестов + флаги → ведущий лимитер         | `assessment`                           | 0–2  | ✅ карточка (блокер) |
| `8.4` | Частота тестирования                                       | Напоминание на границе мезо                                           | `calendar`, `periodization_engine`     |  2   |     ✅ карточка      |
| `8.5` | Опц. мониторинг (ACWR/HRV)                                 | Мягкие сигналы readiness, не гейт                                     | `readiness`                            |  2   |  ✅ карточка (опц.)  |

## Часть 9 — безопасность (валидаторы S1–S8 + подразделы)

| ID    | Что                                   | Реализация                                                     | Модуль                                            | Фаза |               Заполн.                |
| ----- | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | :--: | :----------------------------------: |
| `9.1` | Почему критично                       | Рамка (не код)                                                 | —                                                 |  —   |               ✅ (doc)               |
| `9.2` | Правила→валидаторы (таблица S1–S8)    | Модуль валидаторов + safety-тесты                              | `validators`, `TESTS/heys_fingers_safety.test.js` |  1   |             ✅ карточка              |
| `9.3` | Возраст/зоны роста                    | age-gating по minAge, fail-closed                              | `age_gating`                                      |  1   |       ✅ карточка (есть база)        |
| `9.4` | Вес/RED-S                             | Инвариант «не предписываем вес» (отсутствие фичи) + дисклеймер | (нет модуля — инвариант)                          |  1   |             ✅ карточка              |
| `9.5` | Реабилитация/red flags                | Ветка `rehab` со строгими гейтами; pain-gate                   | `validators`, `age_gating.painGate`               |  2   |             ✅ карточка              |
| `9.6` | Дисклеймер                            | UI-текст                                                       | `onboarding`/UI                                   |  1   |             ✅ карточка              |
| `S1`  | Уровень/возраст-гейт (fail-closed)    | `atom.minLevel/minAge` фильтр; нет возраста→блок               | `age_gating.filterExercises`                      |  1   |                  ✅                  |
| `S2`  | Свежесть пальцев 48/72ч               | `fingerTissueLog`/history + `gripGroup` → блок high/max        | `validators`, `records`                           | 1–2  |                  ✅                  |
| `S3`  | Разминка обязательна                  | сессия без `warmup_done` → invalid                             | `validators`, `warmup_runner`                     |  1   |             ✅ карточка              |
| `S4`  | Рост объёма ≤10%/нед                  | метрика объёма + сравнение недель                              | `validators`                                      | 0–1  | ✅ карточка (блокер: метрика объёма) |
| `S5`  | Открытый хват база, замок дозированно | приоритет грипа по уровню; danger-budget                       | `mix_engine`, `grips_catalog`                     |  1   |       ✅ карточка (есть база)        |
| `S6`  | Баланс антагонистов                   | нет antagonist-блока при тяжёлых тягах → warn                  | `mix_engine`                                      |  1   |       ✅ карточка (есть база)        |
| `S7`  | Deload обязателен                     | мезо без разгрузки → warn                                      | `periodization_engine`                            |  2   |             ✅ карточка              |
| `S8`  | Боль ≠ нагрузка                       | флаг боли → стоп прогрессии, rehab                             | `age_gating.painGate`, `validators`               |  1   |       ✅ карточка (есть база)        |

## Часть 10 — источники

| ID        | Что                               | Реализация                                                           | Модуль         | Фаза |         Заполн.         |
| --------- | --------------------------------- | -------------------------------------------------------------------- | -------------- | :--: | :---------------------: |
| `part-10` | Реестр источников/доказательность | `bibliography` модуль (sourceId→ссылка); doseConfidence у протоколов | `bibliography` |  1   | ✅ карточка (есть база) |

---

# Пул открытых вопросов

Единый реестр всех «вопросов для уточнения» из карточек. **Канонический статус и
решение — здесь** (в карточках вопросы дублируются коротко со ссылкой на ID). По
мере развития плана приводим к решениям: статус 🔵 open → ✅ решено (+ запись
решения и дата). ID: `Q-<единица>-<n>`. «К кому»: 🧩 дизайн/архитектура · 🙋
продукт/пользователь · 🗄 данные.

Чекер [`tools/impl-coverage.mjs`](tools/impl-coverage.mjs) сверяет, что каждый
`Q-*` из карточек есть в этом пуле и наоборот (без осиротевших).

| ID        | Вопрос                                                                                                           | К кому | Карточка |  Статус   | Решение                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------- | :----: | :------: | :-------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Q-1.1-1` | Темп/RFD как поле: явный `emphasis: max\|rfd\|capacity` или вывод из `quality+doseShape+workSec`?                |   🧩   |   1.1    | ✅ решено | явный `emphasis` (3 значения). 2026-06-08                                                                                                                                                                                                                  |
| `Q-1.1-2` | `V_blockHomogeneity` — warn или hard-fail при несовместимости?                                                   |   🧩   |   1.1    | ✅ решено | warn (не fatal). 2026-06-08                                                                                                                                                                                                                                |
| `Q-1.1-3` | Словарь оси «позиция» для стены (угол/тип зацепа) — какой набор значений?                                        |   🧩   |   1.1    | ✅ решено | отложено в Фазу 2 (для фингерборда хватает gripId/edge). 2026-06-08                                                                                                                                                                                        |
| `Q-1.2-1` | Формула «объёма пальцевой нагрузки» (общий блокер READINESS — нужен для S4/deload/maintenance)                   |  🧩🗄  |   1.2    | ✅ решено | **FTL** = Σ(TUT_sec×intensityW×tissueW), по doseShape; см. CONSTRUCTOR_SPEC §3.1 (🟠 прокси). 2026-06-08                                                                                                                                                   |
| `Q-1.2-2` | Прогрессия: авто-предложение следующего шага или ручной выбор оси с подсказкой?                                  |   🙋   |   1.2    | ✅ решено | гибрид по уровню: новичкам авто (подтверждение), продвинутым ручной+подсказки. 2026-06-08                                                                                                                                                                  |
| `Q-1.2-3` | Критерий «ось прогрессии исчерпана» (плато по records / число недель)?                                           |   🧩   |   1.2    | ✅ решено | плато по records (нет прироста 2–3 сессии) ИЛИ достигнут MAV-кап. 2026-06-08                                                                                                                                                                               |
| `Q-1.2-4` | Поле «текстура зацепа» для оси edge — вводить или Фаза 2?                                                        |   🗄   |   1.2    | ✅ решено | Фаза 2 (пока edge=edgeSizeMm). 2026-06-08                                                                                                                                                                                                                  |
| `Q-1.3-1` | Порог «плато» (сколько сессий/недель без прироста → сменить переменную)?                                         |   🧩   |   1.3    | ✅ решено | дефолт: 2–3 нед / 3+ сессии без прироста (tunable). 2026-06-08                                                                                                                                                                                             |
| `Q-1.3-2` | Смена переменной при плато — авто или подсказка пользователю?                                                    |   🙋   |   1.3    | ✅ решено | как Q-1.2-2: гибрид по уровню. 2026-06-08                                                                                                                                                                                                                  |
| `Q-1.4-1` | Формула scoring лимитера: отклонения тестов + навыковые флаги → ведущий лимитер + веса блоков (БЛОКЕР READINESS) |   🧩   |   1.4    | ✅ решено | структура в CONSTRUCTOR_SPEC §3.2 (deficit×levelPrior); числа бенчмарков — в Q-8-1. 2026-06-08                                                                                                                                                             |
| `Q-1.4-2` | Как собирать навыковые/тактические флаги (самооценка / коуч / видео-анализ)?                                     |  🙋🗄  |   1.4    | ✅ решено | оба: самооценка по чек-листу (дефолт, соло) + коуч-режим (куратор ставит/правит флаги на curator-сессиях HEYS). Видео — позже. 2026-06-08                                                                                                                  |
| `Q-1.4-3` | Один ведущий лимитер на мезо или взвешенный микс приоритетов?                                                    |   🧩   |   1.4    | ✅ решено | гибрид: ведущий=фокус (develop), остальные=maintain по весам (§3.2). 2026-06-08                                                                                                                                                                            |
| `Q-1.5-1` | Конкретные доли времени «навык/лазание vs железо» по 4 уровням?                                                  |  🧩🙋  |   1.5    | ✅ решено | дефолты в §3.8 (новичок 80–90/10–20 … элита 70–80/20–30); опора — Lattice/Berta/IRCRA как ориентиры, доли — экспертный синтез, не доказанный норматив. 2026-06-09                                                                                          |
| `Q-1.5-2` | Как мерить «навыковый объём» (техника не дозируется нагрузкой)?                                                  |   🧩   |   1.5    | ✅ решено | по времени/числу сессий в блоках `quality:technique` (тег), не по нагрузке. 2026-06-08                                                                                                                                                                     |
| `Q-1.6-1` | Где хранить per-grip/tissue историю нагрузки для свежести S2 (dayv2/fingersLog)? (БЛОКЕР интеграции)             |   🗄   |   1.6    | ✅ решено | `fingerTissueLog` client-scoped (§3.3), агрегат FTL по gripGroup. 2026-06-08                                                                                                                                                                               |
| `Q-1.6-2` | Окно свежести 48 vs 72 ч — от чего зависит (intensity/tissueLoad)?                                               |   🧩   |   1.6    | ✅ решено | 48ч для high, 72ч для max tissueLoad той же `gripGroup`; legacy-история без группы блокирует консервативно. 2026-06-09                                                                                                                                     |
| `Q-1.7-1` | Числа MEV/MAV (мин/макс объём) по качествам и уровням?                                                           |  🧩🗄  |   1.7    | ✅ решено | §3.7: MEV=2×3–5 подходов/нед (~30–100с под нагрузкой); потолок 3–5/сессия; ≥48ч, ≥3 дня отдыха. Прямых MEV/MAV пальцев нет → 🟡/🟠 из RCT-доз. 2026-06-08                                                                                                  |
| `Q-1.7-2` | Как параметризовать «потолок объёма по травме» для пальцев (cap по tissueLoad)?                                  |   🧩   |   1.7    | ✅ решено | cap = верхняя граница недельного FTL (§3.1), вес по tissueLoad-tier; tunable. 2026-06-08                                                                                                                                                                   |
| `Q-3.3-1` | «Текстура зацепа» в риск-профиль хватов — вводить поле? (связь Q-1.2-4)                                          |   🗄   |   3.3    | ✅ решено | Фаза 2 (вместе с Q-1.2-4). 2026-06-08                                                                                                                                                                                                                      |
| `Q-4-1`   | Тактика `doseShape:'process'` — отдельная сущность или атом с чек-листом?                                        |   🧩   | block-I  | ✅ решено | атом с `checklist[]` (единый пул/гейты). 2026-06-08                                                                                                                                                                                                        |
| `Q-5-1`   | Формулы «тест→доза» по `loadModel` (rm_margin→вес, grade→грейд, CF→число) — БЛОКЕР                               |   🧩   |   5.1    | ✅ решено | §3.6: rm_margin≈95.8% 10с-макс (🟢); CF=41%MVC (🟢); %MVC-7↔время (🟠); repeaters 60–80%MVC (🟡); grade-loading (🟠). + per-athlete калибровка. 2026-06-08                                                                                                |
| `Q-5-2`   | Параметры machine-load пула (sentinel-семантика, prerequisites_catalog)                                          |   🗄   |   5.0    | ✅ решено | контракт machine-load + `prerequisites_catalog` в CONSTRUCTOR_SPEC §3.4. 2026-06-08                                                                                                                                                                        |
| `Q-6-1`   | Параметрические шаблоны ротации для nonlinear/DUP периодизации                                                   |   🧩   |   6.2    | ✅ решено | отложено в Фазу 2 (проектируем при движке периодизации). 2026-06-08                                                                                                                                                                                        |
| `Q-6-2`   | Где/как хранить план макро/мезо (client-scoped, инвариант #9)                                                    |   🗄   |   6.6    | ✅ решено | client-scoped store (как `fingerTissueLog`, §3.3). 2026-06-08                                                                                                                                                                                              |
| `Q-7-1`   | Как присваивается `profile.level` (тест / грейд / самооценка)?                                                   |  🧩🙋  |   7.1    | ✅ решено | гибрид: грейд/опыт (ввод) + тест-коррекция; safety-гейты — по трен-возрасту ткани, не только грейду. 2026-06-08                                                                                                                                            |
| `Q-8-1`   | Числовые бенчмарки силы/CF по 4 уровням (источник Lattice/IRCRA/Berta) — БЛОКЕР                                  |  🧩🗄  |   8.2    | ✅ решено | §3.5: runtime targets = Berta 2025 Table 3 sex-neutral weighted means: intermediate 70% BW, advanced 87% BW, elite 102% BW; новичок=нет данных; CF по уровням в источниках нет. Decile Tables S2–S5 — будущая percentile-UI, не блокер scoring. 2026-06-12 |
| `Q-8-2`   | CF/тензометр обязателен или нужен fallback-тест без Tindeq?                                                      |   🙋   |   8.1    | ✅ решено | всегда есть fallback без Tindeq (max-hang добавочный вес + repeaters-to-failure); CF — опц. апгрейд. 2026-06-08                                                                                                                                            |
| `Q-9-1`   | Формат флага боли в логе сессии (вход S8)                                                                        |   🗄   |   9.5    | ✅ решено | enum {none, twinge, pain} × локация {finger/joint/elbow/shoulder}; pain→стоп. 2026-06-08                                                                                                                                                                   |

---

# Детальные карточки реализации

Развёрнутая «схема реализации» по единице. Индекс выше — сводка; карточка —
рабочий разбор: данные → валидаторы → код → тесты → открытые вопросы. Пишутся
проходами; в таблице такая единица помечается ✅ (карточка). **Открытые вопросы
в карточке — это ссылки на `Q-*` из пула выше** (канон — пул).

## Карточка 1.1 — Специфичность

**Методология §1.1:** адаптация специфична к стимулу; блок несёт теги
`качество / позиция / энергосистема / длительность / темп(RFD)`; нельзя
смешивать в одном блоке цели с разными режимами восстановления; энергосистемная
ось Hörst — сквозная; мостик «сырая сила → приложение в движении».

Три механизма в коде:

### M1 — тег-оси атома (данные, Фаза 1)

- Поля атома: `quality` (enum 9), `energySystem`
  (`phosphagen|glycolytic|aerobic|null`), `doseShape`, `workSec`; для пальцев —
  `gripId`+`edgeSizeMm` (= ось «позиция»).
- **Темп/RFD — решение:** не выводить эвристикой, а ввести явный
  `emphasis: 'max' | 'rfd' | 'capacity'` на атоме. Тогда «взрывной pull <5 с» =
  `emphasis:'rfd'`, медленный max-hang = `emphasis:'max'` — кодирует «как
  быстро» напрямую (open Q ниже).
- `energySystem` выводим из `workSec` детерминированно (≤12 с→phosphagen;
  12–180→glycolytic; >180/восстановление→aerobic) — функция
  `deriveEnergySystem(workSec)`. Дальше `energySystem` **задаёт дозу и отдых** —
  это реализуется в `block_catalog` /протоколах (5.x), здесь только источник оси
  (чтобы вклад не выглядел потерянным).
- Ось «позиция» для не-фингерборда (угол стены/тип зацепа) — словаря нет →
  Фаза 2.

### M2 — валидаторы совместимости (Фаза 1)

- `V_blockHomogeneity(block)`: атомы блока совместимы по **двум осям** (как в
  1.1 — «разные режимы восстановления»): (1) одно `quality` и (2) близкие
  `fatigueCost`/`tissueLoad`. Исключения — явно совместимые пары
  (техника+мобильность, оба low). Несовпадение → **warn** (не fatal). Вход:
  `block.exercises[].{quality, fatigueCost, tissueLoad}`.
- `V_sessionOrder(session)`: порядок блоков по убыванию нейро-требовательности —
  навык/мощность/сила (phosphagen) → ёмкость (glycolytic/aerobic) →
  антагонисты/мобильность. Реализует «не мешать режимы восстановления».
  Нарушение → предложить reorder / warn.
- **Существующий код:** `mix_engine` уже держит SLOT-шаблон
  power→max→endurance→antagonist и `roleOf` — расширить `roleOf` читать
  `atom.quality`, `SLOT_ACCEPT` под 9 качеств; правило порядка вынести в
  тестируемый `validators.sessionOrder`.

### M3 — правило переноса (transfer-sequencing) ✅ 2026-06-11

- В сессии блок «сырой силы» (`finger_strength`/`max_strength` на fingerboard)
  сопровождается блоком «применения» в движении (`max_strength`/`power` на
  board/wall) — сила переносится в результат только через специфичное движение.
- **Реализация:** `session_builder` — additive-floor (по образцу antagonist):
  если сессия (bucket max/moderate) содержит фингерборд-силу, но НЕ содержит
  application-атома на board/wall — добирается один такой атом через `_atomFits`
  (S1/S9/equipment/level/renderable) + дедуп grip+edge, роль `transfer`.
  **Fail-safe:** нет board/wall в снаряжении → атом не fit'ится → мостик не
  навязывается. Тесты — блок «§1.1 M3» в `fingers-session-builder.test.js`.

**Тесты:**

- блок mixed-quality → `V_blockHomogeneity` флаг;
- сессия `[power-endurance, затем technique]` → `V_sessionOrder` reorder/warn;
- `deriveEnergySystem(5)=phosphagen`, `(30)=glycolytic`, `(1800)=aerobic`;
- `emphasis:'rfd'`/workSec=5 и `emphasis:'max'`/workSec=10 → разные роли в
  `roleOf`.

**Модули:** `quality_catalog` (enum+derive), `validators` (homogeneity/order),
`mix_engine` (roleOf/SLOT_ACCEPT), `session_builder` (M3 transfer-floor ✅).
**Фаза:** 1 — M1+M2; 2 — M3 ✅; ось «позиция» — осталось.

**Открытые вопросы** (канон — в пуле выше):

- `Q-1.1-1` — темп/RFD: явный `emphasis` vs вывод (реком. явный).
- `Q-1.1-2` — `V_blockHomogeneity`: warn vs hard-fail (реком. warn).
- `Q-1.1-3` — словарь оси «позиция» для стены (Фаза 2).

## Карточка 1.2 — Прогрессивная перегрузка

**Методология §1.2:** без роста стимула нет адаптации, но перегрузка идёт **не
только через вес**. Оси прогрессии по убыванию безопасности: ① объём (повторы/
подходы) → ② плотность (↓ отдых) → ③ зацеп меньше/хуже (edge↓, текстура) → ④
добавочный вес / меньше разгрузки → ⑤ скорость/динамика. Конструктор предлагает
прогрессию **в этом порядке**, а не сразу вес.

Три механизма в коде:

### M1 — модель осей прогрессии (данные, Фаза 1)

- Enum `progressionAxis` с **рангом безопасности**:
  `volume(1) < density(2) < edge(3) < load(4) < speed(5)`.
- `progressionPolicy` на блоке/качестве: упорядоченный список применимых осей
  (напр. сила пальцев: volume→edge→load; ёмкость: volume→density; мощность:
  …→speed).
- Маппинг осей на поля атома: volume=`sets/reps`, density=`restSec/restSetsSec`,
  edge=`edgeSizeMm`(+текстура — поля нет → Q), load=`loadValue`,
  speed=`emphasis:'rfd'`/темп.

### M2 — движок прогрессии (Фаза 2, нужен объём-метрика)

- `nextProgression(block, history)` → следующий шаг по **наименее рискованной не
  исчерпанной оси**, в рамках S4 (рост high-intensity объёма ≤10%/нед) и
  свежести (1.6/S2). «Ось исчерпана» → переходим к следующей по рангу.
- Опирается на метрику «объём пальцевой нагрузки» (общий блокер, см. `Q-1.2-1`)
  и `records` (плато).

### M3 — гард прогрессии (валидатор, Фаза 1)

- `V_progressionOrder`: запрет «перепрыгнуть» на load/speed, минуя
  volume/density, если те не исчерпаны → warn. Speed/edge-минимум также гейтятся
  уровнем (S1, 7.x).
- Связь с S4 (недельный кап объёма) — общий код метрики объёма.

**Существующий код:** `mix_engine.doseExercise` (инкремент %MVC) + `applyVolume`
(MAV-кап, recovery-trim) — частичная сессионная прогрессия по load/volume; нет
**межсессионной** прогрессии по упорядоченным осям и нет недельного
объём-трекинга.

**Тесты:**

- `nextProgression` предлагает volume раньше load при прочих равных;
- скачок на `load` при не исчерпанном `volume` → `V_progressionOrder` warn;
- недельный рост high-intensity объёма >10% → флаг (S4);
- `speed`-ось недоступна ниже порога уровня.

**Модули:** `quality_catalog`/`block_catalog` (axis enum+policy), `validators`
(progressionOrder), `periodization_engine` (nextProgression), общий
`volume`-расчёт. **Фаза:** 1 — enum осей + `V_progressionOrder`; 2 —
`nextProgression` (после метрики объёма).

**Открытые вопросы** (канон — в пуле выше):

- `Q-1.2-1` — формула «объёма пальцевой нагрузки» (общий блокер READINESS).
- `Q-1.2-2` — авто-предложение следующего шага vs ручной выбор оси с подсказкой.
- `Q-1.2-3` — критерий «ось исчерпана» (плато по records / число недель?).
- `Q-1.2-4` — поле «текстура зацепа» для оси edge — вводить или Фаза 2.

## Карточка 1.3 — Вариативность / предотвращение плато

**Методология §1.3:** один стимул выдыхается за 4–8 нед; менять **переменную**
(хват/edge/темп/протокол), сохраняя **качество-цель**; «держись протокола, пока
даёт прирост; меняй, когда встал — не по календарю».

### M1 — детектор плато (Фаза 2)

- `detectPlateau(block, records)`: нет прироста ключевой метрики блока N сессий/
  недель → флаг «сменить переменную» (порог — `Q-1.3-1`).

### M2 — смена переменной (Фаза 2)

- При плато менять переменную в рамках того же `quality` (другой хват/edge/темп/
  протокол), не качество. Технически = шаг по `progressionAxis` (1.2) или
  ротация параметров атома; качество и `energySystem` неизменны.

**Существующий код:** `records`/`calibration` хранят результаты — основа
детектора. **Модули:** `records`, `periodization_engine`. **Фаза:** 2 (после
records-трекинга). **Открытые вопросы** (пул выше): `Q-1.3-1` порог плато;
`Q-1.3-2` авто-смена vs подсказка.

## Карточка 1.4 — Индивидуализация: бей в лимитер

**Методология §1.4:** тренировать личный лимитер, не любимое; аудит лимитера
(8.3); лимитер мигрирует; детерминанты многофакторны (не только пальцы). **Ядро
индивидуализации** — и главный алгоритм-блокер (см. READINESS).

### M1 — профиль качеств из теста (Фаза 1)

- `assessment` строит профиль: результаты батареи (8.1) → отклонения от
  бенчмарков по уровню (8.2) по каждому качеству.

### M2 — scoring лимитера (Фаза 0 — БЛОКЕР)

- `scoreLimiters(profile, skillFlags)` → веса приоритетов блоков: вход =
  отклонения тестов + чек-лист навыковых/тактических маркеров (8.3, которые
  тестом не ловятся) → один ведущий лимитер + веса. Формула — `Q-1.4-1`.

### M3 — приоритизация в генераторе (Фаза 1–2)

- Веса лимитера поднимают соответствующие блоки при сборке (валидатор §1.6.8 /
  goal-ось `mix_engine`). Переоценка раз в мезо (лимитер мигрирует).

**Существующий код:** `mix_engine` goal-ось — частичная приоритизация по цели.
**Модули:** `assessment` (scoring), `mix_engine` (приоритеты). **Фаза:** 0
(формула) → 1–2. **Открытые вопросы** (пул): `Q-1.4-1` формула scoring [блокер];
`Q-1.4-2` сбор навыковых флагов (самооценка/коуч/видео); `Q-1.4-3` один ведущий
лимитер vs взвешенный микс на мезо.

## Карточка 1.5 — Приоритет техники и движения

**Методология §1.5:** навыковый спорт; до ~7a/V5 приоритет часто у техники/
тактики и разнообразия лазания, но точную долю не фиксируем как доказанный
норматив; не вытеснять объём качественного лазания; transfer (1.1).

### M1 — уровневое распределение времени (Фаза 1–2)

- Дефолт-доли «навык/лазание vs железо» по уровню (новичок → перевес навыка),
  опираясь на Lattice-предикторы (8.2). Параметр генератора недели.

### M2 — гард «не одно железо» (валидатор, Фаза 1)

- На низком уровне сессия/неделя из чистого фингерборда без навыкового объёма →
  warn (techника недонабрана). Гейты железа по уровню — S1/7.x.

**Существующий код:** нет уровневого распределения времени (greenfield).
**Модули:** `periodization_engine` (доли), `validators`. **Фаза:** 1 (гард) → 2
(распределение). **Открытые вопросы** (пул): `Q-1.5-1` конкретные доли по 4
уровням; `Q-1.5-2` как мерить «навыковый объём» (он не дозируется нагрузкой).

## Карточка 1.6 — Восстановление как часть нагрузки

**Методология §1.6:** 48 ч для `high`, 72 ч для `max` на ту же `gripGroup`;
ткань восстанавливается медленнее мышц; ARC — быстро (актив-восстановление);
сон + питание ткани; конструктор моделирует свежесть и блокирует конфликтующие
тяжёлые пальцевые подряд. Несущая реализация — **валидатор S2** (свежесть).

### M1 — модель свежести (Фаза 1–2 = S2)

- Состояние восстановления по группам/ткани из истории; гейт 48/72 ч для
  `tissueLoad∈{high,max}` по `gripGroup`. `S2_tissueFreshness` поддерживает
  `fingerTissueLog`/history и legacy-записи без группы.

### M2 — восстановительные атомы

- ARC/активное восстановление как `targetStimulus:'recover'` (низкий
  `tissueLoad`), можно ставить чаще.

### M3 — advisory сон/питание

- Сон и нутри-вход (3.3 Baar) — мягкие подсказки/чек, не гейты.

**Существующий код:** `validators.S2_tissueFreshness` (48/72 + `gripGroup`),
`tissueHistory` (client-scoped live history), `engine_router` enrichment и
builder candidate-filter; legacy `readiness.assess` остаётся session-level
сигналом. **Модули:** `validators`, `tissueHistory`, `readiness`,
`session_builder`, `engine_router`. **Фаза:** 1–2. **Открытые вопросы** закрыты
в пуле: `Q-1.6-1`/`Q-1.6-2`.

## Карточка 1.7 — Минимально-эффективная доза

**Методология §1.7:** минимальный стимул, который ещё вызывает адаптацию, при
макс. свежести и мин. риске; «потолок объёма» по травме у пальцев ниже, чем по
мышцам.

### M1 — границы MEV/MAV (Фаза 1)

- На качество/уровень: `minEffectiveVolume` и `maxAdaptiveVolume` (для пальцев
  MAV ограничен травмой, не силой). Reuse `mix_engine.applyVolume` (MAV-кап уже
  есть) — расширить нижней границей MEV.

### M2 — минимальный шаг прогрессии

- Связка с 1.2 `nextProgression`: выбирать **наименьший** шаг, дающий прирост, а
  не максимальный (сохранить свежесть/риск).

**Существующий код:** `mix_engine.applyVolume` (MAV-кап, recovery-trim).
**Модули:** `mix_engine`, `block_catalog` (MEV/MAV per quality). **Фаза:** 1.
**Открытые вопросы** (пул): `Q-1.7-1` числа MEV/MAV по качествам/уровням;
`Q-1.7-2` как параметризовать «потолок по травме» (cap по `tissueLoad`).

## Карточка 1.8 — Управление нагрузкой и риском

**Методология §1.8:** >40% травм — пальцы; рост недельного объёма ≤~10%; полная
разминка (🟠); антагонисты обязательны (механизм 🟡 / профилактика 🟠); боль =
стоп. Это **индекс к safety-валидаторам части 9** — карточка их связывает,
детали в S-строках.

- **≤10%/нед** → `S4` (нужна метрика объёма, общая с `Q-1.2-1`).
- **Разминка** → `S3` (`warmup_done`-гейт, как предосторожность).
- **Антагонисты** → `S6` (warn, если нет antagonist-блока при тяжёлых тягах).
- **Боль = стоп** → `S8` (`age_gating.painGate` → стоп прогрессии / ветка
  rehab).
- **Танево-консервативная прогрессия пальцев** → пересечение с 1.2/1.6/S2.

**Модули:** `validators` (S3/S4/S6/S8), `mix_engine`, `age_gating.painGate`.
**Фаза:** 1 (S3/S6/S8 — базы есть в коде), S4 — после метрики объёма. **Открытые
вопросы:** общий `Q-1.2-1` (метрика объёма для правила 10%); прочее — в
S-строках.

## Карточка part-2 — модель спортсмена (9 качеств + врезки)

**Методология ч.2:** результат = функция 9 качеств (оси); врезки: вес/RED-S
(инвариант), плечо↔пальцы (открытое расхождение), женская физиология.

- **9 качеств → `quality_catalog`** (enum осей): finger_strength, max_strength,
  power, anaerobic_capacity, aerobic_base, technique, antagonist, mobility,
  mental. Каждое — справочник {id, описание, energySystem-связь, дефолт
  fatigueCost}.
- **Вес/RED-S** → НЕ фича, а **инвариант** (приложение не предписывает вес) —
  реализуется отсутствием функции + дисклеймером (см. `9.4`).
- **Плечо↔пальцы** → многофакторность входит в `scoreLimiters` (см.
  `1.4`/`8.3`): плечо/тяга — полноценный детерминант, не только пальцы.
- **Женская физиология** → гендер-нейтрально: всё от теста/относит. силы;
  отдельных протоколов нет; цикл — индивидуализация (advisory).

**Модули:** `quality_catalog`, `assessment`. **Фаза:** 1. **Вопросы:** — (вес —
инвариант, не вопрос; scoring — в `Q-1.4-1`).

## Карточки 3.1–3.3 — физиология (обоснование, → справочники/функции)

Физиология сама по себе не «экран», а **обоснование чисел и связей**, которые
кодируются справочниками и derive-функциями.

### 3.1 — граница сила/выносливость по времени усилия

- `deriveEnergySystem(workSec)` (та же, что в 1.1): ≤12с→phosphagen; 12–180→
  glycolytic; >180→aerobic. Граница задаёт, что протокол ≤12с = «сила», иначе
  выносливость. Модуль: `quality_catalog`. Фаза 1.

### 3.2 — три энергосистемы предплечья; интермиттент>continuous

- `energySystem` с под-режимами (alactic/lactic/aerobic-capacity/aerobic-power);
  правило дозы D/E: интермиттентные форматы предпочтительнее непрерывных для
  ёмкости (Fryer/Baláš). Дозы — в `block_catalog`/5.x; CF-якорь — `8.1`. Модуль:
  `block_catalog`. Фаза 1–2.

### 3.3 — ткани/биомеханика хватов (риск-профиль)

- `grips_catalog` несёт `a2ForceRatio`/`dangerLevel`/`minAge`/`sourceIds` →
  питает **danger-budget** (`mix_engine.DANGER_BUDGET`) и гейты замка/edge
  (S1/S5). `a2ForceRatio` помечается `doseConfidence` 🟡 (модельная величина).
  Источник — `schweizer2001`+`vigouroux2006` (фикс сделан). Модуль:
  `grips_catalog`, `validators`. Фаза 1. **Вопрос:** `Q-3.3-1` — «текстура
  зацепа» в риск-профиль (связан с `Q-1.2-4`).

## Карточки block-A … block-I — каталог воздействий (групповая)

**Однородный паттерн** (поэтому групповая карточка): каждый блок каталога =
класс **атомов-данных** в `block_catalog`, размеченных по осям 5.0; гейты
берутся из полей атома (`minLevel/minAge/dangerLevel/prerequisites`), числа — из
пула; подбор в сессию — `mix_engine` по `quality`/слотам.

Реализация одинаковая для всех блоков, отличаются `modality`/`doseShape`/риск:

| Блок                 | Атомы (префикс) | modality         | doseShape           | примечание                                           |
| -------------------- | --------------- | ---------------- | ------------------- | ---------------------------------------------------- |
| A сила пальцев       | `fs_*`          | fingerboard      | hang                | гейты замка/edge (S1/S5), tissue high                |
| B макс. сила тела    | `str_*`         | board/weights    | attempts/reps       | —                                                    |
| C мощность/RFD       | `pow_*`         | board/campus     | attempts            | RFD=`emphasis:'rfd'` (1.1); кампус very-high danger  |
| D анаэробная ёмкость | `pe_*`          | wall             | circuit             | якорь CF (выше CF)                                   |
| E аэробная база      | `aer_*`         | wall/fingerboard | continuous/circuit  | якорь CF (≤CF); BFR — minAge 18                      |
| F техника            | `tech_*`        | drill/wall       | continuous/attempts | не дозируется нагрузкой; ecodynamics (блок F метод.) |
| G антагонисты        | `ant_*`         | antagonist       | reps                | 🟠 профилактика; обязательность — S6                 |
| H мобильность        | `mob_*`         | mobility         | reps                | warmup как процедура (`warmup_runner`)               |
| I ментальное/тактика | `mental_*`      | wall             | reps/process        | тактика = `doseShape:'process'` (чек-лист)           |

**Общее для всех:** загрузка пула как данных (после machine-load, `5.0`);
валидация атома по схеме §1.2; doseConfidence на каждом. **Модули:**
`block_catalog`, `grips_catalog`, `mix_engine`, `warmup_runner`(H). **Фаза:** 1
(A/G/H — есть база), 2 (board/wall/campus/process модальности — greenfield).
**Вопрос:** `Q-4-1` — `doseShape:'process'` (тактика): отдельная сущность или
атом с чек-листом (реком. атом, см. CONSTRUCTOR_SPEC).

## Карточки 5.0–5.8 — протоколы (групповая, числа = пул)

**Паттерн:** часть 5 — обоснование/диапазоны; **канон чисел —
`PROTOCOL_POOL.md`** (источник истины). В коде 5.x = данные `block_catalog` +
трансфер-функции «тест→доза».

- `5.0` логика пула → **схема атома §1.2 + machine-load пула** (доведение полей:
  doseConfidence, prerequisites_catalog, sentinel-семантика — см. READINESS Ф0).
  **Блокер.**
- `5.1`–`5.6` числа по качествам → данные атомов `fs/str/pow/pe/aer/ant_*` +
  **трансфер-функции дозы** (`rm_margin→вес`, `grade→грейд`, `pctMax/CF→число`)
  — **блокер** (`Q-5-1`).
- `5.7` разминка → `warmup_runner` (есть база).
- `5.8` карта подраздел→протоколы → doc-линковка, не код.

**Модули:** `block_catalog`, `assessment` (трансфер-функции). **Фаза:** 0
(схема+ функции) → 1. **Вопросы:** `Q-5-1` формулы «тест→доза» по `loadModel`
(блокер, пересекается с дозировкой 8.2/1.4); `Q-5-2` параметры machine-load
(sentinel, prerequisites_catalog).

## Карточки 6.1–6.6 — периодизация (движок макро/мезо/микро)

**Методология ч.6:** 3 модели (линейная Anderson / нелинейная Bechtel / DUP
Hörst)

- выбор по формату×лимитеру + тейпер + maintenance. **Ядро и live-source
  подключены:** `periodization_engine` строит макро/мезо-план (`buildPlan`),
  `current` резолвит фазу дня, UI-старт тренировочного цикла сохраняет plan
  через `savePlan`, `engine_router` кладёт `current()` в `plannerContext`, а
  `session_builder` clamp'ит bucket и volume. Старый `Fingers.mesocycle`
  оставлен как совместимый Today-mirror, но active plan теперь берётся из
  `periodization_engine`.

* `6.1` линейная → генератор фаз base→strength→power→PE→peak→rest; кодируется
  прямо.
* `6.2` нелинейная → **параметрический шаблон ротации качеств** в неделе (нет
  шаблона → `Q-6-1`).
* `6.3` DUP + последовательность энергосистем → недельный undulating-шаблон;
  инвариант порядка сила→ёмкость→аэробика.
* `6.4` выбор модели → правило `selectModel(формат-цели, лимитер)` (см. таблицы
  ч.6).
* `6.5` тейпер → микроцикл `taper` (объём↓, интенсивность=, новые блоки
  запрещены), привязан к `goalDate`.
* `6.6` maintenance → микроцикл `maintenance` (≤1×/нед, интенсивность держим);
  отличать от `deload`/`taper` по фазе сезона.

Общая зависимость: **метрика объёма** (`Q-1.2-1`) для deload/taper/maintenance
магнитуд; персистенция плана — **client-scoped** (инвариант #9). **Модуль:**
`periodization_engine`. **Фаза:** ядро ✅, live wiring ✅, UI forward-календарь
✅ (`Q-6-2` закрыт). **Вопросы:** `Q-6-1` шаблоны ротации nonlinear/DUP.

## Карточки 7.1–7.4 — прогрессия по уровням (групповая)

**Однородный паттерн:** уровень/тренировочный возраст → **гейты доступных
блоков** (что можно/нельзя на этапе). Реализация одна: `profile.level` +
`atom.minLevel` → `ageGate.filterExercises`/`validators`; «НЕ делать» = запрет
блоков выше уровня (новичку нет max-hang/кампуса — S1).

- 7.1 новичок · 7.2 ранний средний · 7.3 средний/продв. · 7.4 элита — отличаются
  набором разрешённых блоков и дефолт-долями (связь с `1.5`).

**Существующий код:** `age_gating.filterPrograms`/`level` — частичная база.
**Модуль:** `validators`, `age_gating`, `periodization_engine` (доли).
**Фаза:** 1. **Вопрос:** `Q-7-1` — определение `profile.level` (как присваиваем:
тест/грейд/ самооценка) — пересекается с `assessment`.

## Карточки 8.1–8.5 — тестирование (assessment; здесь главный блокер)

**Методология ч.8:** батарея IRCRA → бенчмарки по уровням → аудит лимитера. Это
`assessment` — и именно тут живёт **scoring лимитера** (ядро 1.4).

- `8.1` батарея → UI-ввод 9 тестов + хранение в `records`; нормировка %bw.
  Live-связка готова: `records.assessLatestBattery(level)` читается в
  `engine_router._enrichOpts` и даёт `focusQuality`.
- `8.2` бенчмарки/предикторы по уровням → Berta 2025 Table 3 runtime targets →
  интерпретация теста (отклонение от нормы). `Q-8-1` закрыт; deciles S2–S5 нужны
  только для будущей percentile-UI.
- `8.3` аудит лимитера → `scoreLimiters(profile, skillFlags)` → ведущий
  лимитер + веса (см. `1.4`). Live-связка готова, числовой апгрейд зависит от
  `8.2`.
- `8.4` частота → напоминание на границе мезо
  (`calendar`/`periodization_engine`).
- `8.5` опц. мониторинг (ACWR/HRV) → мягкие сигналы `readiness`, не гейт.

**Модули:** `assessment`, `calibration`, `records`, `readiness`. **Фаза:**
UI/limiter live ✅, runtime-бенчмарки Berta ✅. **Осталось:** percentile-UI по
decile Tables S2–S5; `Q-8-2` оборудование CF/тензометр — обязательно или
опциональный путь (fallback-тест без Tindeq)?

## Карточки 9.1–9.6 + S1–S8 — безопасность (несущие валидаторы)

**Методология ч.9:** правило → почему → валидатор; fail-closed. Подразделы 9.x —
контекст, S1–S8 — исполняемые правила (ядро `validators` + safety-тесты).

Подразделы: `9.1` рамка (не код) · `9.2` таблица правил → модуль `validators` +
`TESTS/heys_fingers_safety.test.js` (расширить ДО рефактора!) · `9.3`
возраст/зоны роста → `age_gating` по `minAge`, fail-closed (база есть) · `9.4`
вес/RED-S → инвариант «не предписываем вес» (отсутствие фичи) + дисклеймер ·
`9.5` реабилитация → ветка `rehab` (строгие гейты) + `painGate` · `9.6`
дисклеймер → UI-текст.

Валидаторы (каждый = функция в `validators`, fail-closed):

| ID   | Логика                                          | Вход                             | Код/база                                       |
| ---- | ----------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `S1` | уровень/возраст-гейт; нет возраста→блок         | `atom.minLevel/minAge`, profile  | `age_gating.filterExercises` (есть база)       |
| `S2` | свежесть: 48ч `high` / 72ч `max` по `gripGroup` | `fingerTissueLog`/history        | `validators.S2_tissueFreshness` + `records`    |
| `S3` | разминка обязательна                            | `session.warmup_done`            | `validators`+`warmup_runner`                   |
| `S4` | рост high-intensity объёма ≤10%/нед             | метрика объёма по неделям        | `validators` (нужна `Q-1.2-1`)                 |
| `S5` | открытый хват база, замок дозированно           | `gripId`/уровень/danger-budget   | `mix_engine`+`grips_catalog` (есть база)       |
| `S6` | антагонисты при тяжёлых тягах                   | наличие antagonist-блока в микро | `mix_engine` (есть база)                       |
| `S7` | deload обязателен                               | мезо без разгрузки               | `periodization_engine`                         |
| `S8` | боль → стоп прогрессии/rehab                    | флаг боли в логе                 | `age_gating.painGate`+`validators` (есть база) |

**Модули:** `validators`, `age_gating`, `readiness`, `mix_engine`,
`periodization_engine`. **Фаза:** 1 (S1/S3/S5/S6/S8 — базы есть), 1–2 (S2/S4 —
после метрики объёма и tissue-истории), 2 (S7). **Вопросы:** `Q-9-1` — формат
флага боли в логе сессии (вход S8); прочее — общие блокеры (`Q-1.2-1`,
`Q-1.6-1`).

## Карточка part-10 — источники

**Методология ч.10:** реестр источников + доказательность. → модуль
`bibliography` (`sourceId`→ссылка), `SourceBadge` и `BibliographyModal` видны в
протоколах, live mix и тест-батарее. `doseConfidence` живёт у протоколов (не у
источника). **Модуль:** `bibliography`. **Фаза:** 1 ✅. Вопросы: —.

---

# Заметки целостности (ревью 2026-06-08) — дома «бездомным» механизмам

Из семантического аудита: механизмы методологии, у которых не было явного дома.
Каждому назначен дом, чтобы при реализации не уронили.

- **1.5 верхний кэп «железо не вытесняет лазание»** → валидатор
  `V_skillBalance`: warn, если доля железа > уровневой (§3.8). Был только нижний
  гард «не одно железо». Фаза 2.
- **3.3 ротация хватов/зацепа для FDP/FDS** ✅ 2026-06-11 — реализовано через
  `edge_history` (кросс-сессионный lean-лог: crimp=FDP / open=FDS) +
  `session_builder._orderByEdgeRotation` (чередует хваты к под-нагруженному
  сгибателю). См. карточку 1.3.
- **density-hang (A4): derive↔intent коллизия** → density-hang несёт **явный**
  `energySystem:phosphagen` (намерение блока A — сила/ткань);
  `deriveEnergySystem` по workSec=30 дал бы glycolytic. Правило: явное поле
  `energySystem` атома переопределяет derive (derive — только дефолт).
  Зафиксировать в §3.1.
- **5.5 под-режимы energySystem (aerobic-power vs aerobic-capacity)** → теги в
  `SPORT_CONFIG`; дозы D/E различают (4–6 мин power vs длинный ARC capacity).
  Объявлены §3.2 — использовать в block_catalog.
- **6.3 инвариант «сила→ёмкость→аэробика» для ВСЕХ моделей** → валидатор
  `V_energySystemSequence`: ёмкостный мезо не раньше силовой базы — linear/
  nonlinear/DUP, не только DUP. Фаза 2.
- **7.3 «болдер→трассы, игнор аэробной базы»** → homed: навыковый флаг
  «забивается на длинном» → лимитер `aerobic_base` (§3.2, дополнено).
- **9.5 кожа/флапперы как ограничитель объёма** ✅ 2026-06-12 → сигнал
  `skinStatus` в `validators.V_skinStatus` (advisory `volumeMultiplier`) + live
  soft-cap в `session_builder.__trace.resolution.softModifiers`; не гейт.
- **3.3 возрастной модификатор 35+ (коллаген ↓)** ✅ 2026-06-12 →
  `validators.V_ageModifier` даёт advisory `volumeMultiplier`, builder применяет
  его как мягкий cap объёма пальцевой нагрузки и пишет reason в safety trace.
- **Терминология:** `intent` (проза §1.2) = поле `targetStimulus` —
  унифицировать на `targetStimulus`.
