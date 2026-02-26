# Key Files Reference

> Этот файл содержит карту ключевых файлов проекта для AI-агентов. Все файлы
> находятся в `apps/web/` если не указано иное.

## Entry Points & Core

| File                   | Role                                    |
| ---------------------- | --------------------------------------- |
| `heys_app_v12.js`      | App entry (proxy → AppEntry)            |
| `heys_day_v12.js`      | Day tab entry (proxy → DayTab)          |
| `heys_core_v12.js`     | Product search, localStorage, RationTab |
| `heys_bootstrap_v1.js` | App init, dependency management         |

## Auth & Cloud Sync

| File                          | Role                          |
| ----------------------------- | ----------------------------- |
| `heys_auth_v1.js`             | Authentication (JWT + PIN)    |
| `heys_storage_supabase_v1.js` | Cloud sync + offline race fix |
| `heys_yandex_api_v1.js`       | YandexAPI wrapper (rpc/rest)  |

## UI Components

| File                      | Role                                    |
| ------------------------- | --------------------------------------- |
| `heys_widgets_core_v1.js` | Grid Engine, Drag & Drop, State Manager |
| `heys_cascade_card_v1.js` | Decision chain visualization            |
| `heys_phenotype_v1.js`    | Metabolic phenotype + radar chart       |
| `heys_consents_v1.js`     | ПЭП, 152-ФЗ compliance                  |

## Paywall & Subscriptions

| File                       | Role                      |
| -------------------------- | ------------------------- |
| `heys_paywall_v1.js`       | Paywall UI                |
| `heys_trial_queue_v1.js`   | Trial queue management    |
| `heys_subscriptions_v1.js` | Subscription status logic |

## Analytics & Insights

| File                           | Role                                                |
| ------------------------------ | --------------------------------------------------- |
| `heys_insulin_wave_v1.js`      | Orchestrator, multi-factor analysis                 |
| `insights/pi_stats.js`         | Core statistical functions (Bayesian, CI, outliers) |
| `insights/pi_thresholds.js`    | Adaptive Thresholds (3-tier, cascade caching)       |
| `insights/pi_early_warning.js` | Early Warning System (Global Score, Phenotype)      |
| `insights/pi_causal_chains.js` | Cross-Pattern Causal Chains                         |
| `insights/pi_constants.js`     | Dynamic Priority Badge, SECTION_PRIORITY_RULES      |
| `insights/pi_patterns.js`      | Pattern analyzers                                   |
| `insights/pi_advanced.js`      | Advanced pattern analysis                           |

## Insights — Meal Recommendations

| File                               | Role                             |
| ---------------------------------- | -------------------------------- |
| `insights/pi_meal_recommender.js`  | Meal recommendation engine       |
| `insights/pi_product_picker.js`    | Product selection logic          |
| `insights/pi_meal_rec_patterns.js` | Recommendation patterns          |
| `insights/pi_meal_planner.js`      | Meal planning algorithm          |
| `insights/pi_meal_rec_feedback.js` | User feedback on recommendations |

## Insights — UI

| File                                 | Role                         |
| ------------------------------------ | ---------------------------- |
| `insights/pi_ui_dashboard.js`        | Dashboard layout & rendering |
| `insights/pi_ui_cards.js`            | Insight cards rendering      |
| `insights/pi_ui_meal_rec_card.js`    | Meal recommendation card     |
| `insights/pi_ui_whatif_scenarios.js` | What-If scenario UI          |

## Insights — Other

| File                           | Role                   |
| ------------------------------ | ---------------------- |
| `insights/pi_whatif.js`        | What-If scenario logic |
| `insights/pi_feedback_loop.js` | ML feedback loop       |
| `insights/pi_analytics_api.js` | Analytics API layer    |
| `insights/pi_phenotype.js`     | Phenotype detection    |
| `insights/pi_outcome_modal.js` | Outcome modal UI       |

## Serverless & API

| File                                           | Role                    |
| ---------------------------------------------- | ----------------------- |
| `yandex-cloud-functions/heys-api-rpc/index.js` | RPC handler             |
| `packages/core/src/server.js`                  | Express API (port 4001) |
| `packages/shared/src/types/`                   | Shared TypeScript types |

## PWA

| File                          | Role                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `public/sw.js`                | Service Worker (CDN_URLS: только twemoji; boot-бандлы кешируются cache-first по hash) |
| `heys_day_offline_sync_v1.js` | Offline sync logic                                                                    |

## Load Optimisation (v9.6, обновлено 26.02.2026)

> 246 legacy JS-файлов конкатенированы в 9 бандлов. Все бандлы отдаются с GZIP
> (Yandex Object Storage). Запросов при старте: 246 → 9. Время загрузки JS на
> Mid-tier mobile: 63с → **1.5с**.

| File                                              | Role                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `scripts/bundle-legacy.mjs` _(repo root)_         | Генератор бандлов: конкатенация + content-hash + `bundle-manifest.json`. Запуск: `pnpm bundle:legacy` |
| `bundle-manifest.json`                            | Сгенерированный артефакт с именами и хешами 9 бандлов                                                 |
| `public/boot-core.bundle.{hash}.js`               | Boot-бандл 1: dev_utils, platform, yandex_api, models, storage (1.14 MB raw / ~230 KB GZIP)           |
| `public/boot-calc.bundle.{hash}.js`               | Boot-бандл 2: ratio_zones, tef, tdee, harm, day core (893 KB raw)                                     |
| `public/boot-day.bundle.{hash}.js`                | Boot-бандл 3: все heys*day*\* компоненты (896 KB raw)                                                 |
| `public/boot-app.bundle.{hash}.js`                | Boot-бандл 4: auth, subscription, paywall, app_shell, app_tabs (1.05 MB raw / ~204 KB GZIP)           |
| `public/boot-init.bundle.{hash}.js`               | Boot-бандл 5: app_root, initialize, entry, app_v12 (340 KB raw)                                       |
| `public/postboot-1-game.bundle.{hash}.js`         | Postboot 1: gamification, advice, insulin_wave, cycle (1.35 MB raw)                                   |
| `public/postboot-2-insights.bundle.{hash}.js`     | Postboot 2: все insights/pi\_\*.js (1.75 MB raw)                                                      |
| `public/postboot-3-ui.bundle.{hash}.js`           | Postboot 3: modals, steps, reports, widgets (1.28 MB raw)                                             |
| `vite.config.ts`                                  | `bundleLegacy()` плагин **отключён** (2026-02-25) — заменён на статические бандлы в `public/`         |
| `docs/plans/LOAD_OPTIMIZATION_PLAN_2026-02-25.md` | Полный план, аудит и журнал внедрения                                                                 |

> **Ключевые файлы для стабильности загрузки (v9.6):**
>
> - `heys_app_tabs_v1.js` — `DayTabWithCloudSync`: non-blocking + 5000ms
>   fallback + clientId-фильтрация. `syncVer` убран из `key` (иначе full remount
>   таба при каждом фул-синке).
> - `heys_app_shell_v1.js` — React `key` у `DayTabWithCloudSync`: должен быть
>   `'day_' + clientId + '_' + date` (без syncVer).
> - `upload-to-yandex.ps1` — загружает `public/` в Yandex Object Storage с
>   автоматическим GZIP для `.js` файлов.
