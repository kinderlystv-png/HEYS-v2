import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Meal planner UI contract', () => {
    const source = fs.readFileSync(path.join(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');

    it('does not render a categorical ban on eating', () => {
        expect(source).not.toContain('Сегодня уже поздно есть');
        expect(source).toContain('Плотный приём уже близко ко сну');
    });

    it('keeps sleep context and factors in the details layer', () => {
        expect(source).toContain("plannerDecision.sleepContext.displayTime");
        expect(source).toContain("plannerDecision.topFactors");
        expect(source).toContain("'Подробнее'");
    });

    it('explains when a daily protein deficit is capped for one meal', () => {
        expect(source).toContain('весь дневной недобор за один раз закрывать не нужно');
        expect(source).toContain('primaryPlannedMeal?.proteinCapped');
    });

    it('does not show the water card from calories alone when macros still recommend food', () => {
        expect(source).not.toContain('isPlannerEmptyPlan || remainingKcal < 50');
        expect(source).toContain('основной ориентир по белку — в рабочем диапазоне');
        expect(source).toContain('resolveDayTargetKcal(optimum, normAbs)');
    });

    it('renders GOAL_REACHED as a dedicated premium terminal state', () => {
        expect(source).toContain("className: 'meal-rec-card widget widget--meal-rec-diary-goal'");
        expect(source).toContain("role: 'status'");
        expect(source).toContain("'На сегодня достаточно'");
        expect(source).toContain("'Ориентир закрыт'");
        expect(source).toContain("h('svg'");
        expect(source).not.toContain('Дальше — только вода');
    });

    it('keeps the protein-catchup explanation aligned with final macros', () => {
        expect(source).toContain("reasonCode === 'PROTEIN_DEFICIT_NEAR_GOAL'");
        expect(source).toContain('без попытки компенсировать весь дневной недобор');
        expect(source).toContain('Выбрать продукты · ${displayProductCount} вариантов');
        expect(source).toContain("rawDisplayReasoning.filter((line) => !line.includes('Белок:') && !line.includes('Осталось'))");
        expect(source).toContain('Калории почти закрыты, поэтому план ограничен небольшой белковой порцией.');
    });
});
