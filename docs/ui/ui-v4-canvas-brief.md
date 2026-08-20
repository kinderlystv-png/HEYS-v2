# UI v4 · бриф контрактов канвасов

**Задача:** heys/90efc3  
**Дата сводки:** 2026-08-20 (v2 + блокировки макета 11:34)  
**Источник:** этот репо (`handoff-v4/`, `../implementation/*_V4_*`,
`UI_V4_IMPLEMENTATION_PLAN` §13.08 вечер, APS §J 14.08 вечер)  
**Назначение:** очередь имплементации, оценка часов, трекинг «структура /
краска» до совпадения с макетом.

**Таблицы §0–§3 (читаемый вид):**
[ui-v4-canvas-brief.html](./ui-v4-canvas-brief.html) — **генерируется** из этого
md: `pnpm docs:ui-v4-brief`

## Как читать

| Поле                   | Значение                                                        |
| ---------------------- | --------------------------------------------------------------- |
| **Структура / Краска** | ⬜ нет · 🟡 частично · ✅ да                                    |
| **Сложность**          | S <4ч · M 4–8 · L 8–16 · XL 16+                                 |
| **Часы**               | код + tests + smoke ревьюера (Composer по промпту)              |
| **🔒**                 | заблокировано: **сначала дизайн → контракты**; код не планируем |
| **Контракт**           | канвас (`data-v` / `data-screen-label`) + протокол или аудит    |

Правило волны v4: «готово» только когда **обе** колонки не ⬜. Исключение:
**волна Б** — тёмные палитры × 5 вкладок (план `:2032–2038`), отдельный проход
после токенов.

**Важно v2:** сверка с readiness-таблицей и APS §J — про **код**. **Владелец
20.08:** нижний список — макет и контракты **ещё не норм**; эти зоны **🔒
заблокированы** независимо от статуса в плане.

---

## 0. 🔒 Заблокировано: макет и контракты не готовы (владелец 20.08)

**Ворота:** `дизайн (канвас)` → `контракты (протокол / data-v)` → код. Пока 🔒 —
**не брать в фазы 0–4**, не считать в «~90%».

<table style="table-layout:fixed;width:100%">
<colgroup>
<col style="width:10%"><col style="width:22%"><col style="width:10%"><col style="width:10%"><col style="width:22%"><col style="width:8%">
</colgroup>
<thead><tr>
<th>Зона</th><th>Канвас / пакет</th><th>Макет</th><th>Контракт</th><th>Порядок</th><th>Статус</th>
</tr></thead>
<tbody>
<tr><td><strong>Советы</strong></td><td><code>Советы v4.dc.html</code></td><td>🟡 4/12</td><td>⬜</td><td><strong>1 дизайн</strong> → 2 контракт</td><td>🔒</td></tr>
<tr><td><strong>Цикл</strong></td><td><code>Цикл v4.dc.html</code></td><td>⬜ / архив</td><td>⬜</td><td>дизайн → контракт (если не removal)</td><td>🔒</td></tr>
<tr><td><strong>Добавление еды</strong></td><td><code>Добавление еды.dc.html</code></td><td>🟡</td><td>🟡 partial</td><td>дизайн → контракт</td><td>🔒</td></tr>
<tr><td><strong>Питание</strong></td><td><code>Дата и остатки</code> / дневник</td><td>🟡</td><td>🟡</td><td>дизайн → контракт</td><td>🔒</td></tr>
<tr><td><strong>Отчёты</strong></td><td><code>Отчёты и Инсайты v4</code></td><td>🟡</td><td>🟡</td><td>дизайн → контракт</td><td>🔒</td></tr>
<tr><td><strong>Инсайты</strong></td><td>то же / 2-й слой</td><td>🟡</td><td>🟡</td><td>дизайн → контракт</td><td>🔒</td></tr>
<tr><td><strong>Актив</strong></td><td>этап 4 · tabs-all</td><td>🟡</td><td>🟡</td><td>дизайн → контракт</td><td>🔒</td></tr>
<tr><td><strong>Геймификация</strong></td><td><code>Геймификация v4</code></td><td>🟡</td><td>🟡</td><td><strong>1 дизайн</strong> → 2 контракт</td><td>🔒</td></tr>
</tbody>
</table>

