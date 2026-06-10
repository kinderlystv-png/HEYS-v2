# `apps/web/fingers/` — Climbing Fingerboard Module

Под-продукт уровня отдельного приложения, интегрированный в HEYS-дневник как
`training.type === 'fingers'`. Source IIFE-модули собираются в один
`apps/web/heys_fingers_bundle_v1.js` через
[`scripts/bundle-fingers.cjs`](../scripts/bundle-fingers.cjs).

## Архитектура

Слой → ответственность → файлы:

| Layer | Назначение                      | Модули                                                                                                                              |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Core data + capability features | `audio_extension`, `body_metrics`, `bibliography`, `grips_catalog`, `boards_catalog`, `programs_catalog`, `age_gating`, `readiness` |
| 2     | Визуалы и голос                 | `svg_grips`, `svg_anatomy`, `voice`                                                                                                 |
| 3     | Логика выполнения сессии        | `records_store`, `calibration`, `timer`, `session_persistence`, `calendar`, `safety`, `warmup_runner`                               |
| 4     | UI компоненты                   | `muscle_detail`, `constructor`, `onboarding`, `session_ui`, `fullscreen`                                                            |
| 5     | Точка входа (public API)        | `entry` ← **должен быть LAST**                                                                                                      |

Порядок зафиксирован в
[`scripts/bundle-fingers.cjs`](../scripts/bundle-fingers.cjs) в массиве
`MODULES`. Каждый модуль — IIFE, регистрируется в `window.HEYS.Fingers.<name>` и
проверяет `__<x>Registered` флаг для идемпотентности повторного eval.

## Public API

Стабильный контракт описан в JSDoc-блоке
[`heys_fingers_entry_v1.js`](heys_fingers_entry_v1.js):

```js
HEYS.Fingers.openFullscreen({ dateKey, trainingIndex, mode })
HEYS.Fingers.close()
HEYS.Fingers.isReady()
HEYS.Fingers.renderPreviewPill({ training, dateKey, trainingIndex, onClick })
HEYS.Fingers.getBodyWeight() // → { kg, source }
HEYS.Fingers.ageGate.{filterPrograms,filterGrips,warnLevel,getRestrictionMessage}
HEYS.Fingers.readiness.assess(today, history)
```

Всё что НЕ в этом списке (например, `Fingers.Fullscreen`, `Fingers.SessionUI`,
`Fingers.timer`) — internal, может меняться без semver-bump.

## Workflow при добавлении нового файла

1. Создать `heys_fingers_<feature>_v1.js` здесь, в `apps/web/fingers/`.
2. Использовать IIFE-паттерн: `(function (global) { ... })(window)`.
3. Регистрировать API на `HEYS.Fingers.<feature>` с idempotent-флагом.
4. Вписать в [`scripts/bundle-fingers.cjs`](../scripts/bundle-fingers.cjs)
   `MODULES` массив в правильный layer-блок.
5. Прогнать `pnpm --filter @heys/web run bundle:fingers` из корня репозитория
   или `pnpm bundle:fingers` из `apps/web/` (или дождаться `predev` хука).
6. Если safety-критичная логика — добавить regression test в
   [`TESTS/heys_fingers_safety.test.js`](../../../TESTS/heys_fingers_safety.test.js).

## CSS

Все стили в
[`apps/web/styles/modules/fingers.css`](../styles/modules/fingers.css)
(импортирован в `main.css` между `600-steps-and-aps` и `700-profile-wizard`).
Namespace `.fingers-fs-*` изолирован от дневника. 3 темы через
`[data-fingers-theme="A|B|C"]`.

## Что НЕ делать

- **Не редактировать `apps/web/heys_fingers_bundle_v1.js` вручную** — он
  auto-generated и будет перезаписан при следующем `bundle:fingers`.
- **Не загружать source-файлы напрямую через `<script src="fingers/...">`** —
  только через bundle. Иначе ломаются dependency order гарантии.
- **Не использовать `HEYS.user.weightKg`** — поле НЕ существует в HEYS.
  Канонический путь — `HEYS.Fingers.getBodyWeight()` или
  `HEYS.utils.lsGet('heys_profile', {}).weight`. См. `body_metrics_v1.js`.
- **Не дефолтить возраст** — UIAA/BMC safety требует fail-closed.
  `ageGate.warnLevel(NaN)` → `'block-all'`, не `'ok'`. См. `age_gating_v1.js` и
  regression-тесты.

## Load lifecycle

Bundle грузится **лениво**, не на boot:

1. На boot грузится только `apps/web/heys_fingers_boot_stub_v1.js` (~5 KB) через
   общий `heys_day_stats_bundle_loader_v1.js`. Stub регистрирует public-API
   placeholders (`renderPreviewPill`, `openFullscreen`, `isReady`, `close`).
2. Stub при boot читает `localStorage` ключи на наличие `_finger_active_session`
   snapshot. Если есть — лениво подтягивает bundle чтобы показать resume-баннер.
3. Если нет — bundle грузится только при первом вызове:
   - `HEYS.Fingers.renderPreviewPill(...)` — placeholder-pill при mount
     запускает `__lazyLoad()`, после готовности re-renders реальным pill.
   - `HEYS.Fingers.openFullscreen(...)` — `__lazyLoad()` + после готовности
     делегирование настоящему `openFullscreen`.
4. `__lazyLoad()` идемпотентен и кеширует Promise — повторные вызовы не создают
   новых `<script>` тегов.
5. После `script.onload` диспатчится `fingers-bundle-ready` event для
   подписанных компонентов (LazyPill).

Юзеры которые не тренируют пальцы и не имеют snapshot — bundle вообще не
скачивают. Экономия ~400 KB transfer + парсинг ~8800 строк на каждое открытие
дневника.

## Roadmap

- Subdivision файлов по подпапкам (`catalogs/`, `ui/`, `logic/`) — когда список
  перевалит за 35 модулей.
- Typed public API через `.d.ts` ambient declaration для consumer-кода.
- Service Worker precache для `heys_fingers_bundle_v1.js` после первого
  cache-hit — устранит задержку lazy-load на 2-й визит.
