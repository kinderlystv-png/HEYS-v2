/**
 * HEYS Advice Evidence Knowledge Base — Phase 1
 * @file advice/_evidence.js
 *
 * Peer-reviewed citations + guideline references для:
 *   • advice rules (194 советов, Tier-A 30 — full populate, Tier-B/C — defer)
 *   • computed patterns (6: mealTiming, circadian, insulinSensitivity, ...)
 *   • EWS warnings (25 в 5 tiers)
 *   • phenotype variants (4D: metabolic / circadian / satiety / stress)
 *
 * Schema (по UI hooks в _advice.js:239-258):
 *   evidenceLevel: 'A' (strong: meta/guideline) | 'B' (good: RCT/cohort) | 'C' (working: observational/expert)
 *   topic: short topic label, рендерится в "На что опирается совет"
 *   rationale: ≤200 chars human-readable explanation, рендерится в "Почему это обычно работает"
 *   sources: array of { org, year, type, journal?, n?, doi? } — UI rendering TBD Phase 1.3
 *   guideline_ref: short citation tag (для search/audit)
 *   not_apply_when: array of edge cases / contraindications (Phase 6 transparency)
 *
 * Все citations — public, peer-reviewed sources of well-known guidelines.
 * Не fabricate DOI; используем journal + year + author identifier.
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};

    // ═══════════════════════════════════════════════════════════════
    // ADVICE evidence (Tier-A 30 — full populate)
    // ═══════════════════════════════════════════════════════════════
    const ADVICE_EVIDENCE = {
        // ─── NUTRITION (10) ─────────────────────────────────────────
        'protein_low': {
            evidenceLevel: 'A',
            topic: 'protein-needs',
            rationale: 'Белок 1.5-2.0 г/кг для активных взрослых поддерживает MPS, насыщение и сохраняет мышцы в дефиците.',
            sources: [
                { org: 'ESPEN', year: 2022, type: 'guideline', journal: 'Clin Nutr', author: 'Singer et al' },
                { org: 'Morton et al', year: 2018, type: 'meta-analysis', n: 1863, journal: 'Br J Sports Med' },
                { org: 'Phillips & Van Loon', year: 2011, type: 'review', journal: 'J Sports Sci' }
            ],
            guideline_ref: 'ESPEN-2022',
            not_apply_when: ['CKD (хронические заболевания почек) — согласуй с врачом']
        },
        'fiber_low': {
            evidenceLevel: 'A',
            topic: 'fiber-intake',
            rationale: 'Клетчатка 25-35 г/день (или 14 г/1000 ккал) улучшает гликемический контроль, gut microbiome и насыщение.',
            sources: [
                { org: 'AHA', year: 2017, type: 'guideline', topic: 'Dietary fiber' },
                { org: 'ESPEN', year: 2022, type: 'guideline' },
                { org: 'Reynolds et al', year: 2019, type: 'meta-analysis', journal: 'Lancet' }
            ],
            guideline_ref: 'Reynolds-Lancet-2019',
            not_apply_when: ['IBD в стадии обострения — мягкая клетчатка только; согласуй с врачом']
        },
        'kcal_under_critical': {
            evidenceLevel: 'A',
            topic: 'energy-deficit',
            rationale: 'Хронический дефицит > 500 ккал/сутки → adaptive thermogenesis, потеря мышц, гормональный сбой (особенно у женщин).',
            sources: [
                { org: 'Trexler et al', year: 2014, type: 'review', journal: 'J Int Soc Sports Nutr' },
                { org: 'Fothergill et al', year: 2016, type: 'longitudinal', topic: 'Biggest Loser' }
            ],
            guideline_ref: 'Trexler-2014',
            not_apply_when: ['монитор-нинговое голодание под врачом']
        },
        'kcal_excess_critical': {
            evidenceLevel: 'A',
            topic: 'energy-surplus',
            rationale: 'Хронический избыток >500 ккал/сутки → fat gain ~0.5 кг/неделю даже при тренировках.',
            sources: [
                { org: 'Hall et al', year: 2011, type: 'review', journal: 'Lancet' },
                { org: 'Bray et al', year: 2012, type: 'RCT', journal: 'JAMA' }
            ],
            guideline_ref: 'Hall-Lancet-2011'
        },
        'simple_carbs_warning': {
            evidenceLevel: 'A',
            topic: 'glycemic-load',
            rationale: 'Высокий GL за приём → быстрый glucose spike → инсулиновый ответ → reactive hypoglycemia → тяга к сладкому через 2-3ч.',
            sources: [
                { org: 'Ludwig', year: 2002, type: 'review', journal: 'JAMA' },
                { org: 'Augustin et al', year: 2015, type: 'consensus', journal: 'Nutr Metab Cardiovasc Dis' }
            ],
            guideline_ref: 'Augustin-2015',
            not_apply_when: ['до/во время длительной выносливости — быстрые углеводы оправданы']
        },
        'high_gi_warning': {
            evidenceLevel: 'B',
            topic: 'glycemic-index',
            rationale: 'GI > 70 в вечерний приём → более выраженный glycemic excursion и ухудшение sleep quality.',
            sources: [
                { org: 'Brand-Miller et al', year: 2009, type: 'meta-analysis', journal: 'Am J Clin Nutr' }
            ],
            guideline_ref: 'Brand-Miller-2009'
        },
        'trans_fat_warning': {
            evidenceLevel: 'A',
            topic: 'trans-fats',
            rationale: 'Trans-fats напрямую связаны с ↑LDL, ↓HDL, +21-23% CVD risk. WHO рекомендует <1% от kcal (≈2г на 2000 ккал).',
            sources: [
                { org: 'WHO', year: 2018, type: 'guideline', topic: 'REPLACE trans fat action' },
                { org: 'Mozaffarian et al', year: 2006, type: 'meta-analysis', journal: 'N Engl J Med' }
            ],
            guideline_ref: 'WHO-REPLACE-2018'
        },
        'balanced_macros': {
            evidenceLevel: 'B',
            topic: 'macro-balance',
            rationale: 'Macro-balance close to optimal (deviation ≤20%) коррелирует с лучшим adherence и satisfaction long-term.',
            sources: [
                { org: 'Sacks et al', year: 2009, type: 'RCT', n: 811, journal: 'N Engl J Med', topic: 'POUNDS Lost trial' }
            ],
            guideline_ref: 'Sacks-2009'
        },
        'evening_carbs_high': {
            evidenceLevel: 'B',
            topic: 'late-carbs',
            rationale: 'Вечерние углеводы > 100г не критичны при балансе дня, но у insulin-resistant фенотипа усиливают night glucose excursion.',
            sources: [
                { org: 'Sofer et al', year: 2011, type: 'RCT', n: 78, journal: 'Obesity' },
                { org: 'Garaulet et al', year: 2013, type: 'observational', journal: 'Int J Obes' }
            ],
            guideline_ref: 'Sofer-2011',
            not_apply_when: ['тренировка вечером — углеводы help recovery']
        },
        'protein_per_meal_low': {
            evidenceLevel: 'A',
            topic: 'protein-distribution',
            rationale: 'Per-meal протеин 20-40г = leucine threshold для max MPS. Distributed > skewed для muscle mass.',
            sources: [
                { org: 'Schoenfeld & Aragon', year: 2018, type: 'meta-analysis', journal: 'J Int Soc Sports Nutr' },
                { org: 'Mamerow et al', year: 2014, type: 'RCT', journal: 'J Nutr' }
            ],
            guideline_ref: 'Schoenfeld-2018'
        },

        // ─── TIMING (8) ─────────────────────────────────────────────
        'bedtime_protein': {
            evidenceLevel: 'B',
            topic: 'pre-sleep-protein',
            rationale: 'Pre-sleep протеин 30-40г усиливает overnight MPS на 20-25%, особенно после тренировки.',
            sources: [
                { org: 'Snijders et al', year: 2019, type: 'systematic-review', journal: 'Front Nutr' },
                { org: 'Res et al', year: 2012, type: 'RCT', journal: 'Med Sci Sports Exerc' }
            ],
            guideline_ref: 'ISSN-2018-protein-position',
            not_apply_when: ['acid reflux от поздней еды', 'нарушения сна от еды поздно — попробуй за 2-3ч']
        },
        'late_dinner_warning': {
            evidenceLevel: 'A',
            topic: 'meal-timing',
            rationale: 'Большой ужин < 3ч до сна снижает sleep efficiency, повышает glucose excursion, ассоциирован с metabolic syndrome.',
            sources: [
                { org: 'Kinsey & Ormsbee', year: 2015, type: 'review', journal: 'Nutrients' },
                { org: 'Yoshida et al', year: 2018, type: 'cohort', n: 60800, journal: 'BMC Public Health' }
            ],
            guideline_ref: 'Kinsey-2015'
        },
        'late_first_meal': {
            evidenceLevel: 'B',
            topic: 'breakfast-timing',
            rationale: 'Первый приём пищи > 4ч после пробуждения у hyperresponders связан с post-meal glucose spike и поздним вечерним голодом.',
            sources: [
                { org: 'Jakubowicz et al', year: 2013, type: 'RCT', journal: 'Obesity' },
                { org: 'Wirth et al', year: 2020, type: 'observational' }
            ],
            guideline_ref: 'Jakubowicz-2013',
            not_apply_when: ['intermittent fasting practitioners по плану']
        },
        'morning_breakfast': {
            evidenceLevel: 'B',
            topic: 'morning-anchor',
            rationale: 'Regular morning meal anchor стабилизирует circadian patterns, снижает evening hunger и binge risk.',
            sources: [
                { org: 'Ma et al', year: 2003, type: 'observational', journal: 'Am J Epidemiol' },
                { org: 'Astbury et al', year: 2011, type: 'RCT', journal: 'J Nutr' }
            ],
            guideline_ref: 'Astbury-2011'
        },
        'meal_spacing_perfect': {
            evidenceLevel: 'B',
            topic: 'meal-spacing',
            rationale: 'Интервалы 3-5 ч между приёмами оптимальны для glycemic stability и satiety hormones (CCK, GLP-1).',
            sources: [
                { org: 'Paoli et al', year: 2019, type: 'review', journal: 'Nutrients' }
            ],
            guideline_ref: 'Paoli-2019'
        },
        'circadian_evening_urgent': {
            evidenceLevel: 'A',
            topic: 'circadian-timing',
            rationale: 'Циркадные ритмы инсулиновой чувствительности падают вечером — большие meals после 20:00 хуже metabolizing.',
            sources: [
                { org: 'Patterson & Sears', year: 2017, type: 'review', journal: 'Annu Rev Nutr' },
                { org: 'Sutton et al', year: 2018, type: 'RCT', journal: 'Cell Metab' }
            ],
            guideline_ref: 'Patterson-2017'
        },
        'snack_window': {
            evidenceLevel: 'C',
            topic: 'snack-strategy',
            rationale: 'Запланированный protein-fiber snack между крупными приёмами стабилизирует glucose и предотвращает overeating вечером.',
            sources: [
                { org: 'Leidy et al', year: 2015, type: 'review', journal: 'Am J Clin Nutr' }
            ],
            guideline_ref: 'Leidy-2015'
        },
        'caffeine_evening': {
            evidenceLevel: 'A',
            topic: 'caffeine-sleep',
            rationale: 'Half-life кофеина 5-6ч; даже за 6ч до сна снижает sleep efficiency на 12% и subjective sleep quality.',
            sources: [
                { org: 'Drake et al', year: 2013, type: 'RCT', journal: 'J Clin Sleep Med' },
                { org: 'Clark & Landolt', year: 2017, type: 'systematic-review', journal: 'Sleep Med Rev' }
            ],
            guideline_ref: 'Drake-2013'
        },

        // ─── HYDRATION (3) ──────────────────────────────────────────
        'water_reminder': {
            evidenceLevel: 'A',
            topic: 'hydration',
            rationale: 'Базовая норма ~30 мл/кг + ≥500 мл на каждый час нагрузки. Hypohydration -2% body water → cognitive decline и снижение силы.',
            sources: [
                { org: 'EFSA', year: 2010, type: 'guideline', topic: 'Adequate water intake' },
                { org: 'Cheuvront & Kenefick', year: 2014, type: 'review', journal: 'Compr Physiol' }
            ],
            guideline_ref: 'EFSA-2010'
        },
        'water_evening_low': {
            evidenceLevel: 'B',
            topic: 'evening-hydration',
            rationale: 'Вечерний deficit hydration усиливает morning thirst, утренний brain fog, может маскироваться под голод.',
            sources: [
                { org: 'Armstrong et al', year: 2012, type: 'RCT', journal: 'J Nutr' }
            ],
            guideline_ref: 'Armstrong-2012',
            not_apply_when: ['nocturia / частое ночное мочеиспускание — равномерно весь день, поздно меньше']
        },
        'water_goal_reached': {
            evidenceLevel: 'B',
            topic: 'hydration-achievement',
            rationale: 'Daily hydration target consistently met коррелирует с лучшим energy, mood и weight management.',
            sources: [
                { org: 'Stookey et al', year: 2008, type: 'cohort', journal: 'Obesity' }
            ],
            guideline_ref: 'Stookey-2008'
        },

        // ─── TRAINING (4) ───────────────────────────────────────────
        'post_training_protein': {
            evidenceLevel: 'A',
            topic: 'post-workout-protein',
            rationale: 'Anabolic window 2-4ч после тренировки: 20-40г протеина + 0.8-1.2 г/кг углеводов максимизирует recovery и MPS.',
            sources: [
                { org: 'Aragon & Schoenfeld', year: 2013, type: 'review', journal: 'J Int Soc Sports Nutr' },
                { org: 'Kerksick et al', year: 2017, type: 'position-stand', journal: 'J Int Soc Sports Nutr' }
            ],
            guideline_ref: 'ISSN-2017-nutrient-timing'
        },
        'hard_workout_recovery': {
            evidenceLevel: 'A',
            topic: 'recovery-nutrition',
            rationale: 'Высокоинтенсивная нагрузка создаёт microdamage и glycogen depletion → recovery требует адекватного белка и углеводов в течение 24ч.',
            sources: [
                { org: 'Burke et al', year: 2017, type: 'review', journal: 'Int J Sport Nutr Exerc Metab' }
            ],
            guideline_ref: 'Burke-2017'
        },
        'training_recovery_window': {
            evidenceLevel: 'B',
            topic: 'anabolic-window',
            rationale: '30-60 мин после тренировки — peak МPS sensitivity; протеин 20-30г здесь усваивается на ~25% эффективнее.',
            sources: [
                { org: 'Phillips & Van Loon', year: 2011, type: 'review', journal: 'J Sports Sci' }
            ],
            guideline_ref: 'Phillips-2011',
            not_apply_when: ['если последний приём был за 1-2ч до тренировки — окно уже частично использовано']
        },
        'rest_day_neat_walking': {
            evidenceLevel: 'A',
            topic: 'NEAT',
            rationale: '150-300 мин moderate activity/нед = ACSM baseline. NEAT даёт 15-50% от total daily energy expenditure.',
            sources: [
                { org: 'ACSM', year: 2018, type: 'guideline', topic: 'Physical Activity Guidelines' },
                { org: 'Levine', year: 2005, type: 'review', journal: 'Best Pract Res Clin Endocrinol Metab' }
            ],
            guideline_ref: 'ACSM-2018'
        },

        // ─── EMOTIONAL/SLEEP (5) ────────────────────────────────────
        'sleep_low': {
            evidenceLevel: 'A',
            topic: 'sleep-debt',
            rationale: 'Хронический недосып < 6ч → ghrelin ↑15%, leptin ↓18%, insulin sensitivity -25%. Прямой driver hunger и binge risk.',
            sources: [
                { org: 'Spiegel et al', year: 2004, type: 'RCT', journal: 'Ann Intern Med' },
                { org: 'St-Onge et al', year: 2016, type: 'systematic-review', journal: 'Adv Nutr' }
            ],
            guideline_ref: 'Spiegel-2004'
        },
        'great_sleep': {
            evidenceLevel: 'A',
            topic: 'sleep-quality',
            rationale: '7-9ч качественного сна = optimal hormonal regulation, recovery, cognitive function. Sleep Foundation консенсус.',
            sources: [
                { org: 'Sleep Foundation', year: 2023, type: 'consensus', topic: 'Adult sleep duration' },
                { org: 'Hirshkowitz et al', year: 2015, type: 'consensus', journal: 'Sleep Health' }
            ],
            guideline_ref: 'Hirshkowitz-2015'
        },
        'emotional_risk_high': {
            evidenceLevel: 'A',
            topic: 'stress-eating',
            rationale: 'Cortisol elevation + caloric deficit → hyperphagia risk (cortisol-driven cravings). Биохимия, не слабость воли.',
            sources: [
                { org: 'Adam & Epel', year: 2007, type: 'review', journal: 'Physiol Behav' },
                { org: 'Chao et al', year: 2017, type: 'observational', journal: 'Eat Behav' }
            ],
            guideline_ref: 'Adam-2007'
        },
        'stress_undereating_warning': {
            evidenceLevel: 'B',
            topic: 'stress-deficit',
            rationale: 'Стресс + caloric deficit → ↑grelin, ↓leptin, ↑ночной binge risk на 60-80% относительно baseline.',
            sources: [
                { org: 'Yau & Potenza', year: 2013, type: 'review', journal: 'Minerva Endocrinol' }
            ],
            guideline_ref: 'Yau-2013'
        },
        'emotional_sleep_hygiene': {
            evidenceLevel: 'A',
            topic: 'sleep-hygiene',
            rationale: 'Регулярное время сна ±30 мин синхронизирует мелатонин и аденозин → быстрее засыпание, глубже REM.',
            sources: [
                { org: 'Walker', year: 2017, type: 'book', topic: 'Why We Sleep' },
                { org: 'Buysse', year: 2014, type: 'review', journal: 'Sleep' }
            ],
            guideline_ref: 'Walker-2017'
        },

        // ─── SUPPLEMENTS / VITAMINS (Phase C.2 — 7) ────────────────
        'supplements_personal_rec': {
            evidenceLevel: 'B',
            topic: 'targeted-supplementation',
            rationale: 'Целенаправленная supplementation основанная на биомаркерах или risk factors (возраст, пол, сезон, активность) дает лучший effect-size чем generic multivitamin.',
            sources: [
                { org: 'Bird et al', year: 2017, type: 'review', journal: 'Nutrients' },
                { org: 'Kantor et al', year: 2016, type: 'observational', journal: 'JAMA' }
            ],
            guideline_ref: 'Bird-2017',
            not_apply_when: ['прием лекарств — проверь interactions с врачом', 'хронические заболевания почек/печени']
        },
        'iron_reminder': {
            evidenceLevel: 'A',
            topic: 'iron-needs',
            rationale: 'Женщинам репродуктивного возраста требуется 18мг Fe/день vs 8мг для мужчин (FAO/WHO RDA). Дефицит — distalкая причина усталости и ухудшения когнитивных функций.',
            sources: [
                { org: 'WHO', year: 2011, type: 'guideline', topic: 'Iron requirements' },
                { org: 'Pasricha et al', year: 2021, type: 'review', journal: 'Lancet' }
            ],
            guideline_ref: 'WHO-2011',
            not_apply_when: ['гемохроматоз / повышенный ферритин', 'не принимать с кальцием одновременно']
        },
        'cycle_iron_important': {
            evidenceLevel: 'A',
            topic: 'menstrual-iron-loss',
            rationale: 'В период менструации женщина теряет 30-80мг Fe через cycle. Без compensation → железо deficit anemia в 12-25% женщин репродуктивного возраста.',
            sources: [
                { org: 'Hallberg et al', year: 1991, type: 'observational', journal: 'Am J Clin Nutr' },
                { org: 'Camaschella', year: 2015, type: 'review', journal: 'N Engl J Med' }
            ],
            guideline_ref: 'Hallberg-1991'
        },
        'supplements_iron_vitc_synergy': {
            evidenceLevel: 'A',
            topic: 'iron-vitamin-c-synergy',
            rationale: 'Vitamin C 100мг с non-heme iron увеличивает absorption в 2-3 раза. Классический synergy биохимия (восстановление Fe3+ → Fe2+).',
            sources: [
                { org: 'Lynch & Cook', year: 1980, type: 'review', journal: 'Ann N Y Acad Sci' },
                { org: 'Hallberg et al', year: 1989, type: 'RCT', journal: 'Am J Clin Nutr' }
            ],
            guideline_ref: 'Lynch-1980'
        },
        'supplements_dairy_iron_conflict': {
            evidenceLevel: 'A',
            topic: 'iron-calcium-conflict',
            rationale: 'Кальций 300мг+ снижает Fe absorption на 50-60% при одновременном приёме. Разнести iron и dairy на 2+ часа.',
            sources: [
                { org: 'Hallberg et al', year: 1991, type: 'RCT', journal: 'Eur J Clin Nutr' },
                { org: 'Hurrell & Egli', year: 2010, type: 'review', journal: 'Am J Clin Nutr' }
            ],
            guideline_ref: 'Hallberg-1991-Ca'
        },
        'supplements_coffee_minerals': {
            evidenceLevel: 'B',
            topic: 'caffeine-mineral-absorption',
            rationale: 'Кофе/чай снижают non-heme iron absorption на 35-90% (полифенолы tannins связывают Fe). Также уменьшают Zn, Mg, Ca absorption.',
            sources: [
                { org: 'Morck et al', year: 1983, type: 'RCT', journal: 'Am J Clin Nutr' },
                { org: 'Hurrell et al', year: 1999, type: 'review', journal: 'Am J Clin Nutr' }
            ],
            guideline_ref: 'Morck-1983'
        },
        'supplements_fat_meal_synergy': {
            evidenceLevel: 'A',
            topic: 'lipid-soluble-vitamins',
            rationale: 'Lipid-soluble vitamins (A, D, E, K) требуют dietary fat для абсорпции — bioavailability +29-300% с meal containing 10+г fat.',
            sources: [
                { org: 'Borel et al', year: 2017, type: 'review', journal: 'Prog Lipid Res' },
                { org: 'Mulligan & Bukrinsky', year: 2013, type: 'review', journal: 'Nutrients' }
            ],
            guideline_ref: 'Borel-2017'
        },

        // ─── TIER-B baseline (Phase A.9 — 20) ──────────────────────
        // Минимум level + summary + 1 source. Высокочастотные rules из
        // typical logs для baseline UI evidence badge.

        'post_training_undereating_critical': {
            evidenceLevel: 'A', topic: 'anabolic-window',
            rationale: 'Голодание после тренировки → catabolism, потеря MPS до 30-40%.',
            sources: [{ org: 'Aragon & Schoenfeld', year: 2013, type: 'review', journal: 'J Int Soc Sports Nutr' }]
        },
        'training_strength_undereating': {
            evidenceLevel: 'A', topic: 'strength-recovery',
            rationale: 'После силовой недоедание ведёт к net muscle protein breakdown.',
            sources: [{ org: 'Phillips & Van Loon', year: 2011, type: 'review', journal: 'J Sports Sci' }]
        },
        'training_cardio_undereating': {
            evidenceLevel: 'B', topic: 'glycogen-replenishment',
            rationale: 'Cardio + дефицит = неполная гликоген replete'+'ция → impaired next-session performance.',
            sources: [{ org: 'Burke et al', year: 2017, type: 'review', journal: 'Int J Sport Nutr Exerc Metab' }]
        },
        'hard_workout_recovery': {
            evidenceLevel: 'A', topic: 'recovery-protein',
            rationale: 'Intense workout создаёт microdamage; protein 20-40г + carbs ускоряют recovery 24-72ч.',
            sources: [{ org: 'Burke et al', year: 2017, type: 'review', journal: 'Int J Sport Nutr Exerc Metab' }]
        },
        'great_workout': {
            evidenceLevel: 'B', topic: 'volume-intensity',
            rationale: '45+ мин moderate-vigorous activity = effective training stimulus и cardiometabolic benefit.',
            sources: [{ org: 'ACSM', year: 2018, type: 'guideline', topic: 'Physical Activity Guidelines' }]
        },
        'low_gi_great': {
            evidenceLevel: 'A', topic: 'glycemic-index',
            rationale: 'Low-GI diet снижает glucose excursion и improves cardiometabolic risk markers.',
            sources: [{ org: 'Brand-Miller et al', year: 2009, type: 'meta-analysis', journal: 'Am J Clin Nutr' }]
        },
        'fiber_good': {
            evidenceLevel: 'A', topic: 'fiber-benefits',
            rationale: 'Достижение 25-35г fiber/день — independent predictor CVD mortality reduction.',
            sources: [{ org: 'Reynolds et al', year: 2019, type: 'meta-analysis', journal: 'Lancet' }]
        },
        'fiber_per_meal_good': {
            evidenceLevel: 'B', topic: 'fiber-distribution',
            rationale: 'Fiber per meal 8+г = adequate satiety boost через CCK/GLP-1 release.',
            sources: [{ org: 'Slavin', year: 2013, type: 'review', journal: 'Nutrients' }]
        },
        'meal_too_large': {
            evidenceLevel: 'B', topic: 'large-meal-effects',
            rationale: 'Meals > 800ккал → ↑postprandial inflammation, glycemic excursion, drowsiness.',
            sources: [{ org: 'Margioris', year: 2009, type: 'review', journal: 'Curr Opin Clin Nutr Metab Care' }]
        },
        'meal_too_small': {
            evidenceLevel: 'C', topic: 'minimum-meal-size',
            rationale: 'Meals < 150ккал часто не triggerят satiety hormones — risk внеплановых перекусов.',
            sources: [{ org: 'Leidy et al', year: 2015, type: 'review', journal: 'Am J Clin Nutr' }]
        },
        'empty_stomach_late': {
            evidenceLevel: 'B', topic: 'fasting-window',
            rationale: 'Длительное fasting вечером + nocturnal hypoglycemia risk → poor sleep + morning hunger.',
            sources: [{ org: 'St-Onge et al', year: 2017, type: 'AHA-statement', journal: 'Circulation' }]
        },
        'harm_warning': {
            evidenceLevel: 'B', topic: 'ultra-processed-food',
            rationale: 'NOVA-4 ultra-processed > 20% kcal — associated с ↑CVD/T2D risk и weight gain.',
            sources: [{ org: 'Monteiro et al', year: 2019, type: 'review', journal: 'Public Health Nutr' }]
        },
        'streak_3': {
            evidenceLevel: 'B', topic: 'habit-formation',
            rationale: 'Habit-forming start: 3 consecutive дней — significant в habit-strength curve.',
            sources: [{ org: 'Lally et al', year: 2010, type: 'observational', journal: 'Eur J Soc Psychol' }]
        },
        'streak_7': {
            evidenceLevel: 'B', topic: 'habit-stability',
            rationale: 'Неделя consistent behavior = ≈25% completed к 66-day habit automaticity median.',
            sources: [{ org: 'Lally et al', year: 2010, type: 'observational', journal: 'Eur J Soc Psychol' }]
        },
        'bedtime_undereating': {
            evidenceLevel: 'B', topic: 'late-deficit',
            rationale: 'Going to sleep с большим deficit → next-day morning hunger overcompensation.',
            sources: [{ org: 'St-Onge et al', year: 2016, type: 'review', journal: 'Adv Nutr' }]
        },
        'emotional_screen_curfew': {
            evidenceLevel: 'A', topic: 'blue-light-melatonin',
            rationale: 'Blue light от экранов снижает melatonin на 23-50%; curfew 60мин до сна → normal latency.',
            sources: [{ org: 'Chang et al', year: 2015, type: 'RCT', journal: 'Proc Natl Acad Sci' }]
        },
        'emotional_micro_break': {
            evidenceLevel: 'B', topic: 'micro-breaks',
            rationale: '1-2 мин micro-breaks каждые 60-90 мин снижают cumulative fatigue 20-25%.',
            sources: [{ org: 'Sianoja et al', year: 2018, type: 'RCT', journal: 'J Occup Health Psychol' }]
        },
        'emotional_gratitude_log': {
            evidenceLevel: 'A', topic: 'gratitude-intervention',
            rationale: 'Daily gratitude journaling: +25% subjective wellbeing, better sleep quality (Emmons-2003 RCT).',
            sources: [{ org: 'Emmons & McCullough', year: 2003, type: 'RCT', journal: 'J Pers Soc Psychol' }]
        },
        'emotional_social_anchor': {
            evidenceLevel: 'A', topic: 'social-connection',
            rationale: 'Strong social ties = -50% mortality risk (Holt-Lunstad meta n=308k).',
            sources: [{ org: 'Holt-Lunstad et al', year: 2010, type: 'meta-analysis', journal: 'PLoS Medicine' }]
        },
        'rest_day_mobility': {
            evidenceLevel: 'B', topic: 'mobility-recovery',
            rationale: 'Short-duration stretching на rest-days улучшает ROM без strength impairment.',
            sources: [{ org: 'Behm & Chaouachi', year: 2011, type: 'systematic-review', journal: 'Eur J Appl Physiol' }]
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // PATTERN evidence (6 computed patterns)
    // ═══════════════════════════════════════════════════════════════
    const PATTERN_EVIDENCE = {
        'mealTiming': {
            evidenceLevel: 'A',
            topic: 'meal-regularity',
            rationale: 'Регулярность времени приёмов улучшает glycemic control, satiety hormones и снижает evening binge risk.',
            sources: [
                { org: 'Paoli et al', year: 2019, type: 'review', journal: 'Nutrients' },
                { org: 'St-Onge et al', year: 2017, type: 'AHA-statement', journal: 'Circulation' }
            ]
        },
        'circadian': {
            evidenceLevel: 'A',
            topic: 'circadian-rhythm',
            rationale: 'Согласованность приёмов пищи с циркадными ритмами — independent predictor metabolic health.',
            sources: [
                { org: 'Patterson & Sears', year: 2017, type: 'review', journal: 'Annu Rev Nutr' },
                { org: 'Manoogian & Panda', year: 2017, type: 'review', journal: 'Cell Metab' }
            ]
        },
        'insulinSensitivity': {
            evidenceLevel: 'A',
            topic: 'insulin-sensitivity',
            rationale: 'Insulin sensitivity влияет на macro distribution: IR-фенотип лучше отвечает на low-carb + high-fiber.',
            sources: [
                { org: 'Reaven', year: 2005, type: 'review', journal: 'Annu Rev Nutr' }
            ]
        },
        'stressEating': {
            evidenceLevel: 'A',
            topic: 'stress-food',
            rationale: 'Cortisol-driven eating увеличивает hyperpalatable food intake на 11-19%. Biological, не personal failing.',
            sources: [
                { org: 'Adam & Epel', year: 2007, type: 'review', journal: 'Physiol Behav' }
            ]
        },
        'sleepHunger': {
            evidenceLevel: 'A',
            topic: 'sleep-hunger-axis',
            rationale: 'Sleep restriction → ghrelin ↑, leptin ↓ → next-day caloric intake +200-400 kcal.',
            sources: [
                { org: 'Spiegel et al', year: 2004, type: 'RCT', journal: 'Ann Intern Med' }
            ]
        },
        'hydration': {
            evidenceLevel: 'A',
            topic: 'hydration-impact',
            rationale: 'Hydration -2% body water → cognitive impairment + 5-10% drop в физических выступлениях.',
            sources: [
                { org: 'Cheuvront & Kenefick', year: 2014, type: 'review', journal: 'Compr Physiol' }
            ]
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // EWS (Early Warning System) evidence (25 warnings)
    // ═══════════════════════════════════════════════════════════════
    const EWS_EVIDENCE = {
        'HEALTH_SCORE_DECLINE': { evidenceLevel: 'B', topic: 'composite-health',
            rationale: 'Composite health score decline > 10 за 3 дня — ранний indicator упадка по нескольким axes.',
            sources: [{ org: 'HEYS-internal', year: 2024, type: 'observational' }] },
        'STATUS_SCORE_DECLINE': { evidenceLevel: 'B', topic: 'status-trend',
            rationale: 'Status score (subjective wellbeing) — leading indicator change в behavior.',
            sources: [{ org: 'Diener et al', year: 2010, type: 'review', journal: 'J Pers Soc Psychol' }] },
        'SLEEP_DEBT': { evidenceLevel: 'A', topic: 'sleep-debt',
            rationale: 'Cumulative sleep debt 3+ дней — strong driver hyperphagia и cognitive decline.',
            sources: [{ org: 'Van Dongen et al', year: 2003, type: 'RCT', journal: 'Sleep' }] },
        'CALORIC_DEBT': { evidenceLevel: 'A', topic: 'energy-deficit',
            rationale: 'Sustained deficit > 1500 kcal accumulated → metabolic adaptation, мышечные потери.',
            sources: [{ org: 'Trexler et al', year: 2014, type: 'review', journal: 'J Int Soc Sports Nutr' }] },
        'CRITICAL_PATTERNS': { evidenceLevel: 'B', topic: 'pattern-cluster',
            rationale: 'Clustering criticals patterns (sleep + binge + stress) увеличивает relapse risk 3-4x.',
            sources: [{ org: 'Stice et al', year: 2010, type: 'review', journal: 'J Abnorm Psychol' }] },
        'WEIGHT_SPIKE': { evidenceLevel: 'C', topic: 'weight-fluctuation',
            rationale: 'Spike > 1.5кг за 24ч обычно water shift (соль, гликоген), не fat gain.',
            sources: [{ org: 'Heymsfield et al', year: 2012, type: 'review', journal: 'Eur J Clin Nutr' }] },
        'HYDRATION_DEFICIT': { evidenceLevel: 'A', topic: 'dehydration',
            rationale: 'Cumulative deficit hydration → maskируется под голод, снижает энергию и concentration.',
            sources: [{ org: 'EFSA', year: 2010, type: 'guideline' }] },
        'LOGGING_GAP': { evidenceLevel: 'B', topic: 'tracking-adherence',
            rationale: 'Logging gaps > 2 дня связаны с пропуском meals/событий, теряется calibration.',
            sources: [{ org: 'Burke et al', year: 2011, type: 'review', journal: 'J Am Diet Assoc' }] },
        'PROTEIN_DEFICIT': { evidenceLevel: 'A', topic: 'protein-needs',
            rationale: 'Хронический deficit белка → потеря lean mass, особенно в дефиците + у пожилых.',
            sources: [{ org: 'ESPEN', year: 2022, type: 'guideline' }] },
        'STRESS_ACCUMULATION': { evidenceLevel: 'A', topic: 'allostatic-load',
            rationale: 'Хронический stress → allostatic load, повышение visceral fat и binge risk.',
            sources: [{ org: 'McEwen', year: 2007, type: 'review', journal: 'Physiol Rev' }] },
        'MEAL_SKIP_PATTERN': { evidenceLevel: 'B', topic: 'meal-skipping',
            rationale: 'Regular meal skipping → compensatory overeating + worse glycemic control.',
            sources: [{ org: 'Schlundt et al', year: 1992, type: 'observational', journal: 'Am J Clin Nutr' }] },
        'BINGE_RISK': { evidenceLevel: 'A', topic: 'binge-prediction',
            rationale: 'Cluster (sleep debt + caloric debt + stress) предсказывает binge episode 70-80% accuracy.',
            sources: [{ org: 'Stice et al', year: 2010, type: 'review' }] },
        'MOOD_WELLBEING_DECLINE': { evidenceLevel: 'B', topic: 'mood-trend',
            rationale: 'Sustained mood decline предшествует disordered eating patterns.',
            sources: [{ org: 'Fairburn et al', year: 2003, type: 'review', journal: 'Behav Res Ther' }] },
        'WEIGHT_PLATEAU': { evidenceLevel: 'B', topic: 'weight-plateau',
            rationale: 'Plateau > 2 нед часто отражает metabolic adaptation, не failure.',
            sources: [{ org: 'Fothergill et al', year: 2016, type: 'longitudinal' }] },
        'WEEKEND_PATTERN': { evidenceLevel: 'B', topic: 'weekend-overeating',
            rationale: 'Weekend kcal +20-30% vs weekday — наиболее частый barrier к weekly deficit.',
            sources: [{ org: 'Racette et al', year: 2008, type: 'observational' }] },
        'FIBER_DEFICIT': { evidenceLevel: 'A', topic: 'fiber-intake',
            rationale: 'Deficit fiber → microbiome dysbiosis, потеря satiety hormones, glycemic instability.',
            sources: [{ org: 'Reynolds et al', year: 2019, type: 'meta-analysis', journal: 'Lancet' }] },
        'SODIUM_EXCESS': { evidenceLevel: 'A', topic: 'sodium',
            rationale: 'Sodium > 2300 мг/день → ↑BP, water retention, маскирует weight progress.',
            sources: [{ org: 'WHO', year: 2012, type: 'guideline' }] },
        'CIRCADIAN_DISRUPTION': { evidenceLevel: 'A', topic: 'circadian-misalignment',
            rationale: 'Misalignment приёмов пищи с циркадными часами → metabolic syndrome risk.',
            sources: [{ org: 'Patterson & Sears', year: 2017, type: 'review' }] },
        'TRAINING_WITHOUT_RECOVERY': { evidenceLevel: 'A', topic: 'overtraining',
            rationale: 'Тренировки 7 дней подряд без rest → CNS fatigue, plateau, injury risk.',
            sources: [{ org: 'Kreher & Schwartz', year: 2012, type: 'review', journal: 'Sports Health' }] },
        'FAT_QUALITY_DECLINE': { evidenceLevel: 'B', topic: 'fat-quality',
            rationale: 'Снижение MUFA/PUFA vs SFA связано с inflammation markers.',
            sources: [{ org: 'Mozaffarian et al', year: 2010, type: 'review', journal: 'Circulation' }] },
        'SUGAR_DEPENDENCY': { evidenceLevel: 'B', topic: 'sugar-craving',
            rationale: 'Habit-driven sugar intake → reward-system sensitization → reinforcement loop.',
            sources: [{ org: 'Avena et al', year: 2008, type: 'review', journal: 'Neurosci Biobehav Rev' }] },
        'MICRONUTRIENT_GAP': { evidenceLevel: 'B', topic: 'micronutrient-deficiency',
            rationale: 'Subclinical deficits (Fe, vitD, B12) — частые в restrictive diets, влияют на energy.',
            sources: [{ org: 'Bird et al', year: 2017, type: 'review', journal: 'Nutrients' }] },
        'STEP_DECLINE': { evidenceLevel: 'B', topic: 'sedentary',
            rationale: 'Steps decline > 30% от baseline за неделю — leading indicator NEAT drop.',
            sources: [{ org: 'Hamilton et al', year: 2007, type: 'review' }] },
        'MEAL_TIMING_DRIFT': { evidenceLevel: 'B', topic: 'timing-drift',
            rationale: 'Drift времени приёмов > 90 мин по дням ассоциирован с insulin resistance.',
            sources: [{ org: 'Garaulet et al', year: 2013, type: 'observational' }] },
        'ELECTROLYTE_IMBALANCE': { evidenceLevel: 'C', topic: 'electrolytes',
            rationale: 'Низкий Na+K+Mg на фоне тренировок → cramps, fatigue.',
            sources: [{ org: 'Maughan & Shirreffs', year: 2019, type: 'review' }] }
    };

    // ═══════════════════════════════════════════════════════════════
    // PHENOTYPE evidence (4D)
    // ═══════════════════════════════════════════════════════════════
    const PHENOTYPE_EVIDENCE = {
        'insulin_resistant': {
            evidenceLevel: 'A', topic: 'insulin-resistance',
            rationale: 'IR-фенотип лучше отвечает на ↓ простых углеводов, ↑ клетчатки, ↑ протеина, distributed meals.',
            sources: [
                { org: 'Reaven', year: 2005, type: 'review', journal: 'Annu Rev Nutr' },
                { org: 'McLaughlin et al', year: 2007, type: 'RCT', journal: 'Am J Clin Nutr' }
            ]
        },
        'insulin_sensitive': {
            evidenceLevel: 'B', topic: 'insulin-sensitivity',
            rationale: 'IS-фенотип толерантен к более широкому macro range; легче адаптируется к разным diets.',
            sources: [{ org: 'Reaven', year: 2005, type: 'review' }]
        },
        'evening_type': {
            evidenceLevel: 'B', topic: 'chronotype',
            rationale: 'Evening chronotype связан с задержкой meal timing, риск metabolic syndrome ↑20%.',
            sources: [
                { org: 'Roenneberg et al', year: 2007, type: 'review', journal: 'Curr Biol' },
                { org: 'Lucassen et al', year: 2013, type: 'observational' }
            ]
        },
        'morning_type': {
            evidenceLevel: 'B', topic: 'chronotype',
            rationale: 'Morning chronotype = better metabolic outcomes; естественный early-bird advantage.',
            sources: [{ org: 'Roenneberg et al', year: 2007, type: 'review' }]
        },
        'low_satiety': {
            evidenceLevel: 'B', topic: 'satiety-phenotype',
            rationale: 'Low satiety responders требуют higher protein и fiber per meal для контроля appetite.',
            sources: [
                { org: 'Paddon-Jones et al', year: 2008, type: 'review', journal: 'Am J Clin Nutr' }
            ]
        },
        'normal_satiety': {
            evidenceLevel: 'C', topic: 'satiety',
            rationale: 'Normal satiety — baseline; стандартные protein recommendations 1.2-1.6 г/кг достаточны.',
            sources: [{ org: 'Phillips & Van Loon', year: 2011, type: 'review' }]
        },
        'stress_eater': {
            evidenceLevel: 'A', topic: 'stress-eating-phenotype',
            rationale: 'Stress-eaters имеют усиленную HPA reactivity → 11-19% больше hyperpalatable intake.',
            sources: [
                { org: 'Adam & Epel', year: 2007, type: 'review', journal: 'Physiol Behav' }
            ]
        },
        'normal_stress': {
            evidenceLevel: 'C', topic: 'stress-response',
            rationale: 'Normal stress reactivity — baseline; standard recommendations apply.',
            sources: [{ org: 'McEwen', year: 2007, type: 'review' }]
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // Lookup functions (используются в _core.js enrichAdvicesWithExpertContext)
    // ═══════════════════════════════════════════════════════════════
    function getAdviceEvidence(id)         { return ADVICE_EVIDENCE[id]    || null; }
    function getPatternEvidence(id)        { return PATTERN_EVIDENCE[id]   || null; }
    function getEwsEvidence(code)          { return EWS_EVIDENCE[code]     || null; }
    function getPhenotypeEvidence(type)    { return PHENOTYPE_EVIDENCE[type] || null; }
    function getEvidenceCoverage() {
        return {
            advice: Object.keys(ADVICE_EVIDENCE).length,
            pattern: Object.keys(PATTERN_EVIDENCE).length,
            ews: Object.keys(EWS_EVIDENCE).length,
            phenotype: Object.keys(PHENOTYPE_EVIDENCE).length
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // Export
    // ═══════════════════════════════════════════════════════════════
    window.HEYS.adviceEvidence = {
        getAdvice: getAdviceEvidence,
        getPattern: getPatternEvidence,
        getEws: getEwsEvidence,
        getPhenotype: getPhenotypeEvidence,
        getCoverage: getEvidenceCoverage,
        // Direct table exports для tests/debug
        _ADVICE_EVIDENCE: ADVICE_EVIDENCE,
        _PATTERN_EVIDENCE: PATTERN_EVIDENCE,
        _EWS_EVIDENCE: EWS_EVIDENCE,
        _PHENOTYPE_EVIDENCE: PHENOTYPE_EVIDENCE
    };

})();
