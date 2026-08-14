# Аудит макета «Добавление еды» (APS v4) — полный

**Канон:** [`canvas/Добавление еды.dc.html`](canvas/Добавление%20еды.dc.html)  
**Дата:** 2026-08-14 (глубокий проход) · **Код проверен:**
`heys_meal_step_v1.js`, `heys_add_product_step_v1.js`,
`heys_day_add_product.js`, `day/_meals.js`, `heys_step_modal_v1.js`,
`600-steps-and-aps.css`

## Легенда статусов

| Статус          | Значение                                                 |
| --------------- | -------------------------------------------------------- |
| **match**       | структура, иерархия, copy и CTA совпадают с канвасом     |
| **partial**     | экран есть, заметные расхождения по copy/UI/иерархии     |
| **mismatch**    | другой UX, экран отсутствует или legacy-оболочка         |
| **intentional** | осознанное отличие (зафиксировано в коде/тестах/канвасе) |
| **n/a**         | reference-лист канваса, не целевой runtime-экран         |

## Охват канваса

| Метрика                       | Значение                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Вхождений `data-screen-label` | **34**                                                                                |
| Уникальных меток              | **33**                                                                                |
| Целевых runtime-экранов       | **~27** (без reference-листов B/C, «исходы», «штрихкод · состояния», дубля вредности) |

### Сводка по статусам (33 уникальных метки, факт кода 2026-08-14)

| Статус            | Кол-во | Комментар                                                                             |
| ----------------- | ------ | ------------------------------------------------------------------------------------- |
| match             | 9      | happy path meal 1–3, search, grams, load_failed, exit, preset save, product not saved |
| partial           | 17     | edges, summary, presets, barcode, create step1, photo grid, moderation outcomes…      |
| mismatch          | 4      | portions step2, harm step3, photo viewer, barcode states sheet                        |
| intentional / n/a | 3      | fork способа, состав B/C                                                              |

---

## A. Основной флоу (9 экранов)