**Не заблокировано в этом списке** (можно кодить по протоколам): Главная
(`home-widgets`), регистрация/чек-ин, вода, вход, рама, спиннеры, куратор sheet,
PWA update.

_Если в таблицах §2–3 у 🔒-зоны стоит ✅ в коде — это **не разблокирует**;
снимаем 🔒 только после «канвас готов» + контракт в протоколе._

---

## 1. Инфраструктура (общая)

<table style="table-layout:fixed;width:100%">
<colgroup>
<col style="width:4%"><col style="width:17%"><col style="width:11%"><col style="width:5%"><col style="width:6%"><col style="width:5%"><col style="width:5%"><col style="width:47%">
</colgroup>
<thead><tr>
<th>#</th><th>Работа</th><th>Протокол</th><th>Сложн.</th><th>Часы</th><th>Стр.</th><th>Кр.</th><th>Статус / остаток</th>
</tr></thead>
<tbody>
<tr><td>1.1</td><td><code>[data-theme$="dark"]</code> + роли палитр</td><td>план п.1, <code>:1989</code></td><td>S</td><td>0</td><td>✅</td><td>🟡</td><td>Селектор <code>fee30ae6c</code> ✅; глазами 5 вкладок × 4 палитры — нет (волна Б)</td></tr>
<tr><td>1.2</td><td>Убрать каноничную палитру</td><td>план п.2</td><td>S</td><td>0–1</td><td>✅</td><td>✅</td><td>Код ✅; в канвасах <code>Вход v4</code>, <code>Скелетон v4</code> — блокер при буквальном коде</td></tr>
<tr><td>1.3</td><td>Рама: шапка, nav, 4 FAB</td><td>tabs-all, план п.3</td><td>S</td><td>2–4</td><td>✅</td><td>🟡</td><td>Prompt 3 ✅; хвост: nav icons, шапка геймиф., FAB-счётчик — owner smoke</td></tr>
<tr><td>1.4</td><td>Пикер палитры на входе (этап 5)</td><td>план <code>:2018–2019</code></td><td>S</td><td>0–2</td><td>✅</td><td>🟡</td><td>Закрыт в коде; canvas canonical — см. 1.2</td></tr>
<tr><td>1.5</td><td>Остаток CSS-литералов</td><td>план <code>:2007–2011</code></td><td>M</td><td>8–14</td><td>—</td><td>🟡</td><td>Главная: 13 ролей / 166 лит.; модалки/игры — фоном</td></tr>
<tr><td>1.6</td><td><code>--v4-btn-on-act</code> blue/blue-dark</td><td>ADD_FOOD audit</td><td>S</td><td>1–2</td><td>—</td><td>⬜</td><td>Заглушка в CSS; ждёт дизайнера (<code>:2040–2041</code>)</td></tr>
</tbody>
</table>

---

## 2. Контракты с протоколами (`design_handoff_heys_v4/` + canvas/)

