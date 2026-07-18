# Refactor DayTab: state-colocation + React.memo для leaf-компонентов

> **Статус 2026-07-18:** исторический диагностический план, частично
> реализованный и частично устаревший. Не выполнять целиком как готовое ТЗ:
> текущий DayTab уже разбит на модули и имеет memo-границы. Актуальная очередь и
> пороги повторного открытия находятся в [todo.md](../todo.md); каждую следующую
> perf-правку сначала подтверждать новым runtime trace.

> Создан: 2026-05-28 Priority: HIGH (см. `todo.md`) Связанные коммиты-обходы:
> `33f2f18f` (meals), `65f8259c` (advice), today's «drop startTransition в 7
> tap-paths» — все это временные **костыли** до этого рефактора.

## Контекст

Прошлый год накапливалась регрессия: курaтор в своей сессии всё чаще видел
«мёртвые» тапы — кнопка тапается, но визуально ничего не происходит. Корень не в
самой кнопке, а в комбинации:

1. **DayTab** — главный контейнер дневника (`apps/web/heys_day_tab_impl_v1.js`,
   ~2000 строк, 80+ внутренних переменных), при любом setState полностью
   перерисовывает всё поддерево (~188-375мс по PERF-комментариям R11, R13, R24,
   R25, R26, R27).
2. **`renderStatsBlock`** в `apps/web/heys_day_stats_v1.js:17` — функция-builder
   на **3389 строк, 622 `React.createElement`**, вызываемая из DayTab без
   мемоизации. Каждый вызов создаёт новые refs для всех meta-объектов
   (`debtCardMeta`, `excessStyleMeta`, `insightRowsMeta`, `vmComputed.*`).
3. **`statsVm.build()`** в `apps/web/heys_day_stats_block_v1.js:155` —
   вызывается без useMemo, поэтому все производные значения пересчитываются
   каждый рендер.
4. **0 `React.memo`** в `heys_day_stats_v1.js` / `heys_day_activity_v1.js` /
   `heys_supplements_v1.js` — listener-разработчики обходили перформанс через
   `React.startTransition` (поверх каждого `setX`), а не через структурные
   изменения.

В клиентской сессии (когда нет фоновой работы — leaderboard, мессенджер
unread-counts, sync статусы) транзишены успевают применяться, и UI работает. В
курaторской сессии (фоновый poll, badges, мессенджер inbox, leaderboard
компетишены) очередь срочных задач почти всегда не пустая, и React
**отбрасывает** низкоприоритетные транзишены → tap «уходит в никуда».

## Что уже сделано (костыли)

| Коммит     | Что                                                                             | Цена                                      |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `65f8259c` | advice: drop startTransition                                                    | 100-200мс freeze на открытие модалки      |
| `33f2f18f` | meals: drop startTransition в expand product list                               | 188мс freeze на раскрытие приёма          |
| `<today>`  | stats × 4, activity × 1, main_block × 1, supplements × 1 — drop startTransition | 188-375мс freeze на каждый из 7 tap-paths |

Все 8 tap-paths теперь **надёжно работают в курaторской сессии**, но с
**заметным freeze'ом** на старых телефонах. На современных устройствах freeze не
ощутим — система воспринимается как «нормальная».

## Почему «просто extract + memo» не работает

Прямая extraction (создание `<BalanceCardSection>` / `<PopupsContainer>` +
обёртка в `React.memo`) **не даст perf-win** без сопутствующего vm-рефактора.
Причина:

- `vmComputed` (где живут `excessStyleMeta`, `debtCardMeta`, `insightRowsMeta`,
  etc.) строится внутри `statsVm.build()` на каждый вызов
- `statsVm.build()` зовётся каждый рендер DayTab
- Любой setState в DayTab → новый `vmComputed` → новые refs для всех
  sub-объектов
- `React.memo` с shallow equal **никогда не пройдёт** для props, ссылающихся на
  `vmComputed.*` → memo no-op
- Net effect: extraction без vm-memoization = пустая трата времени, perf не
  меняется

## Правильный refactor (8-12 часов)

### Step 1 — Decouple `balanceCardExpanded` и popup-state от `statsVm`

**Файлы:** `apps/web/heys_day_stats_block_v1.js:155`,
`apps/web/heys_day_stats_vm_v1.js:2142` (точка определения `dayStatsVm.build`).

**Действие:** Убрать из inputs `statsVm.build()`:

- `balanceCardExpanded, showConfetti, shakeEaten, shakeOver` — UI-state, не data
- Все 11 popup-state значений (`sparklinePopup`, `macroBadgePopup`, ...,
  `debtSciencePopup`) — они не должны участвовать в pre-computation
- `chartTransitioning, insulinExpanded, mealChartHintShown, newMealAnimatingIndex, showFirstPerfectAchievement`
  — UI/animation state

Эти значения переходят в leaf-компоненты НАПРЯМУЮ от DayTab, минуя statsVm.

