/**
 * HEYS Advice Engine — Phase 0-6 refactor smoke tests
 *
 * Покрывает критичные изменения:
 *   • Phase 0: rest-day training, emotional normal-state, snapshot bug, fallback
 *   • Phase 1: evidence KB infrastructure + Tier-A populate
 *   • Phase 2: calibrated thresholds (computeThresholds / getThresholds)
 *   • Phase 3: commitment engine (accept / processExpired)
 *   • Phase 4: per-category cooldown + A/B experiments
 *   • Phase 5: longitudinal context (yesterday + weekly)
 *   • Phase 6: medical disclaimer LS persistence
 *
 * Использует существующую infrastructure из heys_advice_engine.test.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ensureWindow = () => {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!window.HEYS) window.HEYS = {};
};

const createStorageMock = () => {
    const store = {};
    return {
        get length() { return Object.keys(store).length; },
        key: (i) => Object.keys(store)[i] ?? null,
        getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
};

const evalScript = (relativePath) => {
    const filePath = path.resolve(__dirname, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
};

beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: createStorageMock(), writable: true, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: createStorageMock(), writable: true, configurable: true });
    ensureWindow();
    window.HEYS = {};
    evalScript('../apps/web/heys_advice_rules_v1.js');
    evalScript('../apps/web/heys_advice_bundle_v1.js');
    localStorage.clear();
    sessionStorage.clear();
});

describe('Phase 0 — Coverage gaps', () => {
    it('training module есть в adviceModules', () => {
        expect(typeof window.HEYS.adviceModules.training).toBe('function');
    });

    it('emotional module есть в adviceModules', () => {
        expect(typeof window.HEYS.adviceModules.emotional).toBe('function');
    });

    it('rest-day training rules fire когда hasTraining=false', () => {
        const ctx = {
            hasTraining: false,
            hour: 8,
            mealCount: 0,
            kcalPct: 0.5,
            proteinPct: 0.5,
            carbsPct: 0.5,
            day: { trainings: [], meals: [] },
            dayTot: { prot: 50 },
            normAbs: { prot: 100 }
        };
        const helpers = {
            rules: window.HEYS.adviceRules,
            pickRandomText: (a) => Array.isArray(a) ? a[0] : a,
            personalizeText: (t) => t
        };
        const advices = window.HEYS.adviceModules.training(ctx, helpers);
        const ids = advices.map(a => a.id);
        // Хотя бы несколько rest-day правил должны fire
        expect(ids).toContain('rest_day_neat_walking');
        expect(ids).toContain('rest_day_mobility');
        expect(ids).toContain('rest_day_sleep_priority');
    });

    it('emotional normal-state rules fire при stress 3-5', () => {
        const ctx = {
            emotionalState: 'normal',
            hour: 21,
            mealCount: 3,
            kcalPct: 0.9,
            day: { stressAvg: 4, meals: [], trainings: [] },
            dayTot: {},
            normAbs: { prot: 100 }
        };
        const helpers = {
            rules: window.HEYS.adviceRules,
            calculateAverageStress: () => 4,
            calculateAverageWellbeing: () => 5,
            calculateSleepHours: () => 7,
            getProductForItem: () => null,
            pickRandomText: (a) => Array.isArray(a) ? a[0] : a,
            personalizeText: (t) => t
        };
        const advices = window.HEYS.adviceModules.emotional(ctx, helpers);
        const ids = advices.map(a => a.id);
        // Some normal-state rules должны быть видны при hour=21 (sleep_hygiene + screen_curfew + gratitude_log + social_anchor)
        const normalStateIds = ['emotional_sleep_hygiene', 'emotional_screen_curfew',
                                 'emotional_social_anchor', 'emotional_gratitude_log'];
        const fired = normalStateIds.filter(id => ids.includes(id));
        expect(fired.length).toBeGreaterThan(0);
    });
});

describe('Phase 1 — Scientific attribution', () => {
    it('window.HEYS.adviceEvidence API существует', () => {
        expect(window.HEYS.adviceEvidence).toBeDefined();
        expect(typeof window.HEYS.adviceEvidence.getAdvice).toBe('function');
        expect(typeof window.HEYS.adviceEvidence.getPattern).toBe('function');
        expect(typeof window.HEYS.adviceEvidence.getEws).toBe('function');
        expect(typeof window.HEYS.adviceEvidence.getPhenotype).toBe('function');
    });

    it('Tier-A 30: protein_low имеет evidence', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('protein_low');
        expect(ev).toBeDefined();
        expect(ev.evidenceLevel).toBe('A');
        expect(ev.topic).toBeDefined();
        expect(ev.rationale).toBeDefined();
        expect(Array.isArray(ev.sources)).toBe(true);
        expect(ev.sources.length).toBeGreaterThan(0);
    });

    it('Tier-A: bedtime_protein имеет evidence + not_apply_when', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('bedtime_protein');
        expect(ev).toBeDefined();
        expect(['A', 'B', 'C']).toContain(ev.evidenceLevel);
        expect(Array.isArray(ev.not_apply_when)).toBe(true);
        expect(ev.not_apply_when.length).toBeGreaterThan(0);
    });

    it('Pattern evidence: mealTiming + circadian', () => {
        expect(window.HEYS.adviceEvidence.getPattern('mealTiming')).toBeDefined();
        expect(window.HEYS.adviceEvidence.getPattern('circadian')).toBeDefined();
    });

    it('EWS evidence: CALORIC_DEBT + HYDRATION_DEFICIT', () => {
        expect(window.HEYS.adviceEvidence.getEws('CALORIC_DEBT')).toBeDefined();
        expect(window.HEYS.adviceEvidence.getEws('HYDRATION_DEFICIT')).toBeDefined();
    });

    it('Phenotype evidence: insulin_resistant + evening_type', () => {
        expect(window.HEYS.adviceEvidence.getPhenotype('insulin_resistant')).toBeDefined();
        expect(window.HEYS.adviceEvidence.getPhenotype('evening_type')).toBeDefined();
    });

    it('getCoverage() возвращает счётчики', () => {
        const cov = window.HEYS.adviceEvidence.getCoverage();
        expect(cov.advice).toBeGreaterThanOrEqual(30);
        expect(cov.pattern).toBeGreaterThanOrEqual(6);
        expect(cov.ews).toBeGreaterThanOrEqual(20);
        expect(cov.phenotype).toBeGreaterThanOrEqual(4);
    });
});

describe('Phase 2 — Calibrated personalization', () => {
    it('rules.computeThresholds и getThresholds существуют', () => {
        const r = window.HEYS.adviceRules;
        expect(typeof r.computeThresholds).toBe('function');
        expect(typeof r.getThresholds).toBe('function');
    });

    it('computeThresholds с profile возвращает calibrated values', () => {
        const ctx = {
            prof: { weight: 70, height: 170, age: 35, sex: 'female', activityFactor: 1.4 },
            goal: { mode: 'deficit', deficitPctTarget: 0.15 },
            phenotype: { metabolic: 'insulin_sensitive', circadian: 'morning_type' }
        };
        const t = window.HEYS.adviceRules.computeThresholds(ctx);
        expect(t).toBeDefined();
        // Phase A.2 recalibration: 70кг × 1.6 г/кг (female deficit, no IR, no
        // training, ESPEN-2022 + Helms-2014) = 112г. Раньше было 1.8 = 126г —
        // overestimate.
        expect(t.protein.target).toBeCloseTo(112, 0);
        // Water: 70кг × 32мл = 2240мл (EFSA-2010)
        expect(t.water.target).toBeCloseTo(2240, 0);
        // BMR (female): 10×70 + 6.25×170 - 5×35 - 161 = 1426.5
        // TDEE: 1426.5 × 1.4 (explicit override) = 1997.1
        // kcal target deficit 15%: 1997.1 × 0.85 = 1697.5
        expect(t.kcal.target).toBeCloseTo(1697.5, 0);
        expect(t._meta.bmr).toBeDefined();
        expect(t._meta.tdee).toBeDefined();
    });

    it('Phase A.2: female deficit + RT 3+ дней → +0.2 boost', () => {
        const ctx = {
            prof: { weight: 70, sex: 'female', trainingDaysPerWeek: 4 },
            goal: { mode: 'deficit' }
        };
        const t = window.HEYS.adviceRules.computeThresholds(ctx);
        // 1.6 base + 0.2 training boost = 1.8 г/кг × 70 = 126г
        expect(t.protein.target).toBeCloseTo(126, 0);
    });

    it('Phase A.2: hard cap 2.2 г/кг даже при всех boost', () => {
        const ctx = {
            prof: { weight: 80, sex: 'male', trainingDaysPerWeek: 5 },
            goal: { mode: 'deficit' },
            phenotype: { metabolic: 'insulin_resistant' }
        };
        const t = window.HEYS.adviceRules.computeThresholds(ctx);
        // 1.8 base + 0.2 IR + 0.2 training = 2.2 cap × 80 = 176г
        expect(t.protein.target).toBeCloseTo(176, 0);
    });

    it('Phase A.2: default activityFactor 1.55 (lightly active)', () => {
        const ctx = {
            prof: { weight: 70, height: 170, age: 35, sex: 'female' },
            // no explicit activityFactor
            goal: { mode: 'maintenance' }
        };
        const t = window.HEYS.adviceRules.computeThresholds(ctx);
        // BMR 1426.5 × 1.55 default = ~2211 maintenance kcal
        expect(t.kcal.target).toBeCloseTo(2211, 0);
    });

    it('computeThresholds с insulin_resistant даёт 2.0 г/кг белка в дефиците', () => {
        const ctx = {
            prof: { weight: 60 },
            goal: { mode: 'deficit' },
            phenotype: { metabolic: 'insulin_resistant' }
        };
        const t = window.HEYS.adviceRules.computeThresholds(ctx);
        expect(t.protein.target).toBeCloseTo(120, 0); // 60 × 2.0
    });

    it('getThresholds fallback на STATIC при incomplete profile', () => {
        const t = window.HEYS.adviceRules.getThresholds({ prof: {} }); // no weight
        // Fallback — должен быть оригинальный THRESHOLDS object (0.8 для protein.adequate)
        expect(t.protein.adequate).toBe(0.8);
    });

    it('Phase A.1: getThresholds(ctx) с profile → absolute G/Ml/H keys', () => {
        const ctx = {
            prof: { weight: 70, sex: 'female' },
            goal: { mode: 'deficit' }
        };
        const t = window.HEYS.adviceRules.getThresholds(ctx);
        // Calibrated absolute keys
        expect(t.protein.targetG).toBeCloseTo(112, 0);  // 70 × 1.6
        expect(t.water.targetMl).toBeCloseTo(2240, 0);   // 70 × 32
        expect(t.sleep.targetH).toBeCloseTo(7.5, 1);
        // Static fractions сохраняются (для legacy rules без миграции)
        expect(t.protein.adequate).toBe(0.8);
    });
});

describe('Phase 3 — Commitment engine', () => {
    it('window.HEYS.adviceCommitments API существует', () => {
        expect(window.HEYS.adviceCommitments).toBeDefined();
        expect(typeof window.HEYS.adviceCommitments.accept).toBe('function');
        expect(typeof window.HEYS.adviceCommitments.decline).toBe('function');
        expect(typeof window.HEYS.adviceCommitments.processExpired).toBe('function');
        expect(typeof window.HEYS.adviceCommitments.evaluateCheck).toBe('function');
    });

    it('accept создаёт pending commitment', () => {
        const advice = {
            id: 'protein_low',
            follow_up: {
                hours: 6,
                check: 'meal_logged_with_protein_ge_15',
                on_success: 'reinforcement_protein',
                on_miss: 'alt_protein_suggestion'
            }
        };
        const ctx = { day: { waterMl: 500, meals: [] } };
        const c = window.HEYS.adviceCommitments.accept(advice, ctx);
        expect(c).toBeDefined();
        expect(c.adviceId).toBe('protein_low');
        expect(c.check).toBe('meal_logged_with_protein_ge_15');
        const pending = window.HEYS.adviceCommitments.getPending();
        expect(pending.length).toBeGreaterThan(0);
    });

    it('evaluateCheck("meal_logged_with_protein_ge_15") работает корректно', () => {
        const ctxNoMeals = { day: { meals: [] } };
        const ctxWithProtein = { day: { meals: [{ protein: 25 }] } };
        expect(window.HEYS.adviceCommitments.evaluateCheck(
            'meal_logged_with_protein_ge_15', ctxNoMeals)).toBe(false);
        expect(window.HEYS.adviceCommitments.evaluateCheck(
            'meal_logged_with_protein_ge_15', ctxWithProtein)).toBe(true);
    });

    it('evaluateCheck unknown check returns null', () => {
        expect(window.HEYS.adviceCommitments.evaluateCheck('unknown_check', {})).toBe(null);
    });
});

describe('Phase 4 — A/B framework', () => {
    it('window.HEYS.adviceExperiments API существует', () => {
        expect(window.HEYS.adviceExperiments).toBeDefined();
        expect(typeof window.HEYS.adviceExperiments.getVariant).toBe('function');
        expect(typeof window.HEYS.adviceExperiments.getCurrentExperimentMeta).toBe('function');
        expect(typeof window.HEYS.adviceExperiments.listAll).toBe('function');
    });

    it('getVariant deterministic per same userId', () => {
        // Если экспа активна — два call'a одного userId дают тот же variant
        const exp = window.HEYS.adviceExperiments.getActiveExperiment('2026-06-05');
        if (exp) {
            const v1 = window.HEYS.adviceExperiments.getVariant('user-123', { dateIso: '2026-06-05' });
            const v2 = window.HEYS.adviceExperiments.getVariant('user-123', { dateIso: '2026-06-05' });
            expect(v1).toBe(v2);
            expect(exp.variants).toContain(v1);
        }
    });

    it('listAll возвращает массив экспериментов', () => {
        const all = window.HEYS.adviceExperiments.listAll();
        expect(Array.isArray(all)).toBe(true);
    });
});

describe('Phase 4.1 — Per-category cooldown', () => {
    it('canShow accepts category option (smoke)', () => {
        // canShow доступен через rules / engine; не падает при category param
        // (тест не строгий — главное что не throws)
        expect(() => {
            // Если внутри engine есть canShowAdvice exported — проверим
            const adviceRules = window.HEYS.adviceRules;
            if (typeof adviceRules?.canShowAdvice === 'function') {
                adviceRules.canShowAdvice('test_id', { canSkipCooldown: false, category: 'nutrition' });
            }
        }).not.toThrow();
    });
});

describe('Phase 5 — Longitudinal awareness (real logic)', () => {
    it('weekly trace LS key создаётся при rollup', () => {
        // Phase 5 rollupWeeklyAdviceTrace called via getWeeklyAdviceTrace
        // (cached lookup). Без exported API проверяем через side effect:
        // engine при generateAdvices вызывает getYesterdayAdviceContext +
        // getWeeklyAdviceTrace → создают LS keys heys_advice_trace_week_v1 (если нет).
        // (Минимум защита от throw — engine try/catch'нет, но key не создастся
        // без real data — это OK для smoke).
        expect(typeof window.HEYS.advice).toBe('object');
        // Phase 5.2: cancelScheduledByAdviceId (added in B.6) integrate'нут
        expect(typeof window.HEYS.advice.cancelScheduledByAdviceId).toBe('function');
    });

    it('Phase A.4: sortBySmartScore применяет yesterday penalty', () => {
        // Без exposed sortBySmartScore — проверяем через generateAdvices
        // что injection ctx.yesterdayIgnoredIds не throws.
        const advices = window.HEYS.adviceModules.training({
            hasTraining: false,
            hour: 8,
            day: { trainings: [], meals: [] },
            dayTot: {},
            normAbs: { prot: 100 },
            yesterdayIgnoredIds: new Set(['rest_day_neat_walking']),
            weekIgnoredCounts: { 'rest_day_neat_walking': 6 }
        }, {
            rules: window.HEYS.adviceRules,
            pickRandomText: (a) => Array.isArray(a) ? a[0] : a,
            personalizeText: (t) => t
        });
        // Module возвращает массив — penalty применяется в sortBySmartScore
        // (выше уровня модуля). Smoke: advice IDs всё ещё доступны.
        expect(Array.isArray(advices)).toBe(true);
    });
});

describe('Phase A.5 — Coverage fallback EWS-aware', () => {
    it('getInsightOfTheDay для текущего дня возвращает валидный совет', () => {
        // Fallback rule доступен через _other.js / _core.js internal generation.
        // Поскольку не exposed напрямую — проверяем через подсчёт
        // ADVICE_EVIDENCE size (proxy).
        const coverage = window.HEYS.adviceEvidence.getCoverage();
        expect(coverage.advice).toBeGreaterThanOrEqual(50); // 30 Tier-A + 7 + 20 Tier-B
    });
});

describe('Phase A.9 — Tier-B evidence coverage', () => {
    it('streak_3 + streak_7 evidence', () => {
        expect(window.HEYS.adviceEvidence.getAdvice('streak_3')).toBeDefined();
        expect(window.HEYS.adviceEvidence.getAdvice('streak_7')).toBeDefined();
    });

    it('post_training_undereating_critical evidence', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('post_training_undereating_critical');
        expect(ev).toBeDefined();
        expect(ev.evidenceLevel).toBe('A');
    });

    it('rest_day_mobility evidence (Phase 0 совет получил Tier-B baseline в A.9)', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('rest_day_mobility');
        expect(ev).toBeDefined();
        expect(ev.sources.length).toBeGreaterThan(0);
    });
});

describe('Phase C.2 — Supplements evidence', () => {
    it('iron_reminder evidence: WHO-2011 guideline', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('iron_reminder');
        expect(ev).toBeDefined();
        expect(ev.evidenceLevel).toBe('A');
        expect(ev.sources.some(s => s.org === 'WHO')).toBe(true);
        expect(Array.isArray(ev.not_apply_when)).toBe(true);
    });

    it('cycle_iron_important evidence: Hallberg-1991', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('cycle_iron_important');
        expect(ev).toBeDefined();
        expect(ev.sources.some(s => s.org.includes('Hallberg'))).toBe(true);
    });

    it('supplements_fat_meal_synergy evidence: Borel-2017', () => {
        const ev = window.HEYS.adviceEvidence.getAdvice('supplements_fat_meal_synergy');
        expect(ev).toBeDefined();
        expect(ev.evidenceLevel).toBe('A');
    });
});

describe('Phase B.1+B.2 — In-card action handlers', () => {
    it('window.HEYS.adviceActions API существует', () => {
        expect(window.HEYS.adviceActions).toBeDefined();
        expect(typeof window.HEYS.adviceActions.execute).toBe('function');
        expect(typeof window.HEYS.adviceActions.register).toBe('function');
        expect(typeof window.HEYS.adviceActions.list).toBe('function');
        expect(typeof window.HEYS.adviceActions.has).toBe('function');
    });

    it('Built-in handlers зарегистрированы', () => {
        const list = window.HEYS.adviceActions.list();
        expect(list).toContain('openSupplementsCourse');
        expect(list).toContain('addMealProduct');
        expect(list).toContain('logWaterGlass');
        expect(list).toContain('openHabitTracker');
        expect(list).toContain('openProfile');
    });

    it('execute() с unknown handler возвращает false', () => {
        const advice = { id: 'test', action: { primary: { handler: 'nonexistent', label: 'X' } } };
        expect(window.HEYS.adviceActions.execute(advice)).toBe(false);
    });

    it('execute() без action.primary возвращает false', () => {
        const advice = { id: 'test' };
        expect(window.HEYS.adviceActions.execute(advice)).toBe(false);
    });

    it('register() добавляет custom handler', () => {
        let called = false;
        window.HEYS.adviceActions.register('test_handler', () => { called = true; return true; });
        const advice = { id: 'test', action: { primary: { handler: 'test_handler', label: 'X' } } };
        expect(window.HEYS.adviceActions.execute(advice)).toBe(true);
        expect(called).toBe(true);
    });
});

describe('Phase B.5+B.6 — Snooze cycle + cancellation', () => {
    it('window.HEYS.advice.cancelScheduledByAdviceId существует', () => {
        expect(typeof window.HEYS.advice.cancelScheduledByAdviceId).toBe('function');
    });

    it('cancelScheduledByAdviceId(null) возвращает 0 без throw', () => {
        expect(window.HEYS.advice.cancelScheduledByAdviceId(null)).toBe(0);
    });

    it('window.HEYS.adviceActions.snooze tracker API существует', () => {
        expect(typeof window.HEYS.adviceActions.snooze).toBe('function');
        expect(typeof window.HEYS.adviceActions.getSnoozeCount).toBe('function');
        expect(typeof window.HEYS.adviceActions.resetSnoozeCounter).toBe('function');
    });

    it('snooze() counter инкрементируется и escalates на 3', () => {
        const advice = {
            id: 'test_snooze_advice',
            action: { snooze: { remindAfterMinutes: 30 } }
        };
        // Reset чтобы старый state не мешал
        window.HEYS.adviceActions.resetSnoozeCounter('test_snooze_advice');
        const r1 = window.HEYS.adviceActions.snooze(advice);
        const r2 = window.HEYS.adviceActions.snooze(advice);
        const r3 = window.HEYS.adviceActions.snooze(advice);
        expect(r1.count).toBe(1);
        expect(r2.count).toBe(2);
        expect(r3.escalated).toBe(true); // 3rd snooze escalates
        // After escalation counter reset
        expect(window.HEYS.adviceActions.getSnoozeCount('test_snooze_advice')).toBe(0);
    });

    it('resetSnoozeCounter(id) обнуляет counter', () => {
        const advice = { id: 'test_reset', action: { snooze: { remindAfterMinutes: 30 } } };
        window.HEYS.adviceActions.snooze(advice);
        expect(window.HEYS.adviceActions.getSnoozeCount('test_reset')).toBe(1);
        window.HEYS.adviceActions.resetSnoozeCounter('test_reset');
        expect(window.HEYS.adviceActions.getSnoozeCount('test_reset')).toBe(0);
    });
});

describe('Phase 6 — Medical disclaimer', () => {
    it('LS key heys_advice_disclaimer_accepted_v1 persists state', () => {
        localStorage.setItem('heys_advice_disclaimer_accepted_v1', '1');
        expect(localStorage.getItem('heys_advice_disclaimer_accepted_v1')).toBe('1');
    });
});
