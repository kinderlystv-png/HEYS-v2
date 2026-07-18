# Советы, действия и геймификация

> **Статус:** основные source-контракты проверены 2026-07-17 **Охват:**
> генерация и показ советов, outcomes/snooze/commitments, XP, достижения, daily
> missions и cloud sync игры **Не подтверждено:** полный набор правил, баланс
> наград, browser UX и production cloud reconciliation

## Граница системы

Советы и игра используют одни события дня, но имеют разных владельцев:

```text
Day/profile/analytics context
  ├─ advice modules → filter/rank → card/toast → action/outcome/commitment
  └─ game events → mission progress → XP/level/achievements → heys_game sync
```

Совет предлагает действие и собирает feedback. Геймификация награждает уже
произошедшее действие. Их нельзя объединять в один state или считать advice
показ доказательством выполнения миссии.

## Владельцы ответственности

| Область                                       | Точка                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Advice orchestration, cache, rank, public API | `advice/_core.js`                                                                                   |
| Доменные генераторы                           | `advice/_nutrition.js`, `_hydration.js`, `_training.js`, `_timing.js`, `_emotional.js`, `_other.js` |
| Actions и snooze                              | `advice/_actions.js`                                                                                |
| Outcomes/evidence/experiments                 | `advice/_outcomes.js`, `_evidence.js`, `_experiments.js`                                            |
| Commitments                                   | `advice/_commitments.js`                                                                            |
| DayTab state и UI                             | `heys_day_advice_state_v1.js`, `heys_day_advice_card.js`, `heys_day_advice_*_ui_v1.js`              |
| Game source of truth и cloud sync             | `heys_gamification_v1.js` → `HEYS.game`                                                             |
| Mission pool/selection                        | `heys_daily_missions_v1.js` → `HEYS.missions`                                                       |
| Lazy loading boundary                         | `heys_game_facade_v1.js`                                                                            |
| Game bar                                      | `heys_gamification_bar_v1.js`                                                                       |

## Advice flow

`generateAdvices(ctx)` требует нормы, строит derived context и запускает
зарегистрированные domain modules. Ошибка одного модуля логируется и не
останавливает остальные. Затем применяются dismiss penalties, TTL и cache. Trace
collector фиксирует, какие модули реально отработали и почему ничего не вернули.

После генерации отдельный UI-слой фильтрует, ранжирует, ограничивает категории и
регистрирует shown/click/read/hidden/positive/negative outcomes. Primary actions
вызываются по строковому handler id: часть обращается к API модуля, часть
отправляет browser events.

Snooze хранит счётчик по advice id. После повторных snooze совет отменяется и
может превратиться в declined commitment. Commitments проверяются прямо во время
следующей генерации, поэтому формально read-like вызов generator имеет побочный
эффект на commitment state.

## Game flow

Каноническое состояние игры — объект `heys_game`: XP, level, achievements,
dailyXP, missions, challenges и stats. Локальная запись синхронизируется
отдельным RPC flow; это намеренно не обычный day save.

При событии `_addXPInternal` сначала обновляет mission progress, затем применяет
per-action daily limit к XP. Поэтому достигнутый лимит XP не должен блокировать
выполнение миссии. Есть dedup window для близких одинаковых событий, но его ключ
зависит от reason и optional dedup id.

Daily missions принадлежат `heys_game`, а не `DayRecord`. Legacy copy из дня
может быть прочитана один раз для миграции, но gamification не должна писать
день: комментарий фиксирует реальный прошлый incident с потерей meals из-за
stale snapshot.

Mission selector учитывает level/profile, исключает недавние ids и стремится
выбрать разные категории. Если кандидатов мало, anti-repeat ослабляется ради
заполнения набора. Цели части миссий адаптируются по поведению пользователя.

## Cloud merge и ошибки

Game sync делает preflight read и не перезаписывает cloud, если там больше XP,
богаче details или более новый timestamp; вместо этого загружает cloud state.
При недоступном preflight код продолжает upload. Это availability-first ветка:
она сохраняет прогресс, но ослабляет гарантию от stale overwrite именно во время
сетевой ошибки.

Sync имеет mutex, debounce/cooldown и отдельные немедленные критические события.
Локальное начисление считается успешным до подтверждения cloud RPC; failed sync
возвращает `false` и оставляет local state для повторной попытки.

## Инварианты

1. Advice без полного контекста не создаёт уверенную рекомендацию.
2. Ошибка одного advice module не блокирует остальные и видна в trace/log.
3. Advice action не считается выполненным, если handler вернул failure.
4. Mission state хранится только в `heys_game`, не в day object.
5. Mission progress обновляется даже после достижения daily XP limit.
6. XP mutation проходит dedup и per-action limit до persistence/sync.
7. Более богатый или новый cloud game state не перезаписывается обычным local.
8. Game lazy-unavailable state должен давать UI defaults, а не исключение.

