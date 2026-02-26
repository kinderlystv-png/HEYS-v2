# 📘 DATA MODEL — Unified Changelog

> Единый changelog для документации:
> - `DATA_MODEL_REFERENCE.md`
> - `DATA_MODEL_NUTRITION.md`
> - `DATA_MODEL_ANALYTICS.md`

---

## Core history (from DATA_MODEL_REFERENCE)

| Версия | Дата       | Изменения |
| ------ | ---------- | --------- |
| 5.6.0  | 2026-02-26 | **📊 Scoring & App Systems Reference**: Созданы 2 новых документа: `SCORING_REFERENCE.md` (Status Score 9 факторов с весами, Day Score авто+ручной, Cascade Risk Score v7) и `APP_SYSTEMS_REFERENCE.md` (Widget Dashboard, Cascade System, SmartSearch, Export/Import, Trial Queue, Scheduled Advice, Migration, Cloud Merge). **Reference**: DayRecord +3 поля (dayScore, dayScoreManual, _syncCompletedAt), dayTot +2 (harm, trans), localStorage +5 ключей, связанные файлы; **Analytics**: XP Actions таблица (13 actions), Level Thresholds (25 уровней) |
| 5.5.0  | 2026-02-26 | **📋 Полная актуализация документации vs код**: (1) **Reference**: DayRecord +9 полей (isRefeedDay, refeedReason, supplements*, coldExposure, schemaVersion, _sourceId); Product Extended Nutrients — полная документация 40+ полей (витамины, минералы, sodium, omega, nova, quality flags); Profile +4 поля (supplements*); TEF формула исправлена (protein TEF=0, NET Atwater 3 kcal/g); Advice +56 новых / -7 удалённых (→~170); localStorage +4 ключа; PI v5.2→v6.3.0; Gamification 32→36, 7→8 кат. (2) **Analytics**: PI v6.3.0; Gamification: Streak 5 актуальных ID, Onboarding 9 штук, +Metabolic категория; Phenotype v1.1.0 + Tier Configuration; (3) **Nutrition**: MQS +Circadian/Activity bonuses, GL thresholds, Liquid penalty, Ideal macros, Badges; Caloric Debt файл→heys_day_caloric_balance_v1.js; TEF формула унифицирована; IW модульная структура (8 файлов); Refeed Zones |
| 5.4.0  | 2026-02-19 | **🚨 EWS v4.0→v4.2 + Dynamic Priority Badge v4.3.0 — полная документация**: (1) **EWS v4.0** (`pi_early_warning.js` v20→v21): EWS Global Score 0-100 (`calculateEwsGlobalScore`, severity×healthImpact×chronicity, bands: ≥70 HIGH_RISK / ≥40 MEDIUM / ≥20 LOW / <20 MINIMAL), **Cross-Pattern Causal Chains** (`pi_causal_chains.js` v1.0, 6 цепочек: SLEEP_STRESS_BINGE/LOGGING_PATTERN_GOAL/CALORIC_MOOD_EVENING и др., `detectCausalChains({warnings,patterns,trends})`); (2) **EWS v4.1** (v22): **Weekly Progress Tracking** — `calculateWeeklyProgress`, localStorage `heys_ews_weekly_v1`, 4-недельные снапшоты (warningsCount/globalScore/severityBreakdown/topWarnings), тренды improving/stable/worsening (±15% пороги); (3) **EWS v4.2** (v44): **Phenotype-Aware Thresholds** — `getEwsThreshold(warningType, profile)`, 4 EWS-фенотипа (insulin_resistant/evening_type/low_satiety/stress_eater), dynamic multipliers (Fiber+20%, Sugar−50%, Protein+20%, Late Meal−90мин и др.), Quick API (`HEYS.InsightsPI.earlyWarning.phenotype.*`); (4) **Priority v4.2.0** (`pi_constants.js`): **SECTION_PRIORITY_RULES** для 3 секций (STATUS_SCORE инверсия, CRASH_RISK по EWS warnings, PRIORITY_ACTIONS по urgentActionsCount), `PRIORITY_CONTEXT_LABELS.PRIORITY_ACTIONS`; (5) **Priority v4.3.0**: **Acuteness Decay** `decay=max(0.3,1-(daysOld-3)/27)`, **Pattern Degradation Boost** (≥2 паттернов с score<40 → +1 level), расширенная сигнатура `computeDynamicPriority(sectionId, data, {crashRiskScore, urgentActionsCount, actionsCount, patterns})`; (6) **Новые файлы в таблице**: pi_causal_chains.js, pi_constants.js, pi_whatif.js, pi_feedback_loop.js, pi_outcome_modal.js, pi_analytics_api.js, pi_meal_recommender.js, pi_product_picker.js, pi_meal_rec_patterns.js, pi_stats.js; (7) localStorage: добавлен `heys_ews_weekly_v1` |
| 5.0.0  | 2026-02-12 | **🔮 HEYS Insights v5/v6 — 41 паттерн (100% PMID покрытие)**: Завершена работа над системой персонализированной аналитики питания на базе научных метрик. **41/41 паттерн активны** (19 core v2-v3, 6 advanced v4, 6 deep v5, 10 v6 Phase 1-5). **100% SCIENCE_INFO coverage** — каждый паттерн имеет: name, short (1-2 предложения), details (3-4 параграфа), formula (математическое определение), sources[] (PMID ссылки), interpretation (пороги score), priority/category/actionability/impactScore/whyImportant. **Добавлены 13 core паттернов** (MEAL_TIMING, WAVE_OVERLAP, LATE_EATING, MEAL_QUALITY_TREND, SLEEP_WEIGHT, SLEEP_HUNGER, TRAINING_KCAL, STEPS_WEIGHT, PROTEIN_SATIETY, FIBER_REGULARITY, STRESS_EATING, MOOD_FOOD, HYPERTROPHY). **Реализованы v6 Phase 1**: C13 (VITAMIN_DEFENSE — 11 витаминов radar), C22 (B_COMPLEX_ANEMIA — B1-B12 + Fe + риск анемии). **Health Score v6** — goal-aware категории (фиксы 13.02.2026: deficit nutrition 0.35→0.25 для суммы 1.0; 6 паттернов перемещены в правильные категории: antioxidant_defense/bone_health/electrolyte_homeostasis→recovery, b_complex/glycemic_load/added_sugar→metabolism). Веса maintenance: Nutrition 35%, Timing 25%, Activity 20%, Recovery 15%, Metabolism 5%. **Performance**: P50 < 180ms для 41 паттерна на 30 днях. **Документация**: Полная секция Predictive Insights в DATA_MODEL_REFERENCE.md с таблицами всех 41 паттерна, API usage, примерами SCIENCE_INFO |
| 4.3.0  | 2026-01-18 | **🏭 NOVA Classification v1.0 + Extended Nutrients v3.0**: (1) **NOVA Classification** — 4 группы переработки (Monteiro 2019, PMID: 29444892): NOVA 1 = необработанные (177 продуктов), NOVA 2 = кулинарные ингредиенты (19), NOVA 3 = переработанные (44), NOVA 4 = ультрапереработанные (44). **Штрафы Harm**: 0/0.3/0.8/2.5. **100% покрытие**: 284 из 284 продуктов классифицированы. (2) **Extended Nutrients v3.0** — 29 новых колонок в `shared_products`: `sodium100` (натрий), `nova_group`, 11 витаминов (`vitamin_a` → `vitamin_b12`), 8 минералов (`calcium` → `iodine`), 4 флага качества (`is_organic`, `is_whole_grain`, `is_fermented`, `is_raw`). (3) **SQL-функции обновлены**: `get_shared_products()` возвращает extended поля, `publish_shared_product_by_session()` принимает extended nutrients. (4) **UI Harm Comparison**: карточки «✏️ AI» и «🧪 Расчёт» для сравнения при создании продукта |
| 4.2.0  | 2025-01-17 | **🧪 Harm Score v1.0.0**: Научная система оценки вредности продуктов 0-10. **Формула**: PENALTIES (trans×3.0, simple×0.08, badFat×0.12, GI_penalty) - BONUSES (fiber×0.25, protein×0.05, goodFat×0.02). **7 категорий**: Суперполезный (0-1) → Супервредный (8.6-10). **PMID ссылки**: Mozaffarian 2006 (транс), Ludwig 2002 (сахар), Sacks 2017 (насыщ. жиры), Brand-Miller 2003 (ГИ), Weickert 2008 (клетчатка). **Training Context модификаторы**: ×0.5 peri-workout, ×0.7 post-workout. **API**: `calculateHarmScore()`, `getHarmCategory()`. Примеры расчёта для 4 продуктов |
| 4.1.2  | 2026-01-09 | **📊 Wave Visualization v4.1.2**: Единая белая кривая для 3-компонентной модели (вместо 3 пунктирных линий). Добавлена popup-легенда с научным обоснованием модели: ⚡ Fast (15-25 мин, простые углеводы), 🌿 Main (45-60 мин, основной ответ), 🫀 Tail (90-120 мин, печёночный хвост). Визуально нагляднее — 3 пика видны как "холмики" на единой кривой. Научное обоснование: Brand-Miller 2003, Holt 1997 |
| 4.1.0  | 2025-01-09 | **🧬 Insulin Wave v4.1.0 — 4 новых научных модуля**: Metabolic Flexibility Index, Satiety Model, Adaptive Deficit Optimizer, Meal Timing Optimizer |
| 4.0.0  | 2025-01-09 | **🧠 Insulin Wave v4.0.0 — 7 новых модулей**: IR Score, Gaussian model, AUC, InsulinPredictor, WaveScoring, миграции v3→v4 |
| 3.24.1 | 2025-12-27 | **📚 TEF/TDEE/Supplements в справочнике**: добавлены разделы и связанные файлы |
| 3.24.0 | 2025-12-22 | **🔧 Yandex Cloud Functions FIX**: исправлены критические проблемы окружения и upsert |
| 3.23.0 | 2025-12-21 | **📊 Analytics Documentation v1.0**: добавлены 7 аналитических модулей |
| 3.22.0 | 2025-12-17 | **🎨 Extended Analytics UI v2.0**: глубокая интеграция аналитик в UI |
| 3.21.0 | 2025-12-17 | **🎨 Extended Analytics UI Integration v1.0** |
| 3.20.0 | 2025-12-17 | **🧠 Расширенная аналитика калорийного баланса v3.1.0** |
| 3.19.0 | 2025-12-17 | **📈 Caloric Excess v1.0.0** |
| 3.18.0 | 2025-12-15 | **🔥 TEF v3.9.0** |
| 3.17.0 | 2025-12-15 | **🔬 Инсулиновая волна v3.8.0** |
| 3.16.0 | 2025-12-15 | **💊 Supplements Reminders v1.2** |
| 3.15.0 | 2025-12-12 | **🔄 Refeed Day v1.3.0** |
| 3.14.0 | 2025-12-12 | **💰 Caloric Debt System** |
| 3.13.0 | 2025-12-11 | **🔍 Аудит факторов v3.7.2** |
| 3.12.0 | 2025-12-11 | **🔥 NDTE v3.6.0** |
| 3.11.0 | 2025-12-11 | **⚡ PRE-WORKOUT harmMultiplier v3.5.4** |
| 3.10.0 | 2025-12-11 | **🏃 Postprandial Exercise v3.5.1** |
| 3.9.0  | 2025-12-11 | **🔥 Kcal-Based Wave Reduction v3.5.0** |
| 3.8.0  | 2025-12-11 | **🏋️ Training Context v3.4.0** |
| 3.6.0  | 2025-12-10 | **Insulin Index v3.2.2 — critical fix** |
| 3.5.0  | 2025-12-10 | **Meal Quality Score v2** |
| 3.4.0  | 2025-12-10 | **Новые факторы инсулиновой волны** |
| 3.3.0  | 2025-12-10 | **Научный аудит коэффициентов** |
| 3.2.0  | 2025-12-09 | **PMID ссылки для факторов волны** |
| 3.1.0  | 2025-12-09 | **Научный аудит расчётов** |
| 3.0.0  | 2025-12-09 | **Инсулиновая волна v3.0.0** |
| 2.1.2  | 2025-12-09 | **Инсулиновая волна low-GL v2** |
| 2.1.1  | 2025-12-09 | **Инсулиновая волна low-GL аудит** |
| 2.1.0  | 2025-12-08 | **🌸 Задержка воды** |
| 2.0.0  | 2025-12-08 | **🌸 Менструальный цикл** |
| 1.9.0  | 2025-12-08 | **Инсулиновая волна v2.0** |
| 1.8.0  | 2025-12-08 | **Аудит инсулиновой волны** |
| 1.7.0  | 2025-12-08 | **Инсулиновая волна v1.5** |
| 1.6.0  | 2025-11-29 | **+26 советов Phase 2** |
| 1.5.0  | 2025-11-29 | Финальная актуализация (77 советов) |
| 1.4.1  | 2025-11-29 | Training.type использует ID |
| 1.4.0  | 2025-11-29 | +21 новый совет |
| 1.3.0  | 2025-11-29 | Глубокий аудит полей и советов |
| 1.2.0  | 2025-11-29 | Добавлена секция Advice Module |
| 1.1.0  | 2025-11-29 | Добавлены `waterMl`, `lastWaterTime`, `sleepHours`, `updatedAt` |
| 1.0.0  | 2025-11-29 | Первоначальная версия справочника |