| #   | Экран канваса                  | Код                                                               | Статус          | Совпадает                                                                                           | Расходится                                                                                                                                                     |
| --- | ------------------------------ | ----------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Добавление · гард даты**     | `day/_meals.js` → `confirmMealCreationDate()` + `MealDateWarning` | **partial**     | «Внимание», «Приём запишется на …», «Перейти на сегодня», ghost «Всё равно продолжить»; sand tokens | Modal до StepModal, **нет progress dots 0/3**; не hero-card внутри meal-create shell                                                                           |
| A2  | **Добавление · время и тип**   | `heys_meal_step_v1.js` → `MealTimeStepComponent`                  | **match**       | «Новый приём», hero «Время», 6 chips, wave plaque, dots 1/2, CTA wave-ветка                         | Hint «Тип предложен по времени…» под grid отсутствует                                                                                                          |
| A3  | **Добавление · самочувствие**  | `MealMoodStepComponent`                                           | **match**       | 3 шкалы, tier «Что повлияло», chips, «Дальше», «Сохранить приём без оценок», dots 2/2               | Minor line-height подписей; нет отдельного journal block                                                                                                       |
| A4  | **Добавление · выбор способа** | **skip** → сразу `ProductSearchStep`                              | **intentional** | Поиск+tabs+barcode на search step                                                                   | Fork снят (`meal-add-flow-v4-structure.test.js`)                                                                                                               |
| A5  | **Добавление · поиск**         | `ProductSearchStep`                                               | **match**       | Header «Тип · время», search+barcode, tabs, rows, harm stripe, footnote                             | Focus ring partial vs canvas inset                                                                                                                             |
| A6  | **Добавление · порция**        | `GramsStep`                                                       | **match**       | Hero «Сколько», ±, chips, impact, duplicate warn, «Добавить в приём»                                | ★ fav в header есть в code, нет в canvas; CTA не pinned footer shelf                                                                                           |
| A7  | **Добавление · приём собран**  | `MealSummaryV4Step` + wiring `_meals.js`                          | **partial**     | Hero kcal, list, «Добавить ещё», «Сохранить как набор», «Готово», `aps-v4-btn-paper`                | Canvas «В приёме» → code «**Итого за приём**» (canvas screen 17 uses «Итого» — OK). Нет footnote «фото принадлежит приёму»; thumb без time overlay/delete 44px |
| A8  | **Добавление · наборы**        | Tab + `MealPresetsOverlay`                                        | **partial**     | Title «Наборы», «Править», «Замечено в истории», sand list, text CTAs                               | Preview/edit экран (#8) ещё legacy `mpr-preview-*`                                                                                                             |
| A9  | **Добавление · правка набора** | `MealPresetsOverlay` → `renderPreview()`                          | **partial**     | Preview состава, multiplier, per-item grams, CTA «Добавить N · X ккал»                              | Legacy `mpr-preview-*` shell; grams UI vs canvas pills                                                                                                         |

---

## B. Edge-состояния поиска (4 экрана)

| #   | Экран                           | Код                                                                       | Статус      | Совпадает                                                            | Расходится                                                                                                                   |
| --- | ------------------------------- | ------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Поиск · база пуста**          | `renderApsSearchEmptyState('empty_base')`                                 | **partial** | Search bar, «Искать в общей базе», «Создать продукт», tier checklist | Title/body copy ≠ canvas hero «Здесь появятся…»; **primary order inverted** (create first); нет tier «Или сразу» scan/create |
| B2  | **Поиск · база не загрузилась** | `renderApsSearchEmptyState('load_failed')`                                | **match**   | Warn card, «Повторить», «Создать продукт», tier «Доступно сейчас»    | Body короче canvas                                                                                                           |
| B3  | **Поиск · ничего не найдено**   | `renderApsSearchEmptyState('no_results')` + `findSimilarPersonalProducts` | **partial** | Focus ring `is-focused`, «Близкое по названию», create CTA           | Title «Ничего не найдено» vs «По этому запросу…»; similar = ghost buttons, не product rows                                   |
| B4  | **Поиск · офлайн**              | `renderApsSearchEmptyState('offline')`                                    | **partial** | Sage card, checklist ✓/✗                                             | Нет copy «приём сохранится и уйдёт в облако»; tier не product rows                                                           |

---

## C. Штрихкод (4 экрана + reference)

| #   | Экран                    | Код                                      | Статус       | Совпадает                                              | Расходится                                                                                              |
| --- | ------------------------ | ---------------------------------------- | ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| C1  | **Штрихкод · наведение** | `BarcodeScannerModal` fullscreen         | **partial**  | Dark overlay, finder corners, title «Штрихкод», X      | Subtitle «Держите ровно…» нет; manual = inline input, не pinned «Ввести код цифрами»                    |
| C2  | **Шtрихкод · не найден** | `aps-barcode-not-found-screen` in search | **partial**  | Code display, «Такого продукта нет…», create with code | Inline в search, не full screen; нет «Сканировать ещё» / «Искать по названию»                           |
| C3  | **Штрихкод · найден**    | `barcodeNotice` → `GramsStep`            | **partial**  | Sage banner «Найден по штрихкоду», skip to portion     | Canvas = banner+hero+grams **на одном экране**; code = два шага                                         |
| C4  | **Штрихкод · состояния** | Generic `aps-barcode-error`              | **mismatch** | Manual entry exists                                    | Нет веток: unread, multi-match list, no camera, network timeout; нет pinned footer «Ввести код цифрами» |

---

## D. Фото (2 экрана)

| #   | Экран                   | Код                                            | Статус       | Совпадает                                                     | Расходится                                                                                         |
| --- | ----------------------- | ---------------------------------------------- | ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | **Приём собран · фото** | `MealSummaryV4Step` photo tier+grid            | **partial**  | Tier «Фото приёма», dashed add, thumb grid, wired `_meals.js` | Нет time overlay на thumb; delete overlay 44px partial; footnote про meal-level photo              |
| D2  | **Фото · просмотр**     | `heys_day_gallery.js` → `HEYS.showPhotoViewer` | **mismatch** | Fullscreen, swipe, delete callback                            | Legacy black inline styles; **не v4 dark `#141210`**; нет dots, «Ещё снимок», meal caption styling |

---

## E. Создание продукта (8 экранов + variants)

| #   | Экран                               | Код                                         | Статус               | Совпадает                                                        | Расходится                                                                                                                                                                                                                               |
| --- | ----------------------------------- | ------------------------------------------- | -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **Продукт · состав**                | `CreateProductStep` v4 form                 | **partial**          | Dots 1/3, fields name/brand/macros, «Далее», paste second layer  | Title «Продукт · состав» vs canvas «**Название и состав**»; нет «Состав подробнее» 6-field expand; **все 4 macro editable** (canvas A: kcal/fat/carbs auto); extra **mode selector persist/oneTime**, barcode block; CTA не pinned shelf |
| E2  | **Продукт · шаг 2** (порции)        | `PortionsStep`                              | **mismatch**         | Subtitle skip hint, skip/next actions                            | **No v4 dots**; emoji header 🥣; `aps-portions-*` legacy; chips «Рекомендованные» vs canvas row list                                                                                                                                     |
| E3  | **Продукт · вредность и модерация** | `HarmSelectStep`                            | **mismatch**         | Logic: system harm, publish, moderation outcomes                 | **Legacy `harm-select-step`**; no v4 dots step 3; no sage calc card layout; **no radio** system/custom; no tier «Куда попадёт продукт» before save                                                                                       |
| E4  | **Продукт · состав A**              | Target = E1                                 | **n/a**              | Reference accepted 2026-08-11                                    | Auto-readonly macros, «Состав подробнее» — **not implemented**                                                                                                                                                                           |
| E5  | **Продукт · состав B**              | —                                           | **intentional skip** | —                                                                | Rejected: 9 fields on one screen                                                                                                                                                                                                         |
| E6  | **Продукт · состав C**              | Paste layer only                            | **intentional skip** | Paste preserved                                                  | Rejected as primary; AI prompt in paste layer (canvas says remove)                                                                                                                                                                       |
| E7  | **Продукт · исходы заявки**         | `ProductModerationOutcomeView`              | **partial**          | 5 outcome keys in logic                                          | Canvas = **reference sheet all 5**; runtime shows one dynamic outcome; not v4 card set                                                                                                                                                   |
| E8  | **Продукт · не сохранён**           | `ProductCommitErrorView`                    | **match**            | Hero, checklist «на месте», «Повторить», «Сохранить только себе» | Secondary not `aps-v4-btn-paper`; footer shelf partial                                                                                                                                                                                   |
| E9  | **Продукт · ждёт отправки**         | `pendingProductQueue` + diary `NotSentChip` | **partial**          | Queue mechanics exist                                            | Canvas badge **in search row** («только у вас» + clock); code chip on **diary**, not APS search                                                                                                                                          |

---

## F. Наборы (5 экранов)

| #   | Экран                          | Код                                     | Статус      | Совпадает                                                                                               | Расходится                                                                                                             |
| --- | ------------------------------ | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F1  | **Наборы** (standalone)        | `MealPresetsOverlay` list               | **done**    | «Замечено в истории», frequency, «N продуктов · X ккал», «Мои наборы», «Править», «Собрать новый набор» | Edit mode + footnote; preview (#8) отдельно                                                                            |
| F2  | **Набор · сохранение**         | `saveConfirmOpen` dialog                | **match**   | Name field, composition preview, Cancel/Save, `aps-v4-preset-confirm`                                   | Dynamic item count in body                                                                                             |
| F3  | **Набор · удаление**           | `deleteConfirmPreset` dialog            | **partial** | Title, name, boundary copy, Cancel                                                                      | Canvas: Delete = **attention bg `#f0dcc6`**, not primary — code uses **`aps-v4-btn-primary`** (**mismatch** hierarchy) |
| F4  | **Набор · сборка**             | `MealPresetsOverlay` → `renderCreate()` | **partial** | Search, running list, name, save                                                                        | Title «Создать набор» vs «**Новый набор**»; no «Итого» hero card; legacy styling                                       |
| F5  | **Добавление · правка набора** | см. A9                                  | **partial** | —                                                                                                       | —                                                                                                                      |

---

## G. Exit (1 экран)

| #   | Экран                       | Код                                                     | Статус    | Совпадает                                                                             | Расходится                       |
| --- | --------------------------- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| G1  | **Выход · есть что терять** | `ApsExitDialog` + `useApsCloseGuard` + `onRequestClose` | **match** | Title, body with product+grams, «Остаться» primary, ghost exit; X/backdrop/back wired | Example copy differs dynamically |

---

## H. Слои вне canvas (runtime, не отдельные `data-screen-label`)

| Слой                  | Файл                                 | В канвасе?  | Статус           | Заметка                                                        |
| --------------------- | ------------------------------------ | ----------- | ---------------- | -------------------------------------------------------------- |
| Paste layer create    | `CreateProductStep` `showPasteLayer` | Да (кнопка) | partial          | Legacy 12-field paste + AI prompt — canvas rejects AI mid-flow |
| Create mode selector  | persist / oneTime                    | **Нет**     | extra            | Не в канвасе                                                   |
| Barcode manager       | `ProductBarcodeManagerModal`         | Нет         | n/a              | Edit barcodes on existing product                              |
| Product edit flows    | `openProductPortionsEditor`          | Нет         | n/a              | Reuses `PortionsStep`                                          |
| Plate guide           | `_meals.js`                          | Debt note   | intentional debt | Canvas: move to first-meal empty                               |
| Auto-repeat / «ещё N» | removed                              | Removed     | intentional      | Structure test confirms                                        |
| Similar harm warn     | `aps-similar-warn`                   | Нет         | extra            | On harm step                                                   |
| Structure tests       | `add-product-*-v4-structure.test.js` | —           | partial          | Edge/exit covered; **harm/portions v4 not**                    |

---

## I. Сквозные расхождения

| Тема                   | Канвас                            | Факт                                            | Статус                                                                |
| ---------------------- | --------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Meal-create shell dots | 0–2 in StepModal                  | Steps 1–2 OK                                    | partial (guard outside)                                               |
| Create 3-step dots     | All 3 steps                       | Only step 1 v4 shell                            | mismatch                                                              |
| Pinned footer CTA      | «Дальше», «Добавить», error retry | Scrolls with content on several steps           | partial                                                               |
| v4 tokens              | `--v4-sand-*`, `aps-v4-*`         | APS core OK                                     | partial — `mpr-*`, `harm-select-step`, `aps-portions-*`, photo viewer |
| Hardcoded hex          | 0 in v4 APS                       | `#efe3cf` in `.flow-selection-btn__barcode-tap` | partial                                                               |
| Dark camera/viewer     | Explicit `#141210`                | Scanner partial; viewer legacy black            | partial                                                               |

---

## J. Приоритет следующего выравнивания

| P      | Зона                                       | Статус (2026-08-14, вечер)                                                                                                                |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | `HarmSelectStep` + `PortionsStep` v4 shell | **закрыто** — dots 2/3, sage card, radio, tier модерации, pinned «Сохранить продукт»; порции row-list + footer                            |
| **P1** | `CreateProductStep` → variant A            | **закрыто** — «Название и состав», auto kcal/fat/carbs, «Состав подробнее», pinned «Далее», mode/barcode во «Дополнительно»               |
| **P2** | Photo viewer v4 + thumb delete/time        | **закрыто** — `#141210` viewer, thumb time/delete 44px, footnote приёма                                                                   |
| **P3** | Barcode states sheet + multi-match         | **частично** — multi-match tier + not-found «Сканировать ещё»/«Искать по названию» + camera copy; full states sheet vs canvas ещё partial |
| **P4** | Edge copy/order empty_base/offline         | **закрыто** — primary «Искать в общей базе», offline sync copy                                                                            |
| **P5** | Preset delete CTA hierarchy                | **закрыто** — `aps-v4-btn-attention`                                                                                                      |

**Проверка контрактов:**
`pnpm exec vitest run apps/web/__tests__/add-product-*-v4-structure.test.js apps/web/__tests__/meal-*-v4-structure.test.js`
— 29/29 green (2026-08-14).

---

## K. Закрыто в коде (2026-08-14)

Summary photo/preset wiring, exit guard all channels, 4 search edges (skeleton),
barcode fullscreen+not-found, create step1 form+dots, preset save/delete
confirms, «Замечено в истории», structure tests edge layer.

**Вечерняя доработка:** PortionsStep/HarmSelectStep/CreateProductStep v4 shell,
photo viewer+summary thumb polish, barcode multi-match tier + not-found
secondary CTA, empty_base/offline copy, preset delete attention button,
`add-product-create-harm-portions-v4-structure.test.js`.
