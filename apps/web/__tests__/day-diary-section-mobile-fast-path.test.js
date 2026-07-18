import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

function loadDiarySection() {
    const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_diary_section.js'), 'utf8');
    const renderInsulinWaveIndicator = vi.fn(() => ({ type: 'insulin-indicator' }));
    const renderRefeedCard = vi.fn(() => ({ type: 'refeed-card' }));
    const window = {
        HEYS: {
            dayInsulinWaveUI: { renderInsulinWaveIndicator },
            Refeed: { renderRefeedCard }
        }
    };

    vm.runInNewContext(source, { window, console }, { filename: 'heys_day_diary_section.js' });

    return {
        renderDiarySection: window.HEYS.dayDiarySection.renderDiarySection,
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
});