---

## Nutrition (latest)

| Версия | Дата       | Изменения |
| ------ | ---------- | --------- |
| 3.4.0  | 2026-02-26 | **📊 Ссылки на SCORING_REFERENCE**: связанные файлы обновлены |
| 3.3.0  | 2026-02-26 | **📋 Актуализация**: MQS +Circadian/Activity bonuses, GL thresholds, Liquid penalty, Ideal macros, Badges; Caloric Debt файл→heys_day_caloric_balance_v1.js; TEF формула унифицирована (protein TEF=0); IW модульная структура (8 файлов); Refeed Zones |
| 3.2.0  | 2026-02-19 | 🚀 **Разбиение DATA_MODEL_REFERENCE на 3 файла**: Analytics (скоринги), Nutrition (питание), Reference (ядро) |
| 4.1.0  | 2026-01-09 | **🧠 InsulinWave v4.1**: MetabolicFlexibility, Satiety, AdaptiveDeficit, MealTimingOptimizer |
| 4.0.0  | 2026-01-09 | **🔮 InsulinWave v4.0**: IR Score, Gaussian, AUC, InsulinPredictor, WaveScoring, миграция v3→v4 |
| 3.7.7  | 2025-12-15 | **🏋️ POST-WORKOUT FIX**: MET-формула расчёта ккал по зонам пульса, мультипликативная модель волны |
| 3.5.4  | 2025-12-10 | **🎯 Meal Quality Score**: +3 бонуса за тайминг тренировки (peri/post/pre) |
| 3.2.2  | 2025-12-08 | **🥛 Insulin Index FIX v3.2.2**: II теперь применяется к GL per-product (молоко ×3.0, сыр ×1.5) |
| 2.1.2  | 2025-12-01 | **📊 Low-GL коррекция**: усиленное ослабление циркадных ритмов при GL<10 |

---

## Analytics (latest)

| Версия | Дата       | Изменения |
| ------ | ---------- | --------- |
| 5.6.0  | 2026-02-26 | **📊 Scoring & App Systems**: XP Actions (13), Level Thresholds (25), ссылки на новые справочники |
| 5.5.0  | 2026-02-26 | **📋 Актуализация**: PI v6.3.0; Gamification 36 достижений в 8 категориях (Streak/Onboarding/Metabolic обновлены); Phenotype v1.1.0 + Tier Config (basic/developing/confident/expert) |
| 5.4.0  | 2026-02-19 | **🚨 EWS v4.0→v4.2 + Dynamic Priority Badge v4.3.0** |
| 5.0.0  | 2026-02-12 | **🔮 HEYS Insights v5/v6 — 41 паттерн (100% PMID покрытие)** |
| 4.3.0  | 2026-01-18 | **🏭 NOVA Classification v1.0 + Extended Nutrients v3.0** |
| 4.2.0  | 2025-01-17 | **🧪 Harm Score v1.0.0** |
| 3.23.0 | 2025-12-21 | **📊 Analytics Documentation v1.0** |
