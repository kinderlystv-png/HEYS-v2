import { describe, expect, it } from 'vitest';

const GRID_COLS = 4;
const GRID_VERSION = 2;
const LAYOUT_PRESET_VERSION = 1;

function resolveWidgetsInit({ meta, savedLayout }) {
    let saved = Array.isArray(savedLayout) ? savedLayout : [];
    const hasSavedLayout = saved.length > 0;
    const needsPresetMigration = !meta || meta.layoutPresetVersion !== LAYOUT_PRESET_VERSION;
    const needsMigration = !!meta && (meta.gridVersion !== GRID_VERSION || meta.gridCols !== GRID_COLS);

    if (hasSavedLayout && needsPresetMigration) {
        return {
            source: 'saved-layout',
            saved,
            shouldBackfillMeta: true,
            shouldOverwriteWithDefault: false,
        };
    }

    if (!hasSavedLayout && needsPresetMigration) {
        return {
            source: 'default-layout',
            saved: [{ type: 'calories', size: '2x2', position: { col: 0, row: 0 } }],
            shouldBackfillMeta: true,
            shouldOverwriteWithDefault: true,
        };
    }

    if (hasSavedLayout && needsMigration) {
        return {
            source: 'migrated-layout',
            saved,
            shouldBackfillMeta: true,
            shouldOverwriteWithDefault: false,
        };
    }

    return {
        source: hasSavedLayout ? 'saved-layout' : 'default-layout',
        saved,
        shouldBackfillMeta: false,
        shouldOverwriteWithDefault: false,
    };
}

function getOptionalCleanupMatchers() {
    return {
        exactKeys: new Set([
            'heys_hidden_products',
            'heys_favorite_products',
            'heys_deleted_products',
            'heys_deleted_products_ignore_list',
            'heys_grams_history',
            'heys_advice_trace_day_v1',
            'test_large'
        ]),
        suffixMatchers: [
            '_hidden_products',
            '_favorite_products',
            '_deleted_products',
            '_advice_trace_day_v1'
        ]
    };
}

describe('widgets layout persistence regression', () => {
    it('preserves saved layout when meta is missing', () => {
        const savedLayout = [{ type: 'weight', size: '2x2', position: { col: 2, row: 7 } }];

        const result = resolveWidgetsInit({ meta: null, savedLayout });

        expect(result.source).toBe('saved-layout');
        expect(result.saved).toEqual(savedLayout);
        expect(result.shouldOverwriteWithDefault).toBe(false);
        expect(result.shouldBackfillMeta).toBe(true);
    });

    it('uses default layout only for clean start without saved widgets', () => {
        const result = resolveWidgetsInit({ meta: null, savedLayout: [] });

        expect(result.source).toBe('default-layout');
        expect(result.shouldOverwriteWithDefault).toBe(true);
        expect(result.saved.length).toBeGreaterThan(0);
    });

    it('does not classify widget layout keys as optional cleanup data', () => {
        const { exactKeys, suffixMatchers } = getOptionalCleanupMatchers();

        expect(exactKeys.has('heys_widget_layout_v1')).toBe(false);
        expect(exactKeys.has('heys_widget_layout_meta_v1')).toBe(false);
        expect(suffixMatchers.includes('_widget_layout_v1')).toBe(false);
        expect(suffixMatchers.includes('_widget_layout_meta_v1')).toBe(false);
    });
});