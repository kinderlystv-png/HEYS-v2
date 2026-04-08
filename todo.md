# HEYS — Активные задачи

> Обновлено: 2026-03-25

---

## 🔥 Приоритет: Runtime / Scroll Performance — next iteration

> **Статус**: это уже не CSS cleanup, а runtime-pass по самым тяжёлым
> пользовательским сценариям.
>
> **Цель этапа:** сделать приложение заметно стабильнее при скролле,
> переключении табов и открытии тяжёлых экранов **без визуального редизайна** и
> без больших архитектурных переписываний.
>
> **Главный принцип:** сначала только **безопасные локальные изменения**,
> которые не меняют пользовательскую логику и не трогают хрупкие init-path'ы.
> Более рискованные техники — только если low-risk слой не даст достаточного
> эффекта.

### Что уже оптимизировано (не дублировать)

- **deferredSlot** — multi-state skeleton (wait_postboot → wait_delay 260ms →
  show_skeleton → ready) в Day diary
- **LazyMount + IntersectionObserver** — below-fold diary карточки уже не
  монтируются до скролла
- **React.startTransition** — tab switch, date change, meal recalc уже обёрнуты
- **requestIdleCallback** — фоновая загрузка исторических дней (3 места:
  day_core, day_utils, gamification)
- **Event deduplication** — 100ms окно для sync-событий, `isSyncingRef`
  блокирует concurrent updates
- **Module readiness checks** — Cascade, MealRec, EWS обёрнуты в retry-механизм
  с skeleton
- **Lazy Chart.js** — Chart.js в Reports загружается on-demand при открытии
  модалки
- **dayCache/weekCache** — 200-day / 20-week кэш в Reports с invalidation hooks
- **prodIndex useMemo** — `useMemo([products])` в Reports, не пересчитывается на
  каждый getCachedDay()
- **Metabolism useMemo** — `useMemo([lsGet, selectedDate])` в обоих Insights
  компонентах
- **EWS badge backoff** — exponential 1s→8s, max 6 retries, event-first +
  polling-fallback
- **Product search slice** — `.slice(0, 6)` на результаты поиска, не полный
  массив
- **Reports charts** — Sparklines shared модуль, не прямой Chart.js; lazy
  модальные графики

### 🚫 Священные зоны — не трогать без отдельного анализа

- `window.__heysGatedRender` — animation skip при fast render; изменение →
  визуальный регресс
- **Phase A sync gate** (`heys_app_tabs_v1.js` ~строки 48-80) — adaptive
  progressive reveal
- `TAB_SKELETON_DELAY_MS = 260` — выверенный anti-flicker delay
- **Widget drag/drop pointer events** — уже оптимизированы, критичны для mobile
- `window.__heysLoadingHeartbeat` — watchdog freeze detection
- **deferredSlot skeleton-ноды** — живут intentionally, не удалять как «лишний
  DOM»
- **Bootstrap retry loop** (100ms × 50) — менять только backoff, не саму логику
  ожидания

### Как идти безопасно

- [ ] Начинать с изменений, которые уменьшают лишнюю работу, но не меняют
      поведение экранов
- [ ] Делать короткие итерации: одна зона → одна проверка → потом следующая зона
- [ ] Не объединять в один проход mount-оптимизации, tab-switch оптимизации и
      крупную чистку DOM
- [ ] После каждого шага проверять, что не сломались init, hydration, overlays,
      charts и tab navigation
- [ ] Перед правкой любого файла — свериться с «Уже оптимизировано» и «Священные
      зоны»

### Порядок работ по риску

- [x] **Итерация A — low risk / safe-first** (конкретные easy wins)
  - ~~`useMemo` для фильтрации advice list в `heys_day_diary_section.js`~~ →
    advice filtering в `day/_advice.js`: убраны 3 redundant `.filter()`,
    `activeCount` вычисляется inline ✅
  - ~~exponential backoff в EWS badge polling~~ → уже exponential 1s→8s, не
    нужно ✅
  - ~~кэширование `prodIndex` в Reports~~ → уже `useMemo([products])` ✅
  - ~~`useMemo` для 14-day metabolism lookup~~ → уже `useMemo` в обоих
    компонентах ✅
  - ~~exponential backoff в bootstrap polling после 1s~~ →
    `heys_bootstrap_v1.js`: linear 100ms → exponential после 10 retries ✅
  - ~~preload Chart.js~~ → Reports использует Sparklines модуль, не Chart.js; не
    применимо ✅
  - ~~`slice(0, 50)` для поиска продуктов~~ → уже `.slice(0, 6)` ✅
  - локальная чистка offscreen DOM — отложено до профилирования конкретных
    экранов
