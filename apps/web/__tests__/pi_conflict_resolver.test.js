import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
    global.window = global;
    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};

    // Load module via eval (matches existing test pattern in pi_early_warning.test.js)
    const modulePath = path.resolve(__dirname, '../insights/pi_conflict_resolver.js');
    const moduleContent = fs.readFileSync(modulePath, 'utf8');
    eval(moduleContent);
});

describe('R-INS-2C: pi_conflict_resolver', () => {
    let resolver;

    beforeAll(() => {
        resolver = global.HEYS.InsightsPI.conflictResolver;
    });

    it('module exports resolveConflicts + internals', () => {
        expect(resolver).toBeDefined();
        expect(typeof resolver.resolveConflicts).toBe('function');
        expect(resolver._internals).toBeDefined();
    });

    describe('Levenshtein + similarity', () => {
        it('identical strings → similarity 1.0', () => {
            const sim = resolver._internals.similarity('Ешь больше белка', 'Ешь больше белка');
            expect(sim).toBe(1);
        });

        it('typo difference → similarity > 0.8', () => {
            const sim = resolver._internals.similarity('Ешь больше белка', 'Ешь больше белк');
            expect(sim).toBeGreaterThan(0.8);
        });

        it('completely different → similarity < 0.3', () => {
            const sim = resolver._internals.similarity('Ешь больше белка', 'Снизь стресс');
            expect(sim).toBeLessThan(0.5);
        });
    });

    describe('Conflict detection by domain × direction', () => {
        it('STRESS_EATING (carbs+) + ADDED_SUGAR_DEPENDENCY (carbs-) → conflict resolved', () => {
            const advice = [
                {
                    text: 'Добавь сложных углеводов для серотонина',
                    domain: 'carbs',
                    direction: 'increase',
                    severity: 'medium',
                    confidence: 0.7,
                    source: 'pattern:STRESS_EATING'
                },
                {
                    text: 'Избегай быстрых углеводов вечером',
                    domain: 'carbs',
                    direction: 'decrease',
                    severity: 'high',
                    confidence: 0.9,
                    source: 'pattern:ADDED_SUGAR_DEPENDENCY'
                }
            ];

            const result = resolver.resolveConflicts(advice, {});
            expect(result.length).toBe(1);
            // Винит "decrease" так как у него выше severity + confidence
            expect(result[0].direction).toBe('decrease');
        });

        it('phenotype.insulin_resistant override → favor "decrease carbs"', () => {
            const advice = [
                {
                    text: 'Углеводы — окей',
                    domain: 'carbs',
                    direction: 'increase',
                    severity: 'high',
                    confidence: 0.95,
                    source: 'pattern:STRESS_EATING'
                },
                {
                    text: 'Снизь быстрые углеводы',
                    domain: 'carbs',
                    direction: 'decrease',
                    severity: 'low',
                    confidence: 0.5,
                    source: 'pattern:SUGAR_DEPENDENCY'
                }
            ];

            const result = resolver.resolveConflicts(advice, {
                phenotype: { metabolic: 'insulin_resistant' }
            });
            expect(result.length).toBe(1);
            // Override побеждает несмотря на низкую confidence у "decrease"
            expect(result[0].direction).toBe('decrease');
        });

        it('phenotype.insulin_sensitive override → favor "increase carbs"', () => {
            const advice = [
                {
                    text: 'Добавь углеводов',
                    domain: 'carbs',
                    direction: 'increase',
                    severity: 'low',
                    confidence: 0.4,
                    source: 'pattern:LOW_ENERGY'
                },
                {
                    text: 'Снизь углеводы',
                    domain: 'carbs',
                    direction: 'decrease',
                    severity: 'high',
                    confidence: 0.95,
                    source: 'pattern:ADDED_SUGAR_DEPENDENCY'
                }
            ];

            const result = resolver.resolveConflicts(advice, {
                phenotype: { metabolic: 'insulin_sensitive' }
            });
            expect(result.length).toBe(1);
            expect(result[0].direction).toBe('increase');
        });

        it('P8: timing-direction advice не считается conflict с increase/decrease', () => {
            const advice = [
                {
                    text: 'Добавь 30г белка к завтраку',
                    domain: 'protein',
                    direction: 'increase',
                    severity: 'medium',
                    confidence: 0.7,
                    source: 'pattern:C09'
                },
                {
                    text: 'Распредели белок равномерно по приёмам',
                    domain: 'protein',
                    direction: 'timing',
                    severity: 'medium',
                    confidence: 0.8,
                    source: 'pattern:C35'
                }
            ];

            const result = resolver.resolveConflicts(advice, {});
            // Оба advice должны остаться — это НЕ конфликт (quantity vs timing)
            expect(result.length).toBe(2);
        });
    });

    describe('Dedup by Levenshtein similarity > 0.8', () => {
        it('идентичные тексты → один в результате (max precedence wins)', () => {
            const advice = [
                {
                    text: 'Ешь больше белка',
                    domain: 'protein',
                    direction: 'increase',
                    severity: 'low',
                    confidence: 0.5,
                    source: 'pattern:C09'
                },
                {
                    text: 'Ешь больше белка',
                    domain: 'protein',
                    direction: 'increase',
                    severity: 'high',
                    confidence: 0.9,
                    source: 'ews:PROTEIN_DEFICIT'
                }
            ];

            const result = resolver.resolveConflicts(advice, {});
            expect(result.length).toBe(1);
            // ews source имеет precedence > pattern
            expect(result[0].source).toBe('ews:PROTEIN_DEFICIT');
        });

        it('почти-идентичные тексты (typo) → merged', () => {
            const advice = [
                {
                    text: 'Спи минимум 7 часов в сутки',
                    domain: 'sleep',
                    direction: 'increase',
                    confidence: 0.6,
                    severity: 'medium',
                    source: 'pattern:C06'
                },
                {
                    text: 'Спи минимум 7 часов всутки',  // typo
                    domain: 'sleep',
                    direction: 'increase',
                    confidence: 0.8,
                    severity: 'medium',
                    source: 'pattern:C13'
                }
            ];

            const result = resolver.resolveConflicts(advice, {});
            expect(result.length).toBe(1);
        });

        it('разные тексты — НЕ merge', () => {
            const advice = [
                {
                    text: 'Спи дольше',
                    domain: 'sleep',
                    direction: 'increase',
                    confidence: 0.6,
                    severity: 'medium',
                    source: 'pattern:C06'
                },
                {
                    text: 'Снизь стресс',
                    domain: 'stress',
                    direction: 'decrease',
                    confidence: 0.7,
                    severity: 'medium',
                    source: 'pattern:C11'
                }
            ];

            const result = resolver.resolveConflicts(advice, {});
            expect(result.length).toBe(2);
        });
    });

    describe('Precedence ordering', () => {
        it('phenotype source > ews > pattern', () => {
            const advice = [
                { text: 'A pattern', domain: 'a', direction: 'increase', source: 'pattern:X', confidence: 0.9, severity: 'medium' },
                { text: 'A ews', domain: 'b', direction: 'increase', source: 'ews:Y', confidence: 0.5, severity: 'medium' },
                { text: 'A phenotype', domain: 'c', direction: 'increase', source: 'phenotype:Z', confidence: 0.5, severity: 'medium' }
            ];
            const result = resolver.resolveConflicts(advice, {});
            expect(result[0].source).toMatch(/^phenotype/);
            expect(result[1].source).toMatch(/^ews/);
            expect(result[2].source).toMatch(/^pattern/);
        });
    });

    describe('Edge cases', () => {
        it('empty array → empty result', () => {
            expect(resolver.resolveConflicts([], {})).toEqual([]);
        });

        it('null array → empty result', () => {
            expect(resolver.resolveConflicts(null, {})).toEqual([]);
        });

        it('items without text are filtered out', () => {
            const advice = [
                { domain: 'a', direction: 'increase', severity: 'high' }, // no text
                { text: 'valid', domain: 'b', direction: 'increase', severity: 'medium' }
            ];
            const result = resolver.resolveConflicts(advice, {});
            expect(result.length).toBe(1);
            expect(result[0].text).toBe('valid');
        });

        it('undefined profile → fallback (no NaN, no crash)', () => {
            const advice = [
                { text: 'A', domain: 'carbs', direction: 'increase', confidence: 0.5, severity: 'medium', source: 'pattern:X' },
                { text: 'B', domain: 'carbs', direction: 'decrease', confidence: 0.7, severity: 'high', source: 'pattern:Y' }
            ];
            const result = resolver.resolveConflicts(advice, undefined);
            expect(result.length).toBe(1);
            // без phenotype — precedence решит, у B выше score
            expect(result[0].direction).toBe('decrease');
        });
    });
});
