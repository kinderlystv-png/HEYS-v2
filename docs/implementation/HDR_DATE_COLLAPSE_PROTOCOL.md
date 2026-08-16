# Протокол: шапка в скроллере, native sticky даты

**Дата:** 2026-08-16  
**Статус:** локально собрано; push/deploy не входят

## UI-гейт

`цель — больше контента при чтении дневника; главное действие после pin — смена даты; слой 1 — дата (+ баннер прошлого дня); слой 2 — XP/title у верха контента; критическое не скрывать — баннер и дата.`

## Решение

Один DOM: `MemoAppHeader` — первый ребёнок `.tab-active-viewport` (кроме
`wrap--no-header`). Развод через CSS, не две рамы:

- без даты — весь `.hdr` `position: sticky; top: 0` (XP не уезжает);
- diary/activity (`hdr--date-collapse`) — chrome в потоке, `.hdr-sticky-strip`
  sticky.

Chrome уезжает 1:1 с пальцем. Возврат — только к верху контента, не по
направлению скролла.

Прижатое состояние: сентинел + `IntersectionObserver` → `.is-pinned` (тень на
капсулах). Layout не меняется — safe-area в `top` sticky, без `padding-top` на
pin.

`--heys-hdr-sticky-top` остаётся одним замером при pin (и RO на полосе, если
вырос баннер) — `.meal-sticky-bar` `position: fixed`.

## Крупные шаги

### 0. Проверки до переноса — сделано

- `.hdr { contain: layout style }` на промежуточном предке убил бы sticky
  полосы. Снимаем contain с `.hdr`; на `.hdr--date-collapse` явно
  `contain: none`.
- `.meal-sticky-bar` уже рендерится в `heys_day_diary_section.js` внутри
  viewport/swipeable. `position: fixed` ломается transform'ом свайпа и сейчас
  (~0.22 с). Бар не переносим; `transition: top` убираем — высота полосы после
  pin постоянна.

### 1. Перенос шапки в viewport — сделано

- Убрать `.app-header-wrapper`.
- Первый ребёнок `.tab-active-viewport` — `MemoAppHeader`.
- Полоса даты — сосед `.hdr`, не потомок: иначе sticky клипается высотой шапки и
  уезжает.
- tasks/board: шапка не рендерится, `wrap--no-header` как сейчас.

### 2. Снос collapse-машинерии — сделано

Ушли: scroll listener, rAF, `resolveHdrCollapseState`, пороги, локи, FLIP/WAAPI,
`.hdr--collapsed`.

### 3. Sentinel + is-pinned + замер для meal-bar — сделано

`bindHdrStickyPin`: IO на сентинел, RO только на полосе для
`--heys-hdr-sticky-top`.

### 4. Смоук — сделано

- `__tests__/hdr-date-collapse.test.js` — sticky, нет scroll-listener, sentinel
  IO вешает `is-pinned`
- `app-nav-v4-frame.test.js` — шапка внутри viewport
- vitest: 44 passed (hdr-date-collapse + frame + home-tab-activity)

### 5. Preview — сделано

- `pnpm bundle:legacy:auto --files=apps/web/heys_app_shell_v1.js` →
  `boot-app.bundle.19233a9e9d3e.js`
- CSS модуль отдаётся напрямую (`styles/modules/000-base-and-gamification.css`)
- web:3001 + api:4001 уже подняты (`dev:web` / `dev:api`)

## Риски / смотреть ревьюеру

- Горизонтальный свайп везёт шапку вместе с контентом (раньше стояла снаружи).
- `contain` / `overflow` на `.hdr` не должны вернуться.
- iOS: sticky + `-webkit-overflow-scrolling` на `.tab-active-viewport`.
- `.meal-sticky-bar` во время свайпа (уже было).
- Главная / Отчёты / Инсайты: весь `.hdr` sticky — визуально как фиксированная
  шапка.