## Подтверждённые слабые места и пробелы

- Advice engine очень велик и совмещает generation, ranking, tracking,
  persistence helpers и React hook; изменение shared context имеет широкую
  область регрессии.
- `generateAdvices` обрабатывает expired commitments, поэтому не является чистой
  функцией и повторный вызов может изменить состояние/вывод.
- Некоторые primary actions только отправляют CustomEvent. Успешный dispatch
  означает доставку события, но не успешное завершение пользовательского flow.
- Snooze counters имеют отдельный storage key и fallback на raw localStorage;
  client scoping зависит от поведения `HEYS.utils.lsSet` и load-time пути.
- Advice tests, найденные в основном suite, проверяют menu/render-loop
  contracts, но не полный набор domain rules и actions.
- Mission selector использует `Math.random`, поэтому точный набор миссий не
  воспроизводится без контролируемого random source.
- Game sync работает fail-closed: ошибка cloud precheck запрещает запись.
  Успешный precheck продолжает путь через server merge-save; stale semantic
  revision сохраняет более новое cloud значение.
- `heys_game` — крупный монолитный payload; missions, achievements, XP и stats
  конфликтуют/синхронизируются как единица.
- Dedup window не является idempotency key: одинаковое событие после окна или с
  другим/пустым `dedupId` может быть начислено повторно до daily limit.
- Lazy game chunk failure сбрасывает promise и логирует ошибку, но постоянного
  user-facing recovery state в facade нет.

## Facts Table

| ID  | Утверждение                                                                                         | Проверка                                               | Статус               |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| E1  | Advice generator требует `ctx.normAbs`, кеширует и изолирует ошибки modules                         | `sed -n '4820,5015p' apps/web/advice/_core.js`         | проверено 2026-07-17 |
| E2  | Advice public API экспортирует generator, filters, tracking и ratings                               | `sed -n '7160,7225p' apps/web/advice/_core.js`         | проверено 2026-07-17 |
| E3  | Primary actions используют API или CustomEvent и возвращают boolean                                 | `sed -n '25,150p' apps/web/advice/_actions.js`         | проверено 2026-07-17 |
| E4  | Snooze escalation хранит отдельный counter и срабатывает после повторов                             | `sed -n '150,265p' apps/web/advice/_actions.js`        | проверено 2026-07-17 |
| E5  | Game source key — `heys_game`, структура version 2                                                  | `sed -n '205,220p' apps/web/heys_gamification_v1.js`   | проверено 2026-07-17 |
| E6  | Missions принадлежат gameData и day используется только для read-only migration                     | `sed -n '2280,2365p' apps/web/heys_gamification_v1.js` | проверено 2026-07-17 |
| E7  | Mission progress обновляется до XP daily-limit gate                                                 | `sed -n '5535,5585p' apps/web/heys_gamification_v1.js` | проверено 2026-07-17 |
| E8  | Game cloud sync блокирует запись при failed precheck и использует merge-save со stale-write outcome | `rg -n 'cloud_precheck:failed_blocked                  | mergeSaveKV          | stale_write_blocked' apps/web/heys_gamification_v1.js yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs` | проверено 2026-07-17 |
| E9  | Mission selection ослабляет exclusions при нехватке кандидатов                                      | `sed -n '444,590p' apps/web/heys_daily_missions_v1.js` | проверено 2026-07-17 |
| E10 | Game загружается отдельным lazy chunk и facade поддерживает retry после failure                     | `sed -n '1,95p' apps/web/heys_game_facade_v1.js`       | проверено 2026-07-17 |
| E11 | Advice/game входят в postboot game lazy segment                                                     | `sed -n '190,230p' scripts/legacy-bundle-config.mjs`   | проверено 2026-07-17 |
| E12 | Найдены только точечные advice UI/render-loop tests, не полный rules suite                          | `rg --files apps/web/**tests**                         | rg 'advice.\*test'`  | проверено 2026-07-17                                                                                                  |

## Связанные источники

- [`ANALYTICS_AND_SCORING.md`](ANALYTICS_AND_SCORING.md) — аналитические входы.
- [`BACKGROUND_JOBS.md`](BACKGROUND_JOBS.md) — внешние reminders/push.
- [`DATA_MODEL_ANALYTICS.md`](../../DATA_MODEL_ANALYTICS.md) — исторические
  details геймификации; сверять с source.
