# KICKOFF — вход для реализации (Фаза 1+)

Точка входа для агента/разработчика, который продолжает сборку режима `fingers`
в локальной среде. Прочитай это первым, затем `CLAUDE.md` рядом.

## Сводка готовности

<!-- STATUS:AUTO:START -->
<!-- ⚙ Сгенерировано tools/status-sync.mjs из IMPLEMENTATION_MAP.md — НЕ редактировать вручную. -->

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

<!-- STATUS:AUTO:END -->

## Где что лежит

Сначала прочитай общий регламент тренировочных режимов:
[`../../_kernel/TRAINING_MODE_REGULATION.md`](../../_kernel/TRAINING_MODE_REGULATION.md).
Он фиксирует, что пальцы, мобильность и будущие режимы используют одно runtime
ядро, а этот каталог документов описывает именно climbing/fingers-контекст.

Всё доменное — в `apps/web/fingers/methodology/`:

| Файл                          | Роль                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `METHODOLOGY.md`              | части 0–10: принципы, физиология, каталог, протоколы, периодизация, тесты, безопасность |
| `PROTOCOL_POOL.md`            | **канон чисел** (~36 атомов). Числа правим здесь, не в прозе                            |
| `BIBLIOGRAPHY.md`             | реестр источников (sourceId→ссылка+уровень 🟢/🟡/🟠)                                    |
| `CONSTRUCTOR_SPEC.md`         | модель данных §1, привязка к коду §2, **алгоритмы §3**, **SPORT_CONFIG §4**             |
| `IMPLEMENTATION_MAP.md`       | трассировка «единица методологии→код» по ID + карточки + заметки целостности            |
| `IMPLEMENTATION_READINESS.md` | аудит готовности + фазовый план                                                         |
| `PLAYBOOK.md`                 | тиражирование на другие спорты + FORK_CHECKLIST                                         |
| `tools/`                      | чекеры `impl-coverage.mjs`, `school-weights.mjs`, `status-sync.mjs` (сводка готовности) |

Код режима: `apps/web/fingers/*.js` (IIFE-модули `HEYS.Fingers.*`). «Мозг» —
тонкие доменные адаптеры поверх `HEYS.TrainingKernel.*`; legacy
`heys_fingers_mix_engine_v1.js` остаётся только как совместимость/fallback там,
где это явно указано тестами.

## Что уже готово

- **Фаза 0 завершена.** Карта реализации 61/61, пул вопросов 28/28 решено.
  Алгоритмы зафиксированы в `CONSTRUCTOR_SPEC §3` (FTL-объём, scoring лимитера,
  tissue-история, machine-load, бенчмарки, transfer-дозы, MEV/MAV, доли).
- **§4 SPORT_CONFIG** — слой переносимости: спорт-числа/риск-модель выносятся в
  конфиг, движок sport-agnostic (для будущих форков: армрестлинг и т.д.).
- **Фаза 1 / Шаг 1:** базовая safety-регрессия ДО рефактора добавлена в реальный
  тест-файл `apps/web/__tests__/fingers-mix-engine.test.js` — блок
  `mixEngine: safety regression (pre-strangler baseline)` (5 кейсов:
  danger-budget ≤ cap по bucket для max и recovery, порядок энергосистем
  power/max-strength→ endurance, age-gate 14 лет без добавочного веса,
  идемпотентность пересборки). Остальные safety-инварианты (age
  fail-closed→null, antagonist-closer, pain-gate, ramp-разминка, bucket режет
  goal) уже были покрыты существующими 33 тестами в этом же файле. Подтверждать
  через `pnpm vitest run ...` в текущей рабочей среде.

## Проверка тестов

Минимальный smoke после правок методологии/движка:

```bash
pnpm vitest run apps/web/__tests__/fingers*.test.js
node apps/web/fingers/methodology/tools/impl-coverage.mjs
node apps/web/fingers/methodology/tools/school-weights.mjs --check
```

Для methodology/source-only правок legacy bundle rebuild и браузерный QA не
нужны. Если правка затрагивает web/UI runtime, действуют корневые правила:
scoped local QA через `pnpm bundle:legacy:auto --files=<свои source-файлы>` +
`pnpm dev:local`; full rebuild/integration/release — только по явной команде.

## Стратегия: strangler-fig (в том же режиме `fingers`)

Инфраструктуру (оболочка, age/readiness/safety-модули, персистенция)
**оставляем** — пользователю нравится. Меняем только «мозг» (логику/методологию)
инкрементально за фиче-флагом, со старым mix_engine как fallback.