<table style="table-layout:fixed;width:100%">
<colgroup>
<col style="width:4%"><col style="width:20%"><col style="width:4%"><col style="width:12%"><col style="width:5%"><col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:43%">
</colgroup>
<thead><tr>
<th>#</th><th>Канвас</th><th>Экр.</th><th>Протокол</th><th>Сложн.</th><th>Ч</th><th>Стр.</th><th>Кр.</th><th>Статус / остаток</th>
</tr></thead>
<tbody>
<tr><td>2.1</td><td><code>Спиннеры.dc.html</code></td><td>20</td><td>release-track-c</td><td>S</td><td>0–2</td><td>✅</td><td>🟡</td><td>Код + smoke 15.08 ✅; владелец ⬜ 19/20 (только «без подписи»)</td></tr>
<tr><td>2.2</td><td><code>curator-edits.v4.dc.html</code></td><td>7</td><td>CURATOR_CHANGELOG</td><td>S</td><td>0–1</td><td>✅</td><td>🟡</td><td>Спека + тесты ✅; smoke 4 палитры на проде</td></tr>
<tr><td>2.3</td><td><code>water-add.v4.dc.html</code></td><td>13</td><td>WATER_ADD_V4</td><td>S</td><td>1–2</td><td>✅</td><td>🟡</td><td>V₃ ✅; звук вне scope; плитка воды на Главной — старый 4px bar</td></tr>
<tr><td>2.4</td><td><code>registration.v4.dc.html</code> + Регистрация…</td><td>22</td><td>REGISTRATION_WELCOME</td><td>M</td><td>2–4</td><td>✅</td><td>🟡</td><td>Локально 79 canvas-тестов 16.08; push/deploy, empty tab, series mark — не в PR</td></tr>
<tr><td>2.5</td><td><code>checkin-morning.v4.dc.html</code></td><td>33</td><td>MORNING_CHECKIN_V4</td><td>M</td><td>2–4</td><td>✅</td><td>🟡</td><td>33/33 parity в коде; debt: dark/blue QA, series mark в истории</td></tr>
<tr><td>2.6</td><td><code>home-widgets.v4.dc.html</code></td><td>74</td><td>HOME_WIDGETS_V4</td><td>XL</td><td>12–22</td><td>🟡</td><td>🟡</td><td>19.08 struct pass; canvas 14:12 отстаёт; paint ≈1.5 дня</td></tr>
<tr><td>2.7</td><td><code>pwa-update.v4.dc.html</code></td><td>3+</td><td>ПРОМПТ PWA</td><td>S</td><td>0–1</td><td>✅</td><td>🟡</td><td>19.08 + тесты; контраст 3 тёмных тем; dead badge/toast — отдельно</td></tr>
</tbody>
</table>

---

## 3. Пять вкладок и общие экраны

<table style="table-layout:fixed;width:100%">
<colgroup>
<col style="width:4%"><col style="width:22%"><col style="width:5%"><col style="width:14%"><col style="width:5%"><col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:42%">
</colgroup>
<thead><tr>
<th>#</th><th>Канвас / зона</th><th>Экр.</th><th>Документ</th><th>Сложн.</th><th>Ч</th><th>Стр.</th><th>Кр.</th><th>Статус / остаток</th>
</tr></thead>
<tbody>
<tr><td>3.1</td><td><code>tabs-all.v4.dc.html</code></td><td>28</td><td>IMPLEMENTATION_PLAN</td><td>S</td><td>1–2</td><td>✅</td><td>🟡</td><td>Рама на проде; polish = 1.3</td></tr>
<tr><td>3.2</td><td><code>Дата и остатки v4.dc.html</code></td><td>~15</td><td>OPEN_QUESTIONS</td><td>S</td><td>2–4</td><td>✅</td><td>🟡</td><td>Календарь ✅ 11.08; past-day ✅ 14.08; sticky scroll — канваса нет</td></tr>
<tr><td>3.3</td><td>Актив · этап 4</td><td>4×</td><td>план <code>:1983</code></td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: макет+контракт; код 10.08 не разблокирует</td></tr>
<tr><td>3.4</td><td>Вкладка Питание (не APS)</td><td>—</td><td>план <code>:1984</code></td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: вкладка не в макете/контракте</td></tr>
<tr><td>3.5</td><td><code>Добавление еды.dc.html</code></td><td>33</td><td>APS_LAYOUT_AUDIT</td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: флоу в макете не норм; APS §J не в scope</td></tr>
<tr><td>3.6</td><td><code>Отчёты и Инсайты v4.dc.html</code></td><td>много</td><td>план 4b/4c</td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: отчёты + инсайты — дизайн → контракт</td></tr>
<tr><td>3.7</td><td><code>Советы v4.dc.html</code></td><td>4+8</td><td>designer prompt</td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: сначала дизайн (8 экр.), потом контракты</td></tr>
<tr><td>3.8</td><td><code>Геймификация v4.dc.html</code></td><td>3+1</td><td>GAMIFICATION_V4</td><td>—</td><td>—</td><td>🔒</td><td>🔒</td><td>§0: дизайн → контракт; код 11.08 не в scope</td></tr>
<tr><td>3.9</td><td><code>Вход v4.dc.html</code></td><td>6</td><td>план <code>:1981</code></td><td>S</td><td>0–2</td><td>✅</td><td>🟡</td><td>Struct+paint закрыты; canvas canonical — см. 1.2</td></tr>
<tr><td>3.10</td><td>Шапка куратора (switcher)</td><td>—</td><td>план <code>:2053+</code></td><td>—</td><td>—</td><td>⬜</td><td>⬜</td><td>Макета нет</td></tr>
<tr><td>3.11</td><td>Пустое «тарелка» (1-й приём)</td><td>—</td><td>план <code>:2042–2043</code></td><td>M</td><td>4–6</td><td>⬜</td><td>⬜</td><td>Перенос обучения; не начато</td></tr>
</tbody>
</table>

