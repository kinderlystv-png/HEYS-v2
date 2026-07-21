import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

function loadDiarySection(options = {}) {
    const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_diary_section.js'), 'utf8');
    const renderInsulinWaveIndicator = vi.fn(() => ({ type: 'insulin-indicator' }));
    const renderRefeedCard = vi.fn(() => ({ type: 'refeed-card' }));
    const window = {
        setTimeout: options.setTimeout || setTimeout,
        HEYS: {
            dayInsulinWaveUI: { renderInsulinWaveIndicator },
            Refeed: { renderRefeedCard }
        }
    };

    vm.runInNewContext(source, { window, document: options.document, console }, { filename: 'heys_day_diary_section.js' });

    return {
        renderDiarySection: window.HEYS.dayDiarySection.renderDiarySection,
        getEmptyMeals: window.HEYS.dayDiarySection.getEmptyMeals,
        renderEmptyMealBanner: window.HEYS.dayDiarySection.renderEmptyMealBanner,
        renderInsulinWaveIndicator,
        renderRefeedCard
    };
}

describe('day diary mobile fast path', () => {
    it('returns the insulin indicator before building hidden diary panels on stats', () => {
        const {
            renderDiarySection,
            renderInsulinWaveIndicator,
            renderRefeedCard
        } = loadDiarySection();

        const result = renderDiarySection({
            React: {},
            isMobile: true,
            mobileSubTab: 'stats',
            insulinWaveData: { peak: 1 },
            HEYS: {
                dayInsulinWaveUI: { renderInsulinWaveIndicator },
                Refeed: { renderRefeedCard }
            }
        });

        expect(result).toEqual({ type: 'insulin-indicator' });
        expect(renderInsulinWaveIndicator).toHaveBeenCalledOnce();
        expect(renderRefeedCard).not.toHaveBeenCalled();
    });

    it('shows one actionable warning when meals without products exist', () => {
        const addProductClick = vi.fn();
        const scrollIntoView = vi.fn();
        const card = {
            scrollIntoView,
            querySelector: vi.fn((selector) => selector.includes('aria-label') ? { click: addProductClick } : null)
        };
        const document = {
            querySelector: vi.fn(() => card),
            getElementById: vi.fn()
        };
        const { getEmptyMeals, renderEmptyMealBanner } = loadDiarySection({
            document,
            setTimeout: (callback) => callback()
        });
        const React = {
            createElement(type, props, ...children) {
                return { type, props: props || {}, children };
            }
        };
        const day = {
            meals: [
                { id: 'filled', items: [{ id: 'item-1' }] },
                { id: 'empty-1', items: [] },
                { id: 'empty-2' }
            ]
        };

        expect(getEmptyMeals(day).map(({ index }) => index)).toEqual([1, 2]);
        const banner = renderEmptyMealBanner(React, day);
        expect(banner.type).toBe('aside');
        expect(banner.props.role).toBe('alert');
        expect(banner.children[1].children[0].children[0]).toBe('Не заполнено приёмов: 2');
        expect(banner.children[2].children[0]).toBe('Заполнить');
        banner.children[2].props.onClick();
        expect(document.querySelector).toHaveBeenCalledWith('.meal-card[data-meal-index="1"]');
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        expect(addProductClick).toHaveBeenCalledOnce();
        expect(renderEmptyMealBanner(React, { meals: [{ items: [{}] }] })).toBeNull();
    });
});
