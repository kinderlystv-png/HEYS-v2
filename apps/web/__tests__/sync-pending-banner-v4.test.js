// sync-pending-banner-v4.test.js — полоса B, короткий VPN → страница
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');

function bannerCss() {
    const start = cssSrc.indexOf('.sync-pending-banner--strip {');
    const end = cssSrc.indexOf('@keyframes heysPendingSyncBannerIn');
    return cssSrc.slice(start, end);
}

describe('sync-pending-banner v4', () => {
    it('рисует полосу B: заголовок, одна строка, без состава очереди', () => {
        expect(shellSrc).toContain("className: 'sync-pending-banner sync-pending-banner--strip'");
        expect(shellSrc).toContain("className: 'sync-pending-banner__title'");
        expect(shellSrc).toContain("className: 'sync-pending-banner__summary'");
        expect(shellSrc).toContain("'Сохранено на устройстве'");
        expect(shellSrc).toContain("'Отправлю, как появится связь'");
        expect(shellSrc).not.toContain('sync-pending-banner__items');
        expect(shellSrc).not.toContain('sync-pending-banner__eyebrow');
    });

    it('VPN на полосе короткий и открывает страницу', () => {
        expect(shellSrc).toContain("pendingSyncBannerVpnHint = 'Если VPN — отключите'");
        expect(shellSrc).toContain("className: 'sync-pending-banner__vpn'");
        expect(shellSrc).toContain("className: 'sync-vpn-help'");
        expect(shellSrc).toContain("'Отключите VPN'");
        expect(shellSrc).toContain('setShowVpnHelpPage(true)');
        const summaryStart = shellSrc.indexOf('const pendingSyncBannerSummary');
        const summaryEnd = shellSrc.indexOf('const pendingSyncBannerVpnHint');
        const summaryChunk = shellSrc.slice(summaryStart, summaryEnd);
        expect(summaryChunk).not.toContain('VPN');
    });

    it('цвет полосы из --v4-surface, без синего градиента', () => {
        const css = bannerCss();
        expect(css).toMatch(/background:\s*var\(--v4-surface(?:,\s*#[0-9a-fA-F]{3,8})?\)/);
        expect(css).toMatch(/color:\s*var\(--v4-act(?:,\s*#[0-9a-fA-F]{3,8})?\)/);
        expect(css).not.toContain('59, 130, 246');
        expect(css).not.toContain('239, 246, 255');
        expect(css).not.toContain('linear-gradient');
    });
});