- [ ] **Итерация B — medium risk / только если A мало помогла**
  - отмена лишних повторных init/update при повторном входе на таб (⚠️ event
    dedup 100ms — деликатно)
  - точечная переработка lifecycle у Chart.js графиков (destroy/re-init path)
  - дробление тяжёлых синхронных tab-open цепочек
  - incremental cache invalidation в Reports вместо полного сброса
  - lazy-compute Insights pattern analysis: первые 3 дня сразу, остальное на
    scroll
- [ ] **Итерация C — high risk / только если реально нужно**
  - partial virtualization / windowing (react-window или аналог)
  - более глубокая перестройка структуры тяжёлых экранов
  - любые изменения, которые затрагивают порядок mount/init, Phase A gate или
    UX-восприятие

### Что именно оптимизировать (привязано к итерациям)

- [x] **A1. Мемоизация hot-path вычислений**
  - ~~advice list filtering~~ → `day/_advice.js`: 3 redundant `.filter()`
    убраны, `activeCount` inline ✅
  - ~~prodIndex rebuild~~ → уже `useMemo([products])` ✅
  - ~~metabolism 14-day lookup~~ → уже `useMemo([lsGet, selectedDate])` ✅
- [x] **A2. Polling/retry backoff**
  - ~~EWS badge~~ → уже exponential 1s→8s ✅
  - Bootstrap: linear 100ms → exponential после 1s ✅
- [ ] **A3. Ленивая загрузка ресурсов** → пересмотрено
  - ~~Chart.js preload~~ → не применимо, Reports использует Sparklines
  - ~~Поиск продуктов slice~~ → уже `.slice(0, 6)` ✅
  - DOM cleanup: отложено до профилирования
- [ ] **B1. Tab-switch lifecycle** _(только после A)_
  - Разобрать init/update цепочки на каждый tab open
  - Убрать синхронные тяжёлые пачки из критического пути — осторожно с event
    dedup
- [ ] **B2. Chart.js / SVG lifecycle** _(только после A)_
  - destroy/re-init path у Cascade, Insulin Wave, Reports chart modals
  - incremental cache invalidation в Reports
- [ ] **C1. Виртуализация** _(только если A+B мало помогли)_
  - Только для реально длинных списков (продукты, meal items)
  - Не трогать Day diary — deferredSlot + LazyMount уже покрывают
- [ ] **Финальная проверка тяжёлых сценариев** _(после каждой итерации)_
  - scroll вверх/вниз на проблемных табах
  - быстрые переключения между табами
  - повторные заходы на один и тот же экран

### Ограничения этого этапа

- [ ] Не менять визуальный дизайн и привычные UX-паттерны без прямой
      необходимости
- [ ] Не тащить большой рефактор «на будущее», если можно решить локально
- [ ] Не ухудшить hydration/init/runtime-стабильность ради цифр в отрыве от
      реального UX
- [ ] Не трогать спорные high-risk приёмы, пока не исчерпан safe-first слой

### Стоп-условия

- [ ] Если изменение затрагивает boot/init path, overlay/modal flow или
      критичные tab-open сценарии — сначала отдельно перепроверить риск, потом
      внедрять
- [ ] Если после оптимизации поведение стало менее предсказуемым, откатить идею
      и выбрать более локальный вариант
- [ ] Если улучшение видно только в synthetic-метрике, но не ощущается в
      реальном UX — не усложнять код ради этого
- [ ] Если для выигрыша нужен большой рефактор, вынести его в отдельную задачу,
      а не протаскивать в этот safe pass
