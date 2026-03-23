# HEYS — аудит тёмной темы и план исправлений

Дата: 2026-03-23  
Среда проверки: `http://localhost:3001/`  
Режим проверки: mobile viewport `430x932`, ручной проход + DOM/style inspection

---

## 1. Executive summary

Тёмная тема в HEYS **включена технически**, но **не реализована как единая
визуальная система**.

Ключевая проблема не в отдельных «неудачных цветах», а в том, что интерфейс
одновременно использует несколько несовместимых подходов:

- светлый shell при активной dark theme;
- белые и почти белые карточки внутри тёмного режима;
- отдельные удачные тёмные паттерны, не масштабированные на весь UI;
- разный язык состояний для меню, модалок, карточек, аналитических блоков и
  табов.

Итоговое пользовательское впечатление: тёмная тема воспринимается не как сильная
сторона продукта, а как неполный и несобранный режим.

---

## 2. Что было проверено

### Основные разделы

- `Отчёты`
- `Дневник`
- `Виджеты`
- `Инсайты`
- `Месяц`

### Оверлеи / popup / modal слои

- верхний gamification dropdown в header;
- menu `Настройки`;
- menu выбора клиента / профиля;
- `date picker` / календарь;
- modal добавления приёма пищи.

### Техническое наблюдение

У корневого элемента установлен `html[data-theme="dark"]`, однако значительная
часть UI либо:

- не использует theme token-ы;
- использует legacy/light-ориентированные surface styles;
- живёт в собственной локальной системе цветов.

---

## 3. Главные выводы

### 3.1. Shell приложения остаётся светлым

Самая заметная проблема — при активной тёмной теме пользователь видит светлый
или почти светлый shell:

- `.hdr`
- `.hdr-bottom`
- `.tabs`
- `.date-picker-trigger`
- верхние dropdown/flyout-элементы геймификации

Это ломает доверие к теме ещё до взаимодействия с контентом.

### 3.2. Нет единой системы поверхностей (surface system)

В интерфейсе одновременно встречаются:

- белые карточки;
- полупрозрачные светлые glass-карточки;
- пастельные блоки аналитики;
- корректные тёмные popup/menu;
- тёмные карточки с другими правилами контраста.

Из-за этого приложение не воспринимается как единый dark experience.

### 3.3. Самые слабые экраны — `Инсайты` и `Отчёты`

Именно эти разделы сильнее всего выбиваются из тёмной темы за счёт центральных
светлых карточек и несогласованных состояний.

### 3.4. В проекте уже есть хорошие dark-patterns

Наиболее удачные элементы:

- `tab-settings-menu`
- modal добавления приёма пищи (`mc-modal`, `mc-backdrop`, `meal-type-btn`)

Это важно: dark theme не нужно изобретать с нуля — в кодовой базе уже есть
рабочие ориентиры.

---

## 4. Аудит по разделам

## 4.1. Header / global shell

### Проблемы

- Header и под-header визуально выглядят как light mode.
- Навигационные tabs находятся на светлой подложке.
- Кнопка выбора даты остаётся белой.
- Gamification-панель и roadmap-слой визуально живут в отдельной, более светлой
  теме.

### Влияние

Это самый критичный дефект, потому что shell — первое, что видит пользователь.
Даже при хорошем контенте ниже по странице dark mode уже воспринимается как
сломанный.

### Приоритет

`P0`

---

## 4.2. Отчёты

### Проблемы

Раздел содержит несколько центральных светлых аналитических карточек и
подблоков. Выявлены проблемные стили/зоны:

- `.metrics-card`
- `.formula-card`
- `.household-activity-card`
- `.sleep-card`
- `.sleep-breakdown-item`

### Симптомы

- белые или почти белые карточки в dark mode;
- светлые вторичные блоки внутри аналитических карточек;
- несогласованная визуальная глубина между карточками;
- ощущение смешения light и dark UI.

### Влияние

Пользователь ожидает от аналитики «премиальный ночной дашборд», а получает набор
светлых вставок внутри supposedly dark experience.

### Приоритет

`P0`

---

## 4.3. Дневник

### Что лучше

Это один из самых собранных разделов. Основной контент уже ближе к приемлемому
dark mode.

### Что плохо

- shell сверху остаётся светлым;
- часть карточек ощущается как glass/light hybrid, а не как настоящие dark
  surfaces;
- отдельные вторичные панели и сводки не подчиняются единой системе
  поверхностей.

### Приоритет

`P1`

---

## 4.4. Виджеты

### Что лучше

Экран относительно стабильный и менее конфликтный.

### Что плохо

- общие shell-проблемы сохраняются;
- white date trigger выбивается;
- часть widget cards визуально остаётся ближе к light-glass стилю.

