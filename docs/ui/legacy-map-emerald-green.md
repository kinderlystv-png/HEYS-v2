# Legacy map: `--color-emerald-*` + `--color-green-*`

Анализ только. Код не менялся. Зона **731-ui-v4-activity.css** и
**300-modals-and-day.css** не трогалась — вхождения там перечислены как
отложенные.

Дата: 2026-09-03. Task 29.

## Scope

| Область               | Что считали                                                           |
| --------------------- | --------------------------------------------------------------------- |
| Основной              | `apps/web/styles/`                                                    |
| Product modules       | `apps/web/styles/modules/` без `731-*` и `300-modals*`                |
| Исключено из правок   | `731-ui-v4-activity.css`, `300-modals-and-day.css`                    |
| Отдельно              | `apps/web/styles/tailwind.css` (generated Tailwind theme + utilities) |
| Вне `apps/web/styles` | только заметка; не входит в миграцию product CSS                      |

Семантика v4 — из комментариев и ролей в
`apps/web/styles/modules/002-ui-v4-palette-roles.css` (`--v4-ok-text`,
`--v4-ok-fill`, `--v4-on-ok-fill`, `--v4-ok-bg`, `--v4-good`, `--v4-act` /
`--v4-act-text`), не по близости оттенка.

## rg-сводка (проверено)

Команды (PowerShell, из корня репо):

```text
rg -e "--color-emerald-" apps/web/styles/modules/ --glob "!731*" --glob "!300-modals*" --count-matches
rg -e "--color-green-" apps/web/styles/modules/ --glob "!731*" --glob "!300-modals*" --count-matches
rg -e "--color-emerald-[0-9]+" apps/web/styles/modules/ --glob "!731*" --glob "!300-modals*" -o --no-filename
rg -e "--color-emerald-" apps/web/styles/modules/300-modals-and-day.css -c
rg -e "--color-emerald-" apps/web/styles/tailwind.css --count-matches
rg -e "--color-green-" apps/web/styles/tailwind.css --count-matches
```

| Срез                                                 | `--color-emerald-*` | `--color-green-*` |
| ---------------------------------------------------- | ------------------: | ----------------: |
| Product modules (без 731 / 300-modals)               |    **37** вхождений |             **0** |
| Отложено: `300-modals-and-day.css`                   |               **7** |                 0 |
| Generated `tailwind.css`                             |              **27** |            **18** |
| Сумма `apps/web/styles/` (все файлы, без исключений) |                 64+ |                18 |

Оценка «~87» для пары семейств близка к **37 + 7 + 27 + 18 = 89** совпадений в
`apps/web/styles/` (часть — declarations и utility-классы Tailwind, не
product-правила).

В product modules используются только шаги **400, 500, 600, 700** emerald. Шаги
50–300 emerald и все green-шаги в modules **не читаются** — они живут только в
`tailwind.css`.

---

## Семейство `--color-emerald-*` (product modules)

### Шаги и счётчики

| Токен                 | Вхождений | Файлы                                                                                                                                                              |
| --------------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--color-emerald-500` |        31 | `000-base-and-gamification.css` (9), `500-pwa-and-offline.css` (15), `100-metrics-and-graphs.css` (3), `200-dark-and-effects.css` (3), `600-steps-and-aps.css` (2) |
| `--color-emerald-700` |         4 | `400-water-and-hydration.css` (4)                                                                                                                                  |
| `--color-emerald-400` |         1 | `500-pwa-and-offline.css` (1)                                                                                                                                      |
| `--color-emerald-600` |         1 | `500-pwa-and-offline.css` (1)                                                                                                                                      |

Две строки — **объявления/алиасы**, не paint:

- `000-base-and-gamification.css:147` — `--color-emerald-500: #10b981`
- `200-dark-and-effects.css:52` —
  `--color-emerald-500: var(--v4-ok-text, #4ade80)`

### Разбивка по kind (product modules)

Считаются **свойства**, не строки: одна строка с `color` и `border-color` даёт
два kind.

| Токен                 |   text | fill+background | line+border | shadow |
| --------------------- | -----: | --------------: | ----------: | -----: |
| `--color-emerald-500` |      9 |              17 |           7 |      0 |
| `--color-emerald-700` |      4 |               0 |           0 |      0 |
| `--color-emerald-400` |      0 |               1 |           0 |      0 |
| `--color-emerald-600` |      1 |               0 |           0 |      0 |
| **Итого paint**       | **14** |          **18** |       **7** |  **0** |

### Предлагаемые v4-роли (step + kind)