Часы и код для строк с 🔒 — **не оцениваем** до снятия блокировки (§0).

---

## 4. APS · второй слой (флоу «Добавление еды») — 🔒 §0

_Разблокировка только после макета+контракта «Добавление еды». Ниже — тех. долг
на будущее._

Сводка утра 14.08 (`APS_LAYOUT_AUDIT.md` §A–I) vs вечер §J:

| Слой                   | Утро (match / partial / mismatch) | После §J вечер                                                       |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------- |
| Основной поток A1–A9   | 3 / 5 / 0                         | A7 partial (photo footnote); остальное без регрессии                 |
| Поиск B1–B4            | 1 / 3 / 0                         | **P4 закрыто** (empty_base, offline)                                 |
| Штрихкод C1–C4         | 0 / 3 / **1**                     | **P3 частично** — multi-match tier есть; full states sheet vs canvas |
| Фото D1–D2             | 0 / 1 / **1**                     | **P2 закрыто** (viewer `#141210`, thumb 44px)                        |
| Создание E1–E9         | 1 / 4 / **2**                     | **P0–P1 закрыто** (harm, portions, create A)                         |
| Наборы F1–F5           | 1 / 4 / 0                         | **P5 закрыто** (delete attention)                                    |
| Слои H (paste, plate…) | partial / extra                   | paste rejected; plate guide — debt                                   |

**Открыто в APS-коде:** P3 barcode states sheet; paste layer; plate guide;
moderation outcomes runtime vs reference sheet; badge «ждёт отправки» на diary
не APS row.

**Открыто в данных (не APS):** очередь resubmit модерации; видимое «в общую базу
не отправлено» (план `:2029–2031`, трек D).

---

## 5. HOME · второй слой (74 кадра)

Не только «11 плиток» — долг по протоколу `HOME_WIDGETS_V4_PROTOCOL`:

| Подзона       | Кадры / решения                           | Struct               | Paint                              |
| ------------- | ----------------------------------------- | -------------------- | ---------------------------------- |
| Калории       | 1a–1d drill-down, 3 состояния             | 🟡→✅ локально 19.08 | 🟡                                 |
| Риск-радар    | 2 вида; default **«Шкала»** (19.08)       | 🟡→✅                | 🟡                                 |
| Инсулин       | 5 wave types; Streak/Insulin не в default | 🟡                   | 🟡                                 |
| Вода          | канон = water-add V₃                      | ⬜ на Главной        | ⬜                                 |
| Variant sheet | `.opt`, edit mode                         | ✅ 19.08             | 🟡                                 |
| ×4 палитры    | past-day / empty states                   | 🟡                   | 🟡                                 |
| Canvas file   | автор правки **не в файле** (14:12)       | —                    | smoke по **решениям**, не по файлу |