**Что внутри statsVm зависит от этих UI-state?** Нужно отчётно проверить (grep
`balanceCardExpanded` в vm файле) — все expanded-aware styles надо переписать
так, чтобы готовить style для обоих режимов сразу, а leaf-компонент выбирал по
prop.

**Effort:** 2-3 часа

### Step 2 — Memoize `statsVm.build()` на стороне DayTab

**Файл:** `apps/web/heys_day_tab_impl_v1.js:1775`.

**Действие:** Обернуть `HEYS.dayStatsBlock.buildStatsBlock({...})` в
`useMemo(() => ..., [explicit-deps])`. После Step 1 — deps будут только
data-инпуты (day, prof, dayTot, eatenKcal, etc.), без UI-state.

Это даёт **первый перформенс-win**: vmComputed.\* refs становятся стабильными
между рендерами когда data не менялась.

**Effort:** 1 час (включая identification всех deps)

### Step 3 — Extract `<BalanceCardSection>`

**Новый файл:** `apps/web/heys_day_balance_card_v1.js` (~500 строк — debt-card

- caloric-excess в одном файле).

**Изменяем:** `apps/web/heys_day_stats_v1.js:769-1256` — заменить два IIFE блока
на `React.createElement(HEYS.dayBalanceCard.BalanceCardSection, {...})`.

**Props (~17 штук):** `balanceCardExpanded` + `onToggleExpand` (useCallback в
DayTab) + все vmComputed.\* refs которые после Step 2 будут стабильны +
handler'ы `onShowDebtInfo`, `onShowSciencePopup`, `onShowBalanceDay`,
`selectDateWithPrefetch`.

**Обернуть в `React.memo`** без custom comparator (shallow equal сработает после
Step 1+2).

**Effort:** 3-4 часа

### Step 4 — Extract `<PopupsContainer>`

**Новый файл:** `apps/web/heys_day_popups_container_v1.js` (~900 строк — все 11
popup-render блоков).

**Изменяем:** `apps/web/heys_day_stats_v1.js:1259-2648` — заменить блок на
`React.createElement(HEYS.dayPopupsContainer.PopupsContainer, {...})`.

**Props (~30):** 11 popup states + 11 setters + helpers
(`getSmartPopupPosition`, `PopupWithBackdrop`, `ReactDOM`, etc.) + data-deps.

**Обернуть в `React.memo`**. Custom comparator может понадобиться если есть
non-stable data-deps.

**Также:** в `apps/web/heys_day_popups_state_v1.js` — drop `startTransition` из
`closeAllPopups`, `openExclusivePopup`, `handleClickOutside` (теперь безопасно:
re-render локализован в PopupsContainer).

**Effort:** 3-4 часа

### Step 5 — Verify + cleanup

1. `pnpm dev:local` → курaтор → клик на каждом из 8 tap-paths
2. React DevTools Profiler → засечь re-render — должно быть **<50мс** (vs
   текущие 188-375мс)
3. `pnpm test` зелёный
4. **Удалить временные комментарии** «2026-05-28: dropped startTransition» из 8
   файлов — они становятся не нужны, потому что freeze исчез
5. `pnpm bundle:legacy` → bundle size — не должен значимо вырасти

**Effort:** 1 час

## Order

1, 2, 3, 4, 5 — **строго последовательно**. Каждый шаг можно коммитить отдельно,
но Step 3 и Step 4 не имеют смысла без Step 1+2 (memo no-op без стабильных
refs).

## Risk

- **Step 1 особенно рискован**: balanceCardExpanded и popup-state могут быть
  глубже завязаны в vm чем кажется. Нужен thorough grep перед началом.
- **Bundle size**: после extraction добавится 2 новых файла, общий код может
  вырасти +5-15KB. Не критично.
- **Регрессия в data computations**: если что-то в statsVm зависело от
  expanded-state (например, debt-card height calculated for expanded view) — при
  decoupling нужно пересмотреть. Mitigation: visual regression тест перед
  релизом.

## Out of scope

- **Полная замена `usePopupsState` на per-popup hooks** — overkill для текущей
  цели.
- **Перевод renderStatsBlock из функции в компонент** — большой риск, не нужен.
  Function-builder + memo на leaf-компонентах работает.
- **Tier-🟡 и 🟢 кейсы startTransition** (heys_widgets_ui_v1.js,
  heys_day_effects.js, etc.) — оставляем как есть.

## Verification

После всех 5 шагов:

1. `pnpm dev:local` → войти курaтором → открыть Александру → потыкать все 8
   tap-paths → должны срабатывать **без freeze'а** (<50мс)
2. PIN-вход клиента → те же 8 действий работают (regression check)
3. React Profiler → засечь время re-render при тапе на macro-badge → ожидаем
   <50мс
4. `pnpm test` зелёный
5. `pnpm bundle:legacy` → bundle size delta <15KB