- [ ] Если после правки skeleton мигает, появляется на мгновение или не
      появляется когда должен — откат; skeleton timing (deferredSlot, 260ms) —
      хрупкий баланс

### Когда считать этап успешным

- [ ] На проблемных экранах заметно меньше микрофризов при скролле
- [ ] Переключение табов ощущается легче и без тяжёлых всплесков
- [ ] Нет regressions по UI, init flow и интерактивности
- [ ] Изменения локальные, понятные и проверяемые по runtime-поведению

---

## 📊 Мониторинг и алерты — optional hardening

> **Статус**: базовый контур уже достаточный для текущего масштаба — есть
> `health-check.sh`, GitHub Actions health monitor, Telegram alerts и
> maintenance-задачи. Ниже — не must-have, а усиление контура при росте
> нагрузки/рисков.

- [ ] **2.2** Security burst alerting в maintenance _(low priority)_
  - `checkSecurityAlerts()`: >10 событий/час → Telegram alert
  - Имеет смысл добавлять, если реально есть риск brute-force/abuse или нужен
    отдельный security-signal вне обычных health checks
  - **Файл**: `yandex-cloud-functions/heys-maintenance/index.js`
- [ ] **2.3** External uptime monitor _(low priority)_
  - UptimeRobot / аналог как независимый внешний монитор `/health`
  - Полезно, если нужен alerting вне GitHub/Yandex контура; не критично при
    текущем наборе проверок

---

## 📋 Operations & DR — follow-up

> **Статус**: DR runbook уже сделан; trial queue полностью реализована. Остаток
> — не срочный, но один практический DR smoke-test со временем всё же стоит
> сделать.

- [ ] **4.3** Recovery drill / backup restore smoke-test _(medium priority, not
      urgent)_
  - Полный weekly/staging-процесс сейчас выглядит избыточным: отдельного staging
    нет
  - Практичнее заменить на редкий drill: restore в отдельный cluster / isolated
    env по runbook
  - Рекомендуемый ритм: после крупных infra-изменений или раз в квартал

---

## 🏗️ Архитектурный аудит — tech debt backlog