---

## 6. Вне пакета / без канваса / архив

| #   | Объект                       | Сложн. | Часы   | В ~90%? | Статус                                                                   |
| --- | ---------------------------- | ------ | ------ | ------- | ------------------------------------------------------------------------ |
| 6.1 | `Цикл v4.dc.html`            | —      | —      | нет     | **🔒 §0** · не норм в макете/контракте; параллельно prompt-cycle-removal |
| 6.2 | Силовой (Downloads, 15 экр.) | XL     | 20–30+ | нет     | Канваса в handoff-v4 нет                                                 |
| 6.3 | Мессенджер (отд. пакет)      | L      | 12–18  | нет     | MESSENGER_REDESIGN_PROTOCOL                                              |
| 6.4 | Лендинг D                    | L      | 8+     | нет     | Трек C2 · ждёт владельца                                                 |
| 6.5 | PWA install баннеры          | M      | 4–6    | да      | Канваса нет · `heys_app_overlays_v1.js`                                  |
| 6.6 | Sticky дата при скролле      | M      | 4–6    | да      | Канвас не отрисован                                                      |

---

## 7. Сводка часов (v2)

| Группа                                    |    Было v1 |   Стало v2 | Комментарий                                               |
| ----------------------------------------- | ---------: | ---------: | --------------------------------------------------------- |
| Owner-only (спиннеры 19/20)               |  в «smoke» |  **0 код** | Не часы разработки                                        |
| Волна Б: тёмные × 5 вкладок               |          0 |    **4–8** | План `:2032–2038`                                         |
| Главная paint (166 lit.) + canvas sync    |      14–22 |  **12–22** | Struct mostly done 19.08                                  |
| Deploy/QA reg+check-in                    |  в «11–21» |    **4–8** | Локально готово, не rework                                |
| APS + data tails                          |      26–40 |      **—** | 🔒 §0, не в scope                                         |
| Рама polish                               |        4–6 |    **2–4** |                                                           |
| Отчёты + Инсайты                          |      10–16 |      **—** | 🔒 §0                                                     |
| Геймификация                              |        5–8 |      **—** | 🔒 §0, дизайн → контракт                                  |
| Актив + вкладка Питание                   |        2–4 |      **—** | 🔒 §0                                                     |
| Советы                                    |    в 25–38 |      **—** | 🔒 §0, дизайн → контракт                                  |
| PWA install + sticky + plate              |          — |   **8–12** |                                                           |
| **Итого → ~90% (разблокированный scope)** | **92–147** | **~28–48** | Главная + infra + reg/check-in push + волна Б; **без §0** |
| + §0 после дизайн→контракт                |          — |        TBD | отдельные оценки при снятии 🔒                            |
| + Силовой + мессенджер                    |     +32–48 |   без изм. |                                                           |

**Фазы 0–3** (brief §8) — только **незаблокированный** scope; §0 **не входит**
до готовности макета и контрактов.

---

## 8. Порядок работ (v2)

### Фаза 0 — синхронизация правды (0.5 дня)

- [ ] Pull/push reg+check-in; smoke 4 палитры
- [ ] Перечитать APS §J — не планировать rework закрытого
- [ ] Обновить canvas `home-widgets` / `Вход` под решения (дизайн)

### Фаза 1 — Главная + вода (1–1.5 дня)

1. HOME paint: 166 literals → роли (гейт classic-drift)
2. Плитка воды на Главной = water-add V₃
3. Canvas-file sync (risk-radar default, insulin types, calories frames)

### Фаза 2 — Волна Б (1 день)

4. Тёмные/синие **глазами** на 5 вкладках × 4 палитры
5. Check-in dark/blue QA (протокол `:141–144`)
6. `--v4-btn-on-act` — дождаться или временная заглушка с пометкой

