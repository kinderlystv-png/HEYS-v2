import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = fs.readFileSync(
    path.resolve(__dirname, '../heys_dark_theme_interceptor.js'),
    'utf8',
);

function extractMapBlock(name) {
    const match = SOURCE.match(new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\]\\);`));
    expect(match, `${name} block`).toBeTruthy();
    return match[1];
}

describe('heys_dark_theme_interceptor v4 stage 2', () => {
    it('V4 maps use only --v4-* role variables', () => {
        for (const blockName of ['V4_BG', 'V4_TEXT', 'V4_BORDER']) {
            const block = extractMapBlock(blockName);
            expect(block).not.toMatch(/var\(--(?!v4-)/);
            expect(block).toMatch(/--v4-/);
        }
    });

    it('first-wave neutral literals are present in V4 maps', () => {
        const text = extractMapBlock('V4_TEXT');
        const border = extractMapBlock('V4_BORDER');
        const bg = extractMapBlock('V4_BG');

        for (const hex of ['#64748b', '#94a3b8', '#334155', '#71717a']) {
            expect(text).toContain(hex);
        }
        for (const hex of ['#e5e7eb', '#cbd5e1']) {
            expect(border).toContain(hex);
        }
        for (const hex of ['#f8fafc', '#f3f4f6']) {
            expect(bg).toContain(hex);
        }
    });

    it('gates v4 roles to sand/blue palettes only', () => {
        expect(SOURCE).toMatch(/data-palette/);
        expect(SOURCE).toMatch(/palette === 'sand' \|\| palette === 'blue'/);
        expect(extractMapBlock('TEXT')).toContain('var(--muted,');
    });
});
