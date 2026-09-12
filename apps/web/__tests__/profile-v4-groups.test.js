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

    // Решение владельца 12 сентября: три раздела открываются своим экраном
    // с заголовком и крестиком, а не раскрываются секцией внутри профиля.
    // Кадры subscription.v4 «Подписка · экран · …» рисуют именно экран.
    it('вынесенное: уведомления, подписка, система — свои экраны из листа настроек', () => {
        expect(userTabSrc).not.toContain("className: 'profile-v4-external'");
        expect(userTabSrc).toContain('function SettingsSectionScreen(');
        expect(userTabSrc).toContain("notifications: 'Уведомления и звук'");
        expect(userTabSrc).toContain("subscription: 'Подписка'");
        expect(userTabSrc).toContain("system: 'Система'");
        expect(shellSrc).toContain("openUserSection('subscription', 'settings-sheet-subscription')");
        expect(shellSrc).toContain("openUserSection('system', 'settings-sheet-system')");
        expect(shellSrc).toContain("const SETTINGS_SCREEN_SECTIONS = ['subscription', 'notifications', 'system']");
        expect(baseCss).toContain('.settings-screen {');
    });

    // Возврат ведёт туда, откуда человек пришёл: в список настроек, а не на
    // вкладку профиля. Без этого крестик выбрасывал бы на чужой экран.
    it('крестик экрана возвращает в список настроек', () => {
        expect(userTabSrc).toContain('settings-screen__close');
        expect(userTabSrc).toContain("'aria-label': 'Назад в настройки'");
        expect(shellSrc).toContain('setSettingsScreen(null);');
        expect(shellSrc).toMatch(/closeSettingsScreen[\s\S]{0,160}setSettingsMenuOpen\(true\)/);
    });

    it('медицинское: согласия и конфиденциальность в tier consents', () => {
        expect(userTabSrc).toContain("ProfileV4Tier, { id: 'consents', title: 'Медицинское'");
        expect(userTabSrc).toContain('MyConsentsAndDataCard');
        expect(userTabSrc).toContain('PrivacySettingsCard');
    });
});
