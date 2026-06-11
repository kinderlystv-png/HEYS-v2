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
| 1. Принципы          |   ✅   |   ✅   | 🟡  |
| 2. 9 качеств         |   ✅   |   ✅   |  —  |
| 3. Физиология        |   ✅   |   ✅   |  —  |
| 4. Каталог A–I       |   ✅   |   ✅   | ✅  |
| 5. Протоколы         |   ✅   |   ✅   | ✅  |
| 6. Периодизация      |   ✅   |   ✅   | ⬜  |
| 7. Уровни            |   ✅   |   ✅   | ✅  |
| 8. Тесты / бенчмарки |   ✅   |   🟡   | ⬜  |
| 9. Безопасность      |   ✅   |   ✅   | ✅  |
| 10. Источники        |   ✅   |   ✅   |  —  |

**Поставка:** движок + UI всех 6 doseShape — в проде за `flags.newEngine=false`
(юзер на legacy). Безопасность выверена полностью. Дальше — **гибрид:
canary-флип → 100% на живых данных.** Детальный per-подраздел аудит — в таблице
«Аудит: Движок vs UI» ниже в этом файле.

<!-- STATUS:AUTO:END -->

## Где что лежит

Всё в `apps/web/fingers/methodology/`:

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
`heys_fingers_mix_engine_v1.js`.

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
pnpm --filter @heys/web run bundle:fingers
pnpm dev:local       # API:4001 + web:3001 — увидеть режим
```

## Стратегия: strangler-fig (в том же режиме `fingers`)

Инфраструктуру (оболочка, age/readiness/safety-модули, персистенция)
**оставляем** — пользователю нравится. Меняем только «мозг» (логику/методологию)
инкрементально за фиче-флагом, со старым mix_engine как fallback.

| Шаг | Что                                                                                                                                                                                           | Статус                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | safety-тесты ДО рефактора                                                                                                                                                                     | ✅ добавлены в `__tests__` — подтвердить `pnpm vitest run`                                                                                                                         |
| 2   | аддитивный data-слой: `quality_catalog` (9 осей, enum'ы §1.2, `deriveEnergySystem`, `PROGRAM_META` на 20 программ, `enrichProgram`). **PROGRAMS не мутируется** — методология отдельным слоем | ✅ модуль+тесты, probe-green — `pnpm vitest run`                                                                                                                                   |
| 3   | новые модули логики (`block_catalog` из пула, `validators` S1–S8, `assessment`) **за флагом**, вне live-пути                                                                                  | ✅ в проде: `block_catalog` 36 атомов × 9 блоков, `validators` S1–S9 + homed `V_*`, `assessment` §3.2                                                                              |
| 4   | strangle генерации сессии по флагу: A/B новый движок vs старый, fallback, флип дефолта когда новый ≥ старый + safety зелёный                                                                  | ✅ инфраструктура в проде: `engine_router` + `sessionBuilder` + UI runner split (Hang/Reps). `flag=on` ждёт re-shadow с реальными уровнями                                         |
| 5   | UI-плееры на все doseShape (a continuous · b attempts · c circuit · d process) + B3 прогрессия-advisory (`detectPlateau`/`nextAxis`/`suggestProgression`)                                     | ✅ 2026-06-09 в проде: `RENDERABLE_DOSESHAPES`=все 6 (Runner+Display каждого); `progression` advisory в `sessionBuilder` без влияния на генерацию. Enforcement прогрессии — Фаза 2 |

## Инварианты реализации (не нарушать)

1. **Safety fail-closed.** Невалидный возраст/данные → `null`, не «как-нибудь».
   Age-gate — нижняя граница (дети) обязательна.
2. **Тесты до рефактора.** Любой шаг strangle — сначала тест на текущее
   поведение, потом замена.
3. **Аддитивно.** Шаг 2 не меняет поведение — только добавляет метаданные.
4. **За флагом.** Новая логика не на live-пути, пока safety не зелёный.
5. **Числа — в пуле/конфиге**, не в прозе/литералах. Новый спорт =
   `SPORT_CONFIG`.
6. **После правок методологии** — гонять `tools/impl-coverage.mjs` +
   `school-weights.mjs`. **Сводку готовности правишь ТОЛЬКО в
   `IMPLEMENTATION_MAP.md`** (между `STATUS:SOURCE`), затем
   `node tools/status-sync.mjs` синкнёт её в METHODOLOGY+KICKOFF (`--check` —
   для CI/pre-commit, падает при дрейфе).

## Дисциплина git (HEYS-v2 CLAUDE.md)

- Коммит через `pnpm ship "<msg>"`. **`git push` — только по явной команде**
  пользователя. Approval задачи ≠ approval push.
- `--no-verify` — только с явного разрешения.

## Открытый бэклог

- **Периодизация — ядро в проде** ✅ (commit `3b6d4c62`, B7):
  `periodization_engine` строит макро/мезо-план (модели linear 6.1 / nonlinear
  6.2 / DUP 6.3 / taper 6.5 / maintenance 6.6, фазы с `ceiling`+
  `volumeMultiplier`), `current` резолвит фазу дня, `engine_router`+
  `sessionBuilder` clamp'ят интенсивность дня по фазе мезоцикла. Тесты
  `fingers-periodization`+`fingers-mesocycle`. **Осталось Фаза 2:** авто-выбор
  модели 6.4 (`selectModel(формат×лимитер)` — сейчас `model` задаётся вручную),
  transfer-sequencing M3.
- **Enforcement прогрессии/вариативности (Фаза 2)** — `progression` (B3) сейчас
  только advisory-hints в `sessionBuilder`; завести влияние на генерацию (смена
  переменной по `detectPlateau`/`nextAxis`).
- **Фаза 2 homed-items** (см. IMPLEMENTATION*MAP «Заметки целостности»):
  `V_skillBalance`, `V_energySystemSequence`, `skinStatus`, `ageModifier` 35+,
  density-hang явный energySystem. *(FDP/FDS edge-ротация — ✅ 2026-06-11:
  `edge_history` + `session_builder` ротация.)\_
- **🟢-апгрейд числбазы:** достать supplementary Berta 2025 (Tables S2–S5) для
  замены 🟠-дефолт-бенчмарков §3.5.

## Следующее конкретное действие

**Шаги 1-5 ✅ + B3 advisory + S4 FTL enforcement в проде** (см. таблицу выше).
Strangler-цепочка собрана: данные (`block_catalog`), safety (`validators`
S1–S9 + homed `V_*`), приоритезация (`assessment`), маршрутизация
(`engine_router` с MVC/level plumbing из `Fingers.records`), сборка сессии
(`sessionBuilder` со shared `useExerciseShell`, advisory progression-hints и
FTL-cap slot trimming), UI всех 6 doseShape
(`Hang`/`Reps`/`Continuous`/`Attempts`/`Circuit`/`Process` Runner+Display с
общим S8 RPE/pain capture).

**Что осталось до `flag=on`**:

1. **Финальный go-flip** методологом: `HEYS.Fingers.flags.newEngine = true` как
   дефолт. Прежний `mix_engine` остаётся fallback (router catches null/throw).
   Scripted shadow-envelope уже закрыт:
   `node apps/web/fingers/methodology/tools/shadow-envelope.mjs --check`.
2. **Canary-наблюдение**: после flip следить за `engineRouter.lastShadowDiff`,
   fallback-rate и S4 trimming telemetry.

**Tech-debt**: консолидация `useCountdownCycle`+`useRepsCycle` в общий
timer-core — ✅ сделано (commit `0f9ef53e`, A4: `useTimerCore` ядро, оба хука
тонкие обёртки). Осталось: перевести оставшиеся legacy-точки на
`quality_catalog`.