### Приоритет

`P1`

---

## 4.5. Инсайты

### Проблемы

Самый проблемный экран по визуальной цельности dark mode. Проблемные зоны:

- `.insights-tab__tab.active`
- `.early-warning-card--has-warnings`
- `.metabolic-quick-status`
- `.predictive-dashboard__header`
- `.dual-risk-panel__meter-card--active`

### Симптомы

- белые активные состояния;
- светлые warning/info/predictive surfaces;
- центральные смысловые блоки выглядят как light cards;
- интерфейс теряет ощущение глубины, контраста и premium-целостности.

### Влияние

Это один из ключевых premium-экранов продукта, поэтому любые сбои dark theme тут
особенно заметны и репутационно вредны.

### Приоритет

`P0`

---

## 4.6. Месяц

### Проблемы

- основной reports card остаётся светлым;
- tabs `Неделя / Месяц` выглядят как light mode control;
- легенда и secondary UI не полностью интегрированы в dark palette.

### Приоритет

`P1`

---

## 4.7. Menu / popup / modal system

### Хорошо

#### Settings menu

`tab-settings-menu` — один из лучших примеров корректного dark popup в
приложении:

- тёмная подложка;
- умеренная тень;
- аккуратная рамка;
- хорошая читаемость.

#### Meal creation modal

`mc-modal` и связанный flow выглядят уже как полноценный dark-pattern:

- затемнённый backdrop;
- читаемый foreground text;
- адекватные кнопки выбора;
- хороший контраст CTA.

### Плохо

#### Date picker

- визуально не дотягивает до общего dark-system уровня;
- белый trigger ломает цельность;
- ощущается как отдельный legacy-layer.

#### Profile / client switch menu

- должен быть приведён к тем же токенам, что settings menu;
- требуется унификация hover / active / selected состояний.

#### Gamification dropdown

- один из самых чужеродных элементов;
- визуально выпадает из dark theme;
- находится в header, поэтому заметен постоянно.

### Приоритет

`P1` для popup/menu system, `P0` для header/gamification layer.

---

## 5. Корневые причины

### 5.1. Нет общего набора dark-theme tokens

Судя по поведению UI, компоненты красятся локально, а не через единый набор
токенов.

### 5.2. Legacy-слои и новые слои используют разные подходы

Часть интерфейса построена на тёмных popup/panel паттернах, часть — на
белых/стеклянных карточках, часть — на исторических light styles.

### 5.3. Semantic states решены через светлые подложки

Warning / info / success / predictive блоки местами используют светлые
пастельные фоны, что плохо переносится в dark mode.

### 5.4. Нет единого визуального языка для active/selected/open состояний

Active tab, selected day, expanded card, elevated block и popup используют
разные признаки выделения.

---

## 6. План исправлений

## Phase 1 — Stabilize shell (`P0`)

### Цель

Сделать так, чтобы приложение **с первого экрана** выглядело как корректный dark
product.

### Задачи

1. Перевести в единые dark tokens:
   - `.hdr`
   - `.hdr-bottom`
   - `.tabs`
   - `.date-picker-trigger`
   - gamification / roadmap dropdown слой

2. Убрать светлые фоны у глобальных navigation/control элементов.

3. Зафиксировать единые token-ы для shell:
   - `--bg-app`
   - `--bg-header`
   - `--bg-surface-1`
   - `--bg-surface-2`
   - `--border-subtle`
   - `--text-primary`
   - `--text-secondary`
   - `--accent-primary`

### Критерий готовности

- header, tabs и date picker не содержат белых/light surfaces;
- при открытии приложения dark theme выглядит цельной уже на первом экране.

---

## Phase 2 — Rebuild analytics surfaces (`P0`)

### Цель

Убрать центральные светлые карточки из `Инсайтов` и `Отчётов`.

### Задачи

1. Перевести на dark surface system:
   - `.metrics-card`
   - `.formula-card`
   - `.household-activity-card`
   - `.sleep-card`
   - `.metabolic-quick-status`
   - `.predictive-dashboard__header`
   - `.dual-risk-panel__meter-card--active`
   - `.early-warning-card--has-warnings`

2. Убрать белые активные состояния у insight tabs.

3. Пересобрать semantic warning/info/success surfaces для dark mode:
   - тёмная база;
   - цветовой accent через border/glow/icon strip;
   - отказ от светлых pastel-card подходов.

### Критерий готовности

- центральные аналитические блоки не выглядят как light mode cards;
- `Инсайты` и `Отчёты` воспринимаются как единая dark analytics system.

---

## Phase 3 — Normalize cards and widgets (`P1`)

### Цель

Сделать `Дневник`, `Виджеты` и `Месяц` визуально едиными с обновлённым shell и
analytics.

