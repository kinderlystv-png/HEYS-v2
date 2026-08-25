/**
 * Контракт settings-system: три группы профиля вместо восьми аккордеонов.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userTabSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const baseCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
    'utf8',
);

describe('profile v4 — три группы (settings-system)', () => {
    it('профиль: три tier-заголовка и три subtier в «Нормы и цели»', () => {
        expect(userTabSrc).toContain("className: 'profile-v4'");
        expect(userTabSrc).toContain("title: 'Обо мне'");
        expect(userTabSrc).toContain("title: 'Нормы и цели'");
        expect(userTabSrc).toContain("title: 'Медицинское'");
        expect(userTabSrc).toContain("title: 'Цель'");
        expect(userTabSrc).toContain("title: 'Нормы'");
        expect(userTabSrc).toContain("title: 'Пульсовые зоны'");
        expect(userTabSrc).toContain('profile-v4__value--readonly');
        expect(userTabSrc).not.toMatch(/ProfileSection[\s\S]{0,80}title: 'Обо мне'/);
    });

    it('вынесенное: уведомления, подписка, система — вне profile-v4 и из листа настроек', () => {
        expect(userTabSrc).toContain("className: 'profile-v4-external'");
        expect(userTabSrc).toContain("id: 'notifications'");
        expect(userTabSrc).toContain("id: 'subscription'");
        expect(userTabSrc).toContain("id: 'system'");
        expect(shellSrc).toContain("openUserSection('subscription', 'settings-sheet-subscription')");
        expect(shellSrc).toContain("openUserSection('system', 'settings-sheet-system')");
        expect(baseCss).toContain('.profile-v4-external:has(.profile-section--expanded)');
    });

    it('медицинское: согласия и конфиденциальность в tier consents', () => {
        expect(userTabSrc).toContain("ProfileV4Tier, { id: 'consents', title: 'Медицинское'");
        expect(userTabSrc).toContain('MyConsentsAndDataCard');
        expect(userTabSrc).toContain('PrivacySettingsCard');
    });
});