> **Дата аудита**: 2026-04-05
>
> **Контекст**: code-grounded аудит репозитория — 10 пунктов, привязанных к
> реальным файлам и паттернам, а не абстрактные рекомендации.
>
> **Рекомендуемый порядок**: сначала #6 (e2e тесты как safety net), потом quick
> wins (#5, #7, #9), затем #1 (storage), и только потом тяжёлые #2/#3.

| #   | Пункт                                | Impact  | Effort  | Risk    |
| --- | ------------------------------------ | ------- | ------- | ------- |
| 1   | Унифицировать storage API            | 🔴 High | 🟡 Med  | 🟡 Med  |
| 2   | Декомпозировать legacy модули        | 🔴 High | 🔴 High | 🔴 High |
| 3   | Упростить sync event orchestration   | 🟡 Med  | 🔴 High | 🔴 High |
| 4   | Сократить fallback цепочки           | 🟡 Med  | 🟡 Med  | 🟡 Med  |
| 5   | Синхронизировать docs с архитектурой | 🟢 Low  | 🟢 Low  | 🟢 Low  |
| 6   | Покрыть critical legacy e2e          | 🔴 High | 🟡 Med  | 🟢 Low  |
| 7   | Улучшить lazy loading fallbacks      | 🟢 Low  | 🟢 Low  | 🟢 Low  |
| 8   | Ввести UI performance budget         | 🟡 Med  | 🟢 Low  | 🟢 Low  |
| 9   | Почистить auth legacy хвосты         | 🟢 Low  | 🟢 Low  | 🟡 Med  |
| 10  | Провести mobile UX pass              | 🟡 Med  | 🟡 Med  | 🟢 Low  |

### 1. Унифицировать storage API

- [ ] Инвентаризация: собрать все прямые `localStorage.getItem/setItem` в
      `apps/web/` (200+ мест)
- [ ] Составить маппинг: какие ключи → какой API (`U.lsGet`, `HEYS.store`,
      прямой доступ)
- [ ] Поэтапная миграция на единый `HEYS.store` / `U.lsGet` / `U.lsSet`
- [ ] **Зависимость**: делать после #6 (e2e coverage как safety net)
- **Файлы**: `apps/web/heys_*.js`, `apps/web/src/**`
- **Контекст**: баг v4.8.8 — React читал unscoped ключи, Storage Layer писал
  scoped → продукты показывали 42 вместо 290

### 2. Декомпозировать legacy модули

- [ ] `heys_day_bundle_v1.js` (10 233 LOC) — разбить на ≤2000 LOC модули
- [ ] `heys_widgets_ui_v1.js` (7 482 LOC)
- [ ] `heys_add_product_step_v1.js` (6 171 LOC)
- [ ] Проверить, что bundling config корректно собирает после split
- **Ограничение**: не трогать `heys_day_bundle` без e2e coverage

### 3. Упростить sync event orchestration

- [ ] Каталогизировать все sync-события: `forceReload`, `syncVer`,
      `warnMissing`, `heys:day-updated`, `setSyncVer` (200+ мест)
- [ ] Выделить единый sync manager вместо россыпи guardrails
- [ ] Документировать event flow diagram
- **Риск**: любая ошибка → потеря данных пользователя

### 4. Сократить fallback цепочки

- [ ] Аудит fallback-паттернов: find все `|| fallback`, `?? default`, try/catch
      с silent recovery
- [ ] Заменить «молчаливые» fallbacks на explicit error + telemetry
- [ ] Оставить только те, что реально спасают edge cases
- **Файлы**: `heys_day_utils.js` (storage/sync/recovery), `heys_user_v12.js`

### 5. Синхронизировать docs с архитектурой

- [ ] `NEXT_STEPS.md` — убрать «Complete Supabase integration» (Supabase удалён
      2025-12-24)
- [ ] Проверить остальные docs на stale references
- **Effort**: ~1 час текстовой работы

### 6. Покрыть critical legacy e2e ⭐ _начать с этого_

- [ ] Training UI flow (zero coverage)
- [ ] Day flow с `heys:day-updated` / `forceReload` lifecycle
- [ ] Client switch + scoped storage isolation
- [ ] Modal / overlay interactions
- [ ] Bundle-sensitive scenarios (boot/postboot)
- **Почему первым**: даёт safety net для пунктов 1–4

### 7. Улучшить lazy loading fallbacks

- [ ] `LazyRoutes.tsx` — заменить `<div>Loading...</div>` на skeleton/spinner
- [ ] Добавить error boundary для chunk load failures
- **Effort**: ~2 часа

### 8. Ввести UI performance budget

- [ ] Lighthouse CI в GitHub Actions на каждый PR
- [ ] Bundle size guard (fail PR если bundle растёт >5%)
- [ ] Документировать baseline метрики
- **Effort**: ~4 часа настройки CI

### 9. Почистить auth legacy хвосты

- [ ] Убрать `heys_supabase_auth_token` из `index.html` и `heys_app_entry_v1.js`
- [ ] Проверить, что нет скрытых runtime-зависимостей на эти ключи
- **Риск**: ключи могут читаться из legacy code — нужен grep перед удалением

### 10. Провести mobile UX pass

- [ ] Touch targets < 44px (Lighthouse audit)
- [ ] scroll-snap поведение на ключевых экранах
- [ ] safe-area-inset для нотча/островка
- [ ] Проверить на реальных устройствах (iPhone SE, Android mid-range)

---

## 🔴 Блокеры (ждут бизнес-решений)

### 💳 ЮKassa + Налоги

**Статус**: ⏸️ Ожидает решения по юридической схеме

- [ ] Решение по юр.схеме: ИП (ПСН+УСН) или только УСН
- [ ] ОКВЭД: 63.11 (SaaS), 62.01, 62.09, 63.99.1 — не медицина
- [ ] Регистрация в ЮKassa (shopId + secretKey)
- [ ] Фискализация: облачная касса + ОФД или «Чеки от ЮKassa»
- [ ] После разблокировки: деплой `heys-api-payments`, переключение API gateway
      со stub на real function, webhook, sandbox-тест, активация подписки при
      `payment_succeeded`

---

_Архив выполненного — в `done.md`._