| Токен | kind | Контекст (селектор / зона)                                                                                           | Предлагаемая роль                       | Почему (семантика, не цвет)                                                                                              |
| ----- | ---- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 500   | def  | `:root` legacy alias в `000-base`                                                                                    | **удалить alias** после миграции usages | Не роль набора; дублирует снятую Tailwind-палитру                                                                        |
| 500   | def  | dark remap в `200-dark`                                                                                              | **оставить мост** → `--v4-ok-text`      | Уже явный alias на ok-чернила в тёмных наборах                                                                           |
| 500   | text | `.cloud-sync-indicator.synced`                                                                                       | `--v4-ok-text`                          | Статус «синхронизировано» = позитивный текст                                                                             |
| 500   | text | `.day-score-preset-good.active`                                                                                      | `--v4-ok-text`                          | Пресет «хорошо» в оценке дня                                                                                             |
| 500   | text | `.mc-wheel-item.active`, `.household-example` (база)                                                                 | `--v4-act-text`                         | Контракт food-meal / home-widgets: зелёный emerald в колесе — **тон снятой системы**; выбранное значение = акцент `--ac` |
| 500   | text | `.household-example:hover` → 600                                                                                     | `--v4-ok-text`                          | Усиление ok-чернил на hover, не новый смысл                                                                              |
| 500   | fill | `.sync-toast.restored`, `.hdr-backup-dot`, `.mc-progress-dot.*`, `.game-weekly-card.completed .weekly-progress-fill` | `--v4-ok-fill`                          | Завершение / успех / прогресс «сделано»                                                                                  |
| 500   | fill | `.offline-reconnected-banner` (gradient), `.mc-btn-next`, `.mc-btn--primary` (gradient)                              | **развилка**                            | Зелёная **главная** кнопка vs зелёный **успех** — см. forks                                                              |
| 500   | fill | `.week-heatmap-day.perfect`                                                                                          | `--v4-good` или `--v4-ok-fill`          | «Идеальный» день; сосед `.green` уже на `--v4-ok-fill` — см. forks                                                       |
| 500   | fill | `.yesterday-quick-btn.active`, `.today-quick-btn.active`                                                             | **развилка**                            | Активный чип даты: акцент навигации vs ok                                                                                |
| 500   | fill | `.mc-progress-fill` (gradient с blue)                                                                                | `--v4-ok-fill`                          | Доля выполненного в многошаговом flow                                                                                    |
| 500   | line | `.goal-progress-bar.pulse-perfect` (+ keyframes)                                                                     | `--v4-ok-fill`                          | Пульс «идеально по цели» — ok-акцент, не разделитель                                                                     |
| 500   | line | `.yesterday-quick-btn.active` border                                                                                 | как fill-пара                           | Совпадает с заливкой активного чипа                                                                                      |
| 500   | line | `.household-size-dot` border                                                                                         | `--v4-ok-fill`                          | Маркер выбранного размера порции                                                                                         |
| 500   | line | `.mc-sleep-comment-input:focus`                                                                                      | `--v4-act` или `--v4-ok-fill`           | Focus ring: акцент поля vs ok — см. forks                                                                                |
| 700   | text | `.advice-list-header-link--read-all`, hover                                                                          | `--v4-ok-text`                          | Текстовая ссылка «прочитать всё» в списке советов                                                                        |
| 700   | text | `.water-cell` filled state                                                                                           | `--v4-ok-text`                          | Заполненная ячейка трекера воды                                                                                          |
| 700   | text | badge gradient block (рядом с ok-bg)                                                                                 | `--v4-on-ok` на `--v4-ok-bg`            | Текст на светлом ok-подложке, не сплошная заливка                                                                        |
| 400   | fill | `.mc-progress-dot.completed`                                                                                         | `--v4-ok-fill-soft` / `--v4-ok-fill`    | Завершённый шаг; мягче active/current                                                                                    |
| 600   | text | `.household-example:hover`                                                                                           | `--v4-ok-text`                          | Hover усиление ok-чернил                                                                                                 |

---

## Семейство `--color-green-*`

В **product modules** (без 731 / 300-modals) вхождений **0**.

Все 18 совпадений в `apps/web/styles/tailwind.css`:

| Токен               | Совпадений в tailwind |
| ------------------- | --------------------: |
| `--color-green-500` |                     5 |
| `--color-green-50`  |                     2 |
| `--color-green-100` |                     2 |
| `--color-green-400` |                     3 |
| `--color-green-600` |                     2 |
| `--color-green-700` |                     2 |
| `--color-green-800` |                     2 |

