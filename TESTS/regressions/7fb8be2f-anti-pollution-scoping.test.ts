/**
 * Regression test для commit 7fb8be2f.
 *
 * Bug: heys_insulin_wave_v1.js + heys_iw_lipolysis.js + insights/pi_early_warning.js
 * писали legacy unscoped keys через direct localStorage.setItem(KEY, ...) минуя
 * HEYS.store.set scoping → курaторский switch воссоздавал unscoped keys, cloud
 * sync приписывал их новому client'у → cross-client pollution.
 *
 * Fix: scoped keys per-client с pattern `heys_<cid>_<base>` + legacy fallback на read.
 *
 * Test: grep'ит source файлы и verify'ит что нет НИКАКИХ direct setItem'ов на
 * unscoped GAP_HISTORY_KEY / LIPOLYSIS_*_KEY / ews_*_v1 — должны быть только
 * scoped variants.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = process.cwd();
const FILES = {
    insulinWave: 'apps/web/heys_insulin_wave_v1.js',
    iwLipolysis: 'apps/web/heys_iw_lipolysis.js',
    piEarlyWarning: 'apps/web/insights/pi_early_warning.js',
};

function readSrc(rel: string): string {
    return readFileSync(path.resolve(ROOT, rel), 'utf8');
}

describe('Regression 7fb8be2f: anti-pollution scoping (ews/lipolysis/meal-gaps)', () => {
    it('heys_insulin_wave_v1.js — writes scoped, не direct GAP_HISTORY_KEY', () => {
        const src = readSrc(FILES.insulinWave);
        // Должны быть scoped setItem calls (с _ в key, который scope маркер)
        // Direct `localStorage.setItem(GAP_HISTORY_KEY,` без _cid prefix → bug
        const directWrites = src.match(/localStorage\.setItem\s*\(\s*GAP_HISTORY_KEY\s*,/g);
        expect(directWrites, 'нашёл direct unscoped setItem(GAP_HISTORY_KEY) — pollution risk').toBeNull();
        // Должен быть scoped pattern
        expect(src).toMatch(/SCOPED_KEY|scopedKey|_cid|currentClientId.*GAP_HISTORY/);
    });

    it('heys_iw_lipolysis.js — writes scoped LIPOLYSIS keys', () => {
        const src = readSrc(FILES.iwLipolysis);
        const directRecord = src.match(/localStorage\.setItem\s*\(\s*LIPOLYSIS_RECORD_KEY\s*,/g);
        const directHistory = src.match(/localStorage\.setItem\s*\(\s*LIPOLYSIS_HISTORY_KEY\s*,/g);
        expect(directRecord, 'direct setItem(LIPOLYSIS_RECORD_KEY) — pollution risk').toBeNull();
        expect(directHistory, 'direct setItem(LIPOLYSIS_HISTORY_KEY) — pollution risk').toBeNull();
        expect(src).toMatch(/_scopedLipoKey|scoped.*LIPOLYSIS/);
    });

    it('insights/pi_early_warning.js — writes scoped ews keys', () => {
        const src = readSrc(FILES.piEarlyWarning);
        const directTrends = src.match(/localStorage\.setItem\s*\(\s*TRENDS_STORAGE_KEY\s*,/g);
        const directWeekly = src.match(/localStorage\.setItem\s*\(\s*WEEKLY_PROGRESS_STORAGE_KEY\s*,/g);
        expect(directTrends, 'direct setItem(TRENDS_STORAGE_KEY) — pollution risk').toBeNull();
        expect(directWeekly, 'direct setItem(WEEKLY_PROGRESS_STORAGE_KEY) — pollution risk').toBeNull();
        expect(src).toMatch(/_ewsScopedKey/);
    });
});