### Задачи

1. Перевести report/widget/summary cards на один surface-scale.
2. Убрать остаточные white/glass-light решения.
3. Свести все карточки к единой модели:
   - base card
   - elevated card
   - semantic card
   - compact card

### Критерий готовности

- пользователь не видит смешения white cards и dark cards на соседних экранах;
- `Дневник`, `Виджеты` и `Месяц` ощущаются продолжением одного UI.

---

## Phase 4 — Unify overlay system (`P1`)

### Цель

Сделать popup/modal/menu единым dark-layer system.

### Задачи

1. Взять за образец:
   - `tab-settings-menu`
   - `mc-modal`

2. Привести к этим паттернам:
   - date picker popup;
   - profile/client switch menu;
   - gamification dropdown;
   - secondary help/info popovers.

3. Утвердить единые правила для:
   - backdrop opacity;
   - popup elevation;
   - border opacity;
   - corner radius;
   - hover / selected / destructive states.

### Критерий готовности

- любое всплывающее окно в системе выглядит как часть одного продукта;
- popup-слои не конфликтуют по палитре и глубине.

---

## Phase 5 — Finishing pass (`P2`)

### Цель

Довести тёмную тему до уровня premium polish.

### Задачи

1. Проверить все статусы:
   - success
   - warning
   - danger
   - info
   - disabled
   - loading
   - selected
   - active
   - expanded

2. Проверить читаемость:
   - основной текст;
   - secondary text;
   - muted text;
   - chips;
   - badges;
   - dividers;
   - icon-only controls.

3. Проверить consistency на мобильном viewport и desktop.

4. Убедиться, что dark theme не опирается на случайные hardcoded цвета.

### Критерий готовности

- тема не только «не стыдная», но и визуально убедительная;
- продукт ощущается как намеренно спроектированный под dark usage.

---

## 7. Рекомендуемая техническая стратегия

### 7.1. Не чинить точечно цвета по месту

Плохой путь:

- менять отдельные `background: white` по одному;
- латать специфичные компоненты без общей системы.

Хороший путь:

- сначала ввести общие dark tokens;
- затем перевести shell;
- затем крупные analytics screens;
- затем карточки и оверлеи;
- затем полировка.

### 7.2. Ввести базовую шкалу поверхностей

Рекомендуемые уровни:

- `app background`
- `surface-1`
- `surface-2`
- `surface-3`
- `elevated surface`
- `overlay surface`
- `semantic success/warning/danger surface`

### 7.3. Active state не должен быть белой плашкой

Для dark mode активные состояния лучше строить через:

- более яркий текст;
- accent border;
- мягкий glow;
- умеренное повышение surface level;
- icon tint / accent chip.

### 7.4. Semantic UI должен быть тёмным по базе

Например, warning card должна быть не светло-жёлтой карточкой, а:

- тёмной карточкой;
- с amber accent;
- с readable title;
- с контрастным CTA и badge.

---

## 8. Предлагаемый порядок работ по файлам

> Ниже — не исчерпывающий список, а стартовый маршрут для implementation pass.

### 8.1. Global / theme / shell

Искать и нормализовать стили вокруг:

- header / tabs / date-picker trigger;
- dark theme token mapping;
- global card/background variables;
- styles для flyout/dropdown в header.

### 8.2. Insights / reports

Искать и приоритизировать:

- `insights` UI blocks;
- predictive dashboard;
- early warning cards;
- metabolic / risk / quick status panels;
- reports metric cards;
- sleep/household/formula cards.

### 8.3. Popup / modal

Проверить стили:

- `tab-settings-menu`
- `mc-modal`
- `date-picker-*`
- client/profile popup
- help/info popovers

---

## 9. Acceptance criteria для финального исправления

Тёмную тему можно считать доведённой, если:

1. При первом открытии приложения пользователь не видит белый/light shell.
2. Ни один центральный premium-экран (`Инсайты`, `Отчёты`) не содержит визуально
   чужих white cards.
3. Все popup/menu/modal слои подчиняются одному dark pattern.
4. Active/selected/open состояния выглядят единообразно.
5. Warning/info/success semantics работают без светлых пастельных костылей.
6. Мобильный viewport выглядит цельно на всех основных вкладках.

---

## 10. Короткий итог

HEYS уже содержит несколько хороших dark-patterns, но они не стали системным
стандартом.

Чтобы тёмная тема стала сильной стороной продукта, нужно:

- сначала исправить shell;
- затем перевести ключевую аналитику на единый dark surface system;
- затем унифицировать карточки и popup-слои;
- затем сделать финальную consistency-polish проверку.

Главная цель: не просто «убрать белые карточки», а добиться того, чтобы весь
продукт ощущался как **единый premium dark interface**.