Это **Tailwind theme + utility** (`bg-green-500`, `text-green-600`,
`border-green-500`, …), не HEYS legacy alias из `000-base`. Миграция product v4
**не начинается** с замены этих строк: scope — landing/admin React через
Tailwind classes; отдельный контур, если классы реально рендерятся в product UI.

Вне репо-product: `lighthouse-report.html` — 3× `--color-green-700` (артефакт
отчёта, не трогать).

Предлагаемая роль **если** конкретный utility-класс окажется в живом
product-дереве:

| kind | Роль                                                         |
| ---- | ------------------------------------------------------------ |
| text | `--v4-ok-text`                                               |
| fill | `--v4-ok-fill` или `--v4-ok-bg` (по контрасту фона)          |
| line | `--v4-ok-fill` или `--v4-edge` (если разделитель, не статус) |

---

## Отложено (forbidden scope)

`300-modals-and-day.css` — **7** вхождений `--color-emerald-500` (rg `-c`).
Сведение в зоне modals/day, не в этом map-спринте.

`731-ui-v4-activity.css` — **0** emerald/green legacy-токенов (rg).

---

## Tailwind generated (`tailwind.css`)

**27** emerald + **18** green совпадений — declarations в `@layer theme` и
ссылки в utility-классах. Не смешивать с 37 paint-вхождениями в modules: это
другой механизм (`var(--color-emerald-500)` внутри `.bg-emerald-500` и т.п.).

Рекомендация: при чистке modules **не** править `tailwind.css` в том же коммите;
если utility зелёный нужен на лендинге — оставить; product-зоны переводить на
`--v4-ok-*` / `--v4-act-*` в module CSS.

---

## Развилки для владельца (ambiguous forks)

Агент **не** выбирает — только фиксирует конфликт смысла.

| #   | Токен                           | Где                                                         | Конфликт                                                                                       | Варианты                                                                                                                |
| --- | ------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F1  | `--color-emerald-500` fill      | `.mc-btn-next`, `.mc-btn--primary`, offline banner gradient | Одна зелёная заливка несёт **primary CTA** и **success**                                       | **A** — главное действие → `--v4-act-fill` / gradient act · **B** — «вперёд/готово» как успех → `--v4-ok-fill`          |
| F2  | `--color-emerald-500` text/fill | `.mc-wheel-item.active`, старый wheel UI в `500-pwa`        | Контракт 31.08: emerald в колесе уходит; база уже `--v4-act-text` у `.mc-wheel-value--current` | **A** — вычистить emerald, всё выбранное → `--v4-act-text` · **B** — оставить зелёный только в wheel (против контракта) |
| F3  | `--color-emerald-500` fill      | `.week-heatmap-day.perfect` vs `.week-heatmap-day.green`    | «Perfect» на emerald, «green» на `--v4-ok-fill`                                                | **A** — perfect → `--v4-good` · **B** — perfect → `--v4-ok-fill` как green · **C** — объединить ступени heatmap         |
| F4  | `--color-emerald-500` fill+line | `.yesterday-quick-btn.active`, `.today-quick-btn.active`    | Активный быстрый выбор даты                                                                    | **A** — навигация → `--v4-act-fill` · **B** — «сегодня ок» → `--v4-ok-fill`                                             |
| F5  | `--color-emerald-500` line      | `.mc-sleep-comment-input:focus`                             | Focus ring                                                                                     | **A** — поле в flow → `--v4-act` · **B** — позитивный комментарий → `--v4-ok-fill`                                      |
| F6  | deferred                        | `300-modals-and-day.css` (7×)                               | Зона не разобрана в этом файле                                                                 | Свести в задаче modals/day; не переносить числа из этого map                                                            |

**Итого forks: 6** (5 в разрешённом scope + 1 отложенная зона).

---

## Краткий итог для миграции

1. Почти весь долг — **`--color-emerald-500`** (31/37) в gamification,
   PWA/meal-constructor, metrics, water.
2. **`--color-green-*`** в product CSS modules **нет**; green — контур
   Tailwind/лендинга.
3. Часть emerald уже **сознательно** мостится на `--v4-ok-text` в `200-dark`;
   остальное — legacy Tailwind green (#10b981), не роли песочного/синего набора.
4. Колесо и контракт food-meal/home-widgets: emerald **не** целевая роль —
   целевая `--v4-act-text` / `--ac`.
5. Перед массовой заменой закрыть forks F1–F5; `300-modals` — отдельный проход.
