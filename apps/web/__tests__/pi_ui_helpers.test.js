import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Insights UI helpers', () => {
    beforeEach(() => {
        vi.resetModules();
        window.HEYS = {};
        window.piUIHelpers = undefined;
    });

    it('registers shared ui helpers in Insights namespace', async () => {
        await import('../insights/pi_ui_helpers.js');

        expect(window.HEYS?.InsightsPI?.uiHelpers).toBeDefined();
        expect(typeof window.HEYS.InsightsPI.uiHelpers.getInfoButton).toBe('function');
        expect(typeof window.HEYS.InsightsPI.uiHelpers.getPriorityLevels).toBe('function');
        expect(typeof window.HEYS.InsightsPI.uiHelpers.getCategories).toBe('function');
    });

    it('returns fallback InfoButton when real component is missing', async () => {
        await import('../insights/pi_ui_helpers.js');

        const helpers = window.HEYS.InsightsPI.uiHelpers;
        const h = (tag, props, children) => ({ tag, props, children });
        const InfoButton = helpers.getInfoButton(h);

        const node = InfoButton({ infoKey: 'TEST_KEY' });
        expect(node.tag).toBe('span');
        expect(node.props.className).toBe('info-button-placeholder');
        expect(node.props.title).toBe('TEST_KEY');
    });

    it('prefers constants from module when available', async () => {
        await import('../insights/pi_ui_helpers.js');

        const helpers = window.HEYS.InsightsPI.uiHelpers;
        const priority = helpers.getPriorityLevels({
            PRIORITY_LEVELS: { CUSTOM: { level: 1, name: 'Custom' } }
        });

        expect(priority.CUSTOM.name).toBe('Custom');
    });
});