| Шаг | Что                                                                                                                                                                                           | Статус                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | safety-тесты ДО рефактора                                                                                                                                                                     | ✅ добавлены в `__tests__` — подтвердить `pnpm vitest run`                                                                                                                                                                                                |
| 2   | аддитивный data-слой: `quality_catalog` (9 осей, enum'ы §1.2, `deriveEnergySystem`, `PROGRAM_META` на 20 программ, `enrichProgram`). **PROGRAMS не мутируется** — методология отдельным слоем | ✅ модуль+тесты, probe-green — `pnpm vitest run`                                                                                                                                                                                                          |
| 3   | новые модули логики (`block_catalog` из пула, `validators` S1–S8, `assessment`) **за флагом**, вне live-пути                                                                                  | ✅ в проде: `block_catalog` 36 атомов × 9 блоков, `validators` S1–S9 + homed `V_*`, `assessment` §3.2                                                                                                                                                     |
| 4   | strangle генерации сессии по флагу: A/B новый движок vs старый, fallback, флип дефолта когда новый ≥ старый + safety зелёный                                                                  | ✅ **FLIP 2026-06-11: `flags.newEngine=true` дефолт для всех** (canary валидирован, `engine_router:45`); `engine_router` + `sessionBuilder` + UI runner split в проде. `mix_engine` остаётся fallback при null/throw. Осталось — только canary-наблюдение |
| 5   | UI-плееры на все doseShape (a continuous · b attempts · c circuit · d process) + B3 прогрессия-advisory (`detectPlateau`/`nextAxis`/`suggestProgression`)                                     | ✅ 2026-06-09 в проде: `RENDERABLE_DOSESHAPES`=все 6 (Runner+Display каждого); `progression` advisory в `sessionBuilder` без влияния на генерацию. Enforcement прогрессии — Фаза 2                                                                        |

## Инварианты реализации (не нарушать)

1. **Safety fail-closed.** Невалидный возраст/данные → `null`, не «как-нибудь».
   Age-gate — нижняя граница (дети) обязательна.
2. **Тесты до рефактора.** Любой шаг strangle — сначала тест на текущее
   поведение, потом замена.
3. **Аддитивно.** Шаг 2 не меняет поведение — только добавляет метаданные.
4. **За флагом.** Новая логика не на live-пути, пока safety не зелёный.
5. **Числа — в пуле/конфиге**, не в прозе/литералах. Новый спорт =
   `SPORT_CONFIG`.
6. **Общая логика — в kernel.** Если поведение повторяется у пальцев и
   мобильности, оно переносится в `apps/web/_kernel/`; домен оставляет config,
   hooks и специализированный player/visual.
7. **После правок методологии** — гонять `tools/impl-coverage.mjs` +
   `school-weights.mjs`. **Сводку готовности правишь ТОЛЬКО в
   `IMPLEMENTATION_MAP.md`** (между `STATUS:SOURCE`), затем
   `node tools/status-sync.mjs` синкнёт её в METHODOLOGY+KICKOFF (`--check` —
   для CI/pre-commit, падает при дрейфе).

## Дисциплина git (HEYS-v2 CLAUDE.md)

- Без отдельной явной команды commit/shipping не stage'ить под commit и не
  коммитить. Если commit/shipping явно разрешён — выбрать intended scope и
  коммитить через `pnpm ship "<msg>"`. **`git push` — только по явной команде**
  пользователя. Approval задачи ≠ approval commit/push.
- `--no-verify` — только с явного разрешения.

## Открытый бэклог

- **Периодизация — ядро в проде** ✅ (commit `3b6d4c62`, B7):
  `periodization_engine` строит макро/мезо-план (модели linear 6.1 / nonlinear
  6.2 / DUP 6.3 / taper 6.5 / maintenance 6.6, фазы с `ceiling`+
  `volumeMultiplier`), `current` резолвит фазу дня, `engine_router`+
  `sessionBuilder` clamp'ят интенсивность дня по фазе мезоцикла. Тесты
  `fingers-periodization`+`fingers-mesocycle`. Авто-выбор модели 6.4
  (`selectModel(формат×лимитер)`) — ✅ реализован и подключён в
  `periodization_engine` (`explicitModel ? null : selectModel(...)`, ветки
  beginner/limiter/goalDate/DUP). **Осталось Фаза 2:** transfer-sequencing M3 +
  полная тест-батарея периодизации.
- **Enforcement прогрессии/вариативности (Фаза 2)** ✅: `recordsByQuality`
  доезжает в builder: `finger_strength` из MVC-history, остальные качества из
  session-log proxy; axis-cap реально меняет выбор, `saveProgressionAxis()` +
  Settings сохраняют ручную текущую ось.
- **Фаза 2 homed-items** (см. IMPLEMENTATION_MAP «Заметки целостности»):
  `V_skillBalance`, `V_energySystemSequence`, `skinStatus`, `ageModifier` 35+,
  density-hang явный energySystem и FDP/FDS edge-ротация — ✅. Осталось UI для
  forward-календаря/source popovers и расширение explainability.
- **🟢-апгрейд числбазы:** runtime-бенчмарки §3.5 переведены на Berta 2025 Table
  3 weighted means (70/87/102% BW). Supplementary Tables S2–S5 — будущая
  percentile-UI, не блокер scoring.

## Следующее конкретное действие

**Шаги 1-5 ✅ + B3 advisory + S4 FTL enforcement в проде** (см. таблицу выше).
Strangler-цепочка собрана: данные (`block_catalog`), safety (`validators`
S1–S9 + homed `V_*`), приоритезация (`assessment`), маршрутизация
(`engine_router` с MVC/level plumbing из `Fingers.records`), сборка сессии
(`sessionBuilder` со shared `useExerciseShell`, advisory progression-hints и
FTL-cap slot trimming), UI всех 6 doseShape
(`Hang`/`Reps`/`Continuous`/`Attempts`/`Circuit`/`Process` Runner+Display с
общим S8 RPE/pain capture).

**`flag=on` сделан (FLIP 2026-06-11).** `HEYS.Fingers.flags.newEngine = true` —
дефолт для всех в `engine_router:45` (canary валидирован). Прежний `mix_engine`
остаётся fallback (router catches null/throw). Scripted shadow-envelope закрыт:
`node apps/web/fingers/methodology/tools/shadow-envelope.mjs --check`.

**Осталось после flip:**

1. **Canary-наблюдение**: следить за `engineRouter.lastShadowDiff`,
   fallback-rate и S4 trimming telemetry; откат — `newEngine=false` в
   `engine_router:45` (+rebundle/deploy) или рантайм-флаг.

**Tech-debt**: консолидация `useCountdownCycle`+`useRepsCycle` в общий
timer-core — ✅ сделано (commit `0f9ef53e`, A4: `useTimerCore` ядро, оба хука
тонкие обёртки). Осталось: перевести оставшиеся legacy-точки на
`quality_catalog`.