### Фаза 3 — Polish разблокированного (0.5 дня)

7. Owner smoke спиннеров 19/20 + curator 4 палитры
8. Nav/FAB (1.3); PWA update contrast; pwa-install; sticky **после канваса**

### 🔒 Вне scope до дизайн → контракт (§0)

- **Советы** — дизайн 8 экранов → контракты (`ПРОМПТ_советы_полная_структура`)
- **Геймификация** — дизайн → контракты (канвас + spec §0)
- **Добавление еды** — макет/контракт; потом APS P3 + data queue
- **Питание, Отчёты, Инсайты, Актив** — макет → контракт на вкладку
- **Цикл** — не в «к макету» / removal

### Вне приложения

- Силовой, мессенджер, лендинг D, куратор switcher

---

## 9. Блокеры макета (не код)

### Разблокированный scope (фазы 0–3)

- [ ] Убрать «каноничную» из `Вход v4.dc.html`, `Скелетон v4.dc.html`
- [ ] Синхронизировать `home-widgets.v4.dc.html` с решениями 19.08
- [ ] Отрисовать `Sticky дата при скролле v4.dc.html`
- [ ] `--v4-btn-on-act` для blue palettes
- [ ] Шапка куратора (client switcher)

### 🔒 §0 — сначала дизайн, потом контракты

- [ ] **Советы** — 8/12 поверхностей + контракт
- [ ] **Геймификация** — дизайн (spec §0, канвас) → протокол
- [ ] **Добавление еды** — макет APS → контракт/APS audit
- [ ] **Питание, Отчёты, Инсайты, Актив** — вкладки в макете → контракты
- [ ] **Цикл** — решение removal vs новый макет

### Другие

- [ ] Силовой: канвас в handoff-v4 перед кодом

---

## 10. Противоречия в доках (не путать)

| Документ                               | Устарело    | Актуально                        |
| -------------------------------------- | ----------- | -------------------------------- |
| APS шапка §summary                     | 9/17/4 утро | §J вечер + readiness `:1988`     |
| Brief v1 «главный долг APS XL 18–28 ч» | да          | §J + data tails                  |
| Plan queue ~`:2074` «геймификации нет» | да          | `:631–635`, `:1987` закрыта      |
| GAMIFICATION spec «ждёт этап 4»        | да          | закрыто 11.08                    |
| Brief «тёмная тема ✅✅»               | да          | токены ✅, глазами 🟡            |
| Plan «picker этап 5 не в коде»         | да          | `:2018–2019` закрыт              |
| Readiness 13.08 «закрыт» = очередь     | да          | §0 brief 🔒; план «Решено 20.08» |

---

## 11. Журнал сверки

| Дата       | Кто      | Что обновили                                                                                                                                                                                                                   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-20 | ревьюер  | v1: первая сводка из протоколов + APS утро + стенограмма 17.08                                                                                                                                                                 |
| 2026-08-20 | ревьюер  | **v2:** readiness-таблица 13.08, APS §J, HOME/CHECKIN протоколы 19.08; часы 92–147 → **48–78**; план 4 дня → фазы 0–4                                                                                                          |
| 2026-08-20 | владелец | **§0 🔒:** Советы, Цикл, Добавление еды, Питание/Отчёты/Инсайты/Актив, Геймификация — макет+контракт не норм; геймификация и советы: **дизайн → контракт**; код не в scope. Итого ~90% → **~28–48** (только незаблокированное) |
| 2026-08-20 | ревьюер  | **нормализация:** brief+html+генератор в `docs/ui/`; `pnpm docs:ui-v4-brief`; override §0 в `UI_V4_IMPLEMENTATION_PLAN`; `docs/README.md`                                                                                      |

_При закрытии строки: ⬜/🟡 → ✅ в обеих колонках, коммит/smoke в «Статус»,
строка здесь, пересчёт §7. Снятие 🔒 §0 — отдельная строка в журнале._
