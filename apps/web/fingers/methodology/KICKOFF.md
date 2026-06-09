# KICKOFF — вход для реализации (Фаза 1+)

Точка входа для агента/разработчика, который продолжает сборку режима `fingers`
в локальной среде. Прочитай это первым, затем `CLAUDE.md` рядом.

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
| `tools/`                      | чекеры `impl-coverage.mjs`, `school-weights.mjs`                                        |

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
  goal) уже были покрыты существующими 33 тестами в этом же файле. **Подтвердить
  зелёным локально** (см. ниже) — vitest в песочнице не идёт, ассерты сверены
  node-зондом.

## ⚠️ Проверка тестов — только локально

vitest **не запускается в Cowork-песочнице** (нативный rollup под Linux
отсутствует, node_modules собраны под macOS). Поэтому Шаг 1 верифицирован
node-зондом, а не vitest. **Первым делом в локальной среде прогони:**

```bash
pnpm vitest run apps/web/__tests__/fingers-mix-engine.test.js   # safety baseline зелёный
pnpm dev:local       # API:4001 + web:3001 — увидеть режим
node apps/web/fingers/methodology/tools/impl-coverage.mjs   # 61/61, пул 28/28
```

## Стратегия: strangler-fig (в том же режиме `fingers`)

Инфраструктуру (оболочка, age/readiness/safety-модули, персистенция)
**оставляем** — пользователю нравится. Меняем только «мозг» (логику/методологию)
инкрементально за фиче-флагом, со старым mix_engine как fallback.

| Шаг | Что                                                                                                                                                                                           | Статус                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | safety-тесты ДО рефактора                                                                                                                                                                     | ✅ добавлены в `__tests__` — подтвердить `pnpm vitest run`                                                                                 |
| 2   | аддитивный data-слой: `quality_catalog` (9 осей, enum'ы §1.2, `deriveEnergySystem`, `PROGRAM_META` на 20 программ, `enrichProgram`). **PROGRAMS не мутируется** — методология отдельным слоем | ✅ модуль+тесты, probe-green — `pnpm vitest run`                                                                                           |
| 3   | новые модули логики (`block_catalog` из пула, `validators` S1–S8, `assessment`) **за флагом**, вне live-пути                                                                                  | ✅ в проде: `block_catalog` 36 атомов × 9 блоков, `validators` S1–S9 + homed `V_*`, `assessment` §3.2                                      |
| 4   | strangle генерации сессии по флагу: A/B новый движок vs старый, fallback, флип дефолта когда новый ≥ старый + safety зелёный                                                                  | ✅ инфраструктура в проде: `engine_router` + `sessionBuilder` + UI runner split (Hang/Reps). `flag=on` ждёт re-shadow с реальными уровнями |

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
   `school-weights.mjs`.

## Дисциплина git (HEYS-v2 CLAUDE.md)

- Коммит через `pnpm ship "<msg>"`. **`git push` — только по явной команде**
  пользователя. Approval задачи ≠ approval push.
- `--no-verify` — только с явного разрешения.

## Открытый бэклог

- **Фаза 2 homed-items** (см. IMPLEMENTATION_MAP «Заметки целостности»):
  `V_skillBalance`, FDP/FDS edge-ротация, `V_energySystemSequence`,
  `skinStatus`, `ageModifier` 35+, density-hang явный energySystem.
- **🟢-апгрейд числбазы:** достать supplementary Berta 2025 (Tables S2–S5) для
  замены 🟠-дефолт-бенчмарков §3.5.

## Следующее конкретное действие

**Шаги 1-4 ✅ в проде** (см. таблицу выше). Strangler-цепочка собрана: данные
(`block_catalog`), safety (`validators` S1–S9 + homed `V_*`), приоритезация
(`assessment`), маршрутизация (`engine_router` с MVC/level plumbing из
`Fingers.records`), сборка сессии (`sessionBuilder` со shared
`useExerciseShell`), UI (`HangRunner`/`RepsRunner` с общим S8 RPE/pain capture).

**Что осталось до `flag=on`**:

1. **Re-shadow с реальными уровнями** (зона методолога): прогнать
   `shadowCompare=true` на dev/prод с stub'ом `Fingers.records` для derived
   advanced/intermediate/beginner — снять distribution `doseShape`/`modality` +
   кумулятив danger, сравнить с legacy конвертом. См.
   `engineRouter.lastShadowDiff`.
2. **Финальный go-flip** методологом: `HEYS.Fingers.flags.newEngine = true` как
   дефолт. Прежний `mix_engine` остаётся fallback (router catches null/throw).

**Tech-debt не блокер**: консолидация `useCountdownCycle`+`useRepsCycle` в общий
timer-core (после приземления strangler'a — теперь оба покрыты characterization,
вынос безопасен). `quality_catalog` потреблять).
