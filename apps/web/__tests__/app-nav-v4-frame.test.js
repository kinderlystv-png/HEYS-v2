// app-nav-v4-frame.test.js — UI v4 Prompt 3/3b: рама, шапка, нижняя навигация
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const gamificationSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_gamification_bar_v1.js'), 'utf8');
const messengerCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
    'utf8',
);
const baseCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
    'utf8',
);
const paletteCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
    'utf8',
);
const pwaCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/500-pwa-and-offline.css'),
    'utf8',
);
const swipeSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_swipe_nav_v1.js'), 'utf8');
const bundleCfg = fs.readFileSync(
    path.resolve(WEB_DIR, '../../scripts/legacy-bundle-config.mjs'),
    'utf8',
);

function primaryTabKeys() {
    const start = shellSrc.indexOf('const primaryTabs = React.useMemo(() => ([');
    const chunk = shellSrc.slice(start, start + 900);
    return [...chunk.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
}

describe('UI v4 — нижняя навигация', () => {
    it('primaryTabs — ровно пять вкладок в порядке макета', () => {
        expect(primaryTabKeys()).toEqual(['widgets', 'diary', 'activity', 'stats', 'insights']);
    });

    it('Главная подписана «Главная», не «Виджеты»', () => {
        const start = shellSrc.indexOf('const primaryTabs = React.useMemo(() => ([');
        const chunk = shellSrc.slice(start, start + 400);
        expect(chunk).toContain("label: 'Главная'");
        expect(chunk).not.toContain("label: 'Виджеты'");
    });

    it('document.title обновляется по вкладке (HEYS — …)', () => {
        expect(shellSrc).toContain('function applyBrowserTabTitle');
        expect(shellSrc).toContain('document.title = label ? `HEYS — ${label}` : \'HEYS\'');
        expect(shellSrc).toContain('applyBrowserTabTitle(tab)');
        expect(shellSrc).toContain("widgets: 'Главная'");
    });

    it('разметка v4 primary nav без iOS switch', () => {
        expect(shellSrc).toContain('tabs--v4-primary');
        expect(shellSrc).toContain('tab-primary-nav-row');
        expect(shellSrc).not.toMatch(/primaryTabsVariant/);
    });

    it('Задачи и Доска в листе — только post-release labs клиент', () => {
        expect(shellSrc).toContain('canUsePostReleaseLabs');
        expect(shellSrc).toContain('canUseTasksAsHome && renderSettingsRow');
        expect(shellSrc).toContain('canUseBoardAsHome && renderSettingsRow');
        // Строка «Дневник» снята: блоки вкладки «Питание» включаются чипами
        // внизу самой вкладки (контракт nutrition-tab v4).
        expect(shellSrc).not.toContain('canUsePostReleaseLabs && renderSettingsRow');
        expect(shellSrc).toContain("closeSettingsAndSwitch('tasks'");
        expect(shellSrc).toContain("closeSettingsAndSwitch('board'");
        expect(shellSrc).toContain('ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a');
    });

    it('советы и настройки убраны из меню «Ещё»', () => {
        expect(shellSrc).not.toContain('tab-settings-item--advice');
        expect(shellSrc).not.toMatch(/tab-settings-menu[\s\S]{0,1200}renderNavIcon\('settings'\)/);
    });

    it('глобальный messenger FAB для вкладок без fab-group', () => {
        expect(shellSrc).toContain('fab-group--messenger-only');
        expect(shellSrc).toContain('global-messenger-fab');
    });

    it('adviceTabRef убран', () => {
        expect(shellSrc).not.toContain('adviceTabRef');
    });

    it('capture listener для советов смотрит на кнопку в шапке', () => {
        expect(shellSrc).toContain(".closest('.hdr-header-icon-btn--advice')");
        expect(shellSrc).not.toContain(".closest('.tab-settings-item--advice')");
        expect(shellSrc).not.toContain(".closest('.tab.tab-advice')");
    });
});

describe('UI v4 Prompt 3b — шапка', () => {
    it('советы и настройки в gamification bar, не мессенджер', () => {
        expect(gamificationSrc).toContain('hdr-header-icon-btn--advice');
        expect(gamificationSrc).toContain('hdr-header-icon-btn--settings');
        expect(gamificationSrc).toContain("name: 'sliders'");
        expect(gamificationSrc).not.toContain('hdr-header-icon-btn--messenger');
    });

    it('счётчик советов в шапке с id nav-advice-badge', () => {
        expect(gamificationSrc).toContain("id: 'nav-advice-badge'");
        expect(gamificationSrc).toContain('hdr-header-icon-btn--advice');
        expect(gamificationSrc).toContain('hdr-advice-badge');
    });

    // Цель 44 pt осталась, изменилась форма: строка контракта «иконки» просит
    // бокс 34 × 44, а горизонтальные 44 добираются невидимым припуском
    // (34 + 5 + 5). Прежние проверки закрепляли рисунок, а не цель.
    it('кнопки шапки — рисунок 34×44, цель касания 44 pt', () => {
        const btnRule = baseCss.match(/\.hdr-header-icon-btn \{[^}]+\}/)?.[0] || '';
        expect(btnRule).toMatch(/width:\s*34px/);
        expect(btnRule).toMatch(/height:\s*44px/);
        expect(btnRule).toMatch(/min-width:\s*34px/);
        expect(baseCss).toMatch(/\.hdr-header-icon-btn::after \{[^}]*inset:\s*0 -5px/);
        expect(baseCss).toMatch(/\.hdr-gamification \.hdr-header-actions[\s\S]*?gap:\s*0/);
    });

    it('кнопка настроек в шапке тоглит меню «Ещё», не setTab user', () => {
        expect(gamificationSrc).toContain('__heysToggleTabSettingsHandler');
        expect(gamificationSrc).not.toMatch(/hdr-header-icon-btn--settings[\s\S]{0,320}setTab\('user'\)/);
        expect(shellSrc).toContain('__heysToggleTabSettingsHandler');
        expect(shellSrc).toContain("target.closest('.hdr-header-icon-btn--settings')");
    });

    it('лист настроек от ползунков ведёт в профиль и даёт выход', () => {
        expect(shellSrc).toContain("label: 'Профиль и цели'");
        expect(shellSrc).toContain("openUserSection('basic', 'settings-sheet-profile')");
        expect(shellSrc).toContain("label: 'Выйти'");
        expect(shellSrc).toContain('handleSignOut()');
        expect(shellSrc).toContain('syncSettingsSheetAnchor');
        expect(shellSrc).toContain('syncSettingsSheetAnchorNow');
        expect(shellSrc).toContain('toggleSettingsMenu');
        expect(shellSrc).toContain('scrollSettingsExtraRowIntoView');
        expect(shellSrc).toContain('scrollAnchorKey');
        expect(shellSrc).toContain('settingsSheetCardRef');
        expect(shellSrc).toContain('settingsSheetScrollRef');
        expect(shellSrc).toContain('hdr-settings-sheet__scroll animate-always');
        expect(shellSrc).toContain('settingsSheetScrollEase');
        expect(shellSrc).not.toContain("behavior: 'smooth'");
        expect(shellSrc).toContain('ModalDismiss.dismissFromBackdrop');
        expect(shellSrc).toContain('dismissSettingsFromOutside');
        expect(baseCss).toContain('.hdr-settings-sheet__scroll');
        expect(baseCss).toContain('.tab-settings-menu.tab-settings-menu--v4-sheet');
        expect(baseCss).toMatch(/@keyframes settingsMenuSlideDown \{\s*from \{\s*opacity:\s*0;\s*\}/);
    });

    it('лист настроек полный и сгруппированный, выгрузка открывает согласия', () => {
        expect(shellSrc).toContain("renderSettingsGroup('you', 'Вы'");
        expect(shellSrc).toContain("renderSettingsGroup('app', 'Приложение'");
        expect(shellSrc).toContain("renderSettingsGroup('support', 'Сопровождение'");
        expect(shellSrc).toContain("label: 'Домашняя вкладка'");
        expect(shellSrc).toContain("label: 'Мои продукты'");
        expect(shellSrc).toContain("label: 'Звук и время напоминаний'");
        expect(shellSrc).toContain("label: 'Советы куратора'");
        expect(shellSrc).toContain("'Диагностика'");
        expect(shellSrc).toContain('hdr-settings-sheet__diag-toggle');
        expect(shellSrc).toContain('Пройти регистрацию');
        expect(shellSrc).toContain('Пройти утренний чек-ин');
        expect(shellSrc).toContain('Незаписанные дни (демо)');
        expect(shellSrc).toContain('HEYS_DEBUG_REPLAY_YESTERDAY_VERIFY');
        expect(shellSrc).toContain('Правки куратора (снова)');
        expect(shellSrc).toContain('HEYS_DEBUG_REPLAY_CHECKIN');
        expect(shellSrc).toContain('HEYS_DEBUG_REPLAY_CURATOR_REVIEW');
        expect(shellSrc).toContain('replayCuratorReview');
        expect(shellSrc).toContain('hdr-settings-sheet__build');
        expect(shellSrc).toContain('HEYS 4.0');
        expect(shellSrc).toContain("openUserSection('consents', 'settings-sheet-export')");
        expect(shellSrc).toContain("openUserSection('notifications', 'settings-sheet-notify')");
        expect(shellSrc).toContain("openUserSection('subscription', 'settings-sheet-subscription')");
        expect(shellSrc).toContain("openUserSection('system', 'settings-sheet-system')");
        expect(shellSrc).not.toContain("closeSettingsAndSwitch('overview'");
        expect(baseCss).toContain('.hdr-settings-sheet__tier');
        expect(baseCss).toContain('.hdr-settings-sheet__diag-panel');
        expect(baseCss).toContain('[data-theme$="dark"] .hdr-settings-sheet__group');
        const userTabSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');
        expect(userTabSrc).toContain('heys:open-user-section');
        expect(userTabSrc).toContain("title: 'Уведомления и звук'");
        expect(userTabSrc).toContain('profile-v4-external');
        expect(userTabSrc).toContain("title: 'Медицинское'");
        expect(userTabSrc).toContain('PIN клиента');
        expect(userTabSrc).toContain('normalizeExclusiveSections');
        expect(userTabSrc).toMatch(/const next = isOpen \? \{\} : \{ \[id\]: true \}/);
        expect(userTabSrc).toContain('React.createElement(SoundSettingsCard, null)');
    });

    // Контракт settings-system, «вид диагностики»: створка стоит вне ярусов,
    // ниже последнего, но карточка у неё первой поверхности и радиус 18 — те
    // же, что у ярусов. Тише основного её делает тон чернил, а не другая
    // поверхность: до сведения створка была на второй (#efe3cf) и читалась
    // отдельным блоком, а не продолжением списка.
    it('диагностика: карточка той же поверхности и радиуса, что ярусы', () => {
        const rule = (css, selector) => {
            const at = css.indexOf(selector + ' {');
            expect(at, selector + ' должен существовать').toBeGreaterThan(-1);
            return css.slice(at, css.indexOf('}', at));
        };
        const tier = rule(baseCss, '.hdr-settings-sheet__group');
        const diag = rule(baseCss, '.hdr-settings-sheet__diag-panel');
        const bg = (block) => block.match(/background:s*([^;]+);/)?.[1]?.trim();
        const radius = (block) => block.match(/border-radius:s*([^;]+);/)?.[1]?.trim();
        expect(bg(diag)).toBe(bg(tier));
        expect(radius(diag)).toBe(radius(tier));
        const tierDark = rule(baseCss, '[data-theme$="dark"] .hdr-settings-sheet__group');
        const diagDark = rule(baseCss, '[data-theme$="dark"] .hdr-settings-sheet__diag-panel');
        expect(bg(diagDark)).toBe(bg(tierDark));
    });
    it('меню «Ещё»: фон под карточкой — v4 blur 2.5px, не blur аккаунта', () => {
        expect(shellSrc).toContain('function syncDropdownBlurActive');
        expect(shellSrc).toContain('tab-settings-backdrop--v4-popover');
        expect(baseCss).toContain('.tab-settings-backdrop--v4-popover');
        expect(paletteCss).toContain('--v4-modal-backdrop-blur: 2.5px');
        expect(baseCss).toMatch(
            /\.tab-settings-backdrop--v4-popover\s*\{[\s\S]*?backdrop-filter:\s*blur\(var\(--v4-modal-backdrop-blur/,
        );
        expect(pwaCss).toMatch(
            /\.mc-backdrop:has\(\.mc-modal--daily\)\s*\{[\s\S]*?backdrop-filter:\s*blur\(var\(--v4-modal-backdrop-blur/,
        );
        expect(pwaCss).toMatch(
            /\.ca-modal-backdrop--visible\s*\{[\s\S]*?backdrop-filter:\s*blur\(var\(--v4-modal-backdrop-blur/,
        );
        expect(baseCss).toMatch(/\.hdr-settings-sheet__card\s*\{[\s\S]*?72px/);
        expect(shellSrc).toMatch(/dropdown-blur-active',\s*clientOpen\)/);
    });

    it('standalone messenger FAB скрывается при tab fab-group', () => {
        expect(messengerCss).toMatch(
            /body:has\(\.fab-group:not\(\.fab-group--messenger-only\) \.message-fab\) \.fab-group--messenger-only/,
        );
    });

    it('standalone messenger FAB скрывается на Главной с widgets-quick-fab', () => {
        expect(messengerCss).toMatch(
            /body:has\(\.widgets-quick-fab-wrap\) \.fab-group--messenger-only[\s\S]*display:\s*none/,
        );
    });
});

describe('UI v4 — свайп между вкладками', () => {
    const baseCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

    it('SWIPEABLE_TABS совпадает с пятью primary tabs', () => {
        const m = /const SWIPEABLE_TABS = \[([^\]]+)\]/.exec(swipeSrc);
        expect(m, 'SWIPEABLE_TABS не найден').toBeTruthy();
        const swipeKeys = m[1]
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean);
        expect(swipeKeys).toEqual(['widgets', 'diary', 'activity', 'stats', 'insights']);
        expect(swipeKeys).not.toContain('tasks');
    });

    it('tap мгновенный, swipe slide не конфликтует с viewport', () => {
        expect(baseCss).not.toContain('@keyframes tab-view-enter');
        expect(baseCss).not.toMatch(/\.tab-active-viewport[\s\S]*animation: tab-view-enter/);
        expect(baseCss).toMatch(/slide-in-left[\s\S]*> \.tab-active-viewport[\s\S]*animation: none/);
        expect(shellSrc).toContain("className: 'tab-active-viewport'");
        expect(shellSrc).toContain('tabViewportRef');
        expect(shellSrc).toMatch(/tab-active-viewport[\s\S]*onTouchStart: onTouchStart/);
        expect(shellSrc).not.toMatch(/tab-content-swipeable' \+[\s\S]{0,220}onTouchStart: onTouchStart/);
        expect(shellSrc).not.toMatch(/key: 'tab-view-' \+ String\(tab/);
    });
});

describe('UI v4 — иконки', () => {
    it('nav icons подключены в legacy bundle до shell', () => {
        const iconsIdx = bundleCfg.indexOf("'heys_app_nav_icons_v1.js'");
        const shellIdx = bundleCfg.indexOf("'heys_app_shell_v1.js'");
        expect(iconsIdx).toBeGreaterThan(-1);
        expect(shellIdx).toBeGreaterThan(iconsIdx);
    });

    it('FAB water/meal используют NavIcon вместо emoji', () => {
        const dayShell = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
        const iconsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_nav_icons_v1.js'), 'utf8');
        expect(iconsSrc).toContain("water:");
        expect(iconsSrc).toContain("meal:");
        expect(dayShell).toContain("renderFabNavIcon('water'");
        expect(dayShell).toContain("renderFabNavIcon('meal'");
        expect(dayShell).not.toMatch(/className: 'water-fab'[\s\S]{0,80}'🥛'/);
    });

    it('профиль использует NavIcon вместо emoji в секциях', () => {
        const userSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_user_tab_impl_v1.js'), 'utf8');
        const iconsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_nav_icons_v1.js'), 'utf8');
        expect(iconsSrc).toContain('person:');
        expect(iconsSrc).toContain('heart:');
        expect(userSrc).toContain("profileSvg('bell')");
        expect(userSrc).toContain("profileSvg('gem')");
        expect(userSrc).not.toMatch(/icon: '👤'/);
        expect(userSrc).not.toMatch(/icon: '🔔'/);
    });
});

describe('UI v4 chrome paint — рама', () => {
    it('название вкладки в шапке выше строки даты', () => {
        const hdrStart = shellSrc.indexOf("className: 'hdr-top hdr-gamification'");
        expect(hdrStart).toBeGreaterThan(-1);
        const titleIdx = shellSrc.indexOf("'hdr-bottom'", hdrStart);
        const dateIdx = shellSrc.indexOf("'hdr-date-row'", hdrStart);
        expect(titleIdx).toBeGreaterThan(-1);
        expect(dateIdx).toBeGreaterThan(titleIdx);
        const chromeIdx = shellSrc.indexOf("className: 'hdr-chrome'");
        const stickyIdx = shellSrc.indexOf("className: 'hdr-sticky-strip'");
        expect(chromeIdx).toBeGreaterThan(-1);
        expect(stickyIdx).toBeGreaterThan(chromeIdx);
        expect(dateIdx).toBeGreaterThan(stickyIdx);
        expect(shellSrc).not.toContain('app-header-wrapper');
        const viewportIdx = shellSrc.indexOf("className: 'tab-active-viewport'");
        expect(shellSrc.indexOf('MemoAppHeader, props', viewportIdx)).toBeGreaterThan(viewportIdx);
    });

    it('date-picker v4 без flex-basis 0% в critical CSS (anti flash)', () => {
        const criticalCss = fs.readFileSync(path.join(WEB_DIR, 'styles/critical.css'), 'utf8');
        const hdrPickerRules = criticalCss.match(/\.hdr-date-group[\s\S]{0,900}\.date-picker--v4[\s\S]{0,400}/g) || [];
        expect(hdrPickerRules.length).toBeGreaterThan(0);
        hdrPickerRules.forEach((rule) => {
            expect(rule).not.toMatch(/flex:\s*1\s+1\s+0%/);
        });
    });

    it('hdr-bottom без legacy синей рамки #4285f4', () => {
        const rules = [...baseCss.matchAll(/\.hdr-bottom\s*\{[^}]+\}/g)].map((m) => m[0]);
        const painted = rules.find((rule) => rule.includes('background: transparent')) || '';
        expect(painted).not.toContain('#4285f4');
        expect(painted).toMatch(/border:\s*none/);
    });

    it('critical hdr-top без legacy синего градиента #4285f4', () => {
        const criticalCss = fs.readFileSync(path.join(WEB_DIR, 'styles/critical.css'), 'utf8');
        const hdrTopRule = criticalCss.match(/\.hdr-top\s*\{[^}]+\}/)?.[0] || '';
        expect(hdrTopRule).not.toContain('#4285f4');
        expect(hdrTopRule).not.toContain('#2563eb');
        expect(hdrTopRule).toMatch(/background:\s*transparent/);
    });

    it('heys-components dark hdr-top без синего shell-gradient', () => {
        const componentsCss = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
        const darkHdrTop = componentsCss.match(/\[data-theme\$="dark"\] \.hdr-top\s*\{[^}]+\}/)?.[0] || '';
        expect(darkHdrTop).not.toMatch(/rgba\(29,\s*78,\s*216/);
        expect(darkHdrTop).not.toMatch(/rgba\(37,\s*99,\s*235/);
        expect(darkHdrTop).toMatch(/background:\s*transparent/);
    });

    it('активная вкладка nav на sand-роли, не голый литерал', () => {
        const lightRule = baseCss.match(
            /(?<!dark"\] )\n\.tabs--v4-primary \.tab\.tab-primary-nav\.active \{[^}]+\}/,
        )?.[0] || '';
        // Светлая: sand-роль (решение 2026-08-12). Тёмная: --v4-act-text как в g1d.
        expect(lightRule).toMatch(/var\(--v4-sand-act(?:-text|-deep)?/);
        expect(lightRule).not.toMatch(/color:\s*#8a4a20\s*;/);
        // Тёмная sand-nav: литералы после classic-drift fix (#e2a468 / #2f2820).
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*#e2a468[\s\S]*?background:\s*#2f2820/,
        );
    });

    it('mobile shell: bottom nav viewport full-bleed, wrap без боковых inset', () => {
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.wrap[\s\S]*?padding-inline:\s*0 !important/);
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.tabs[\s\S]*?max-width:\s*100vw !important/);
        expect(shellSrc).toContain('portalAppShellChrome');
        expect(shellSrc).toContain('ReactDOM.createPortal');
        expect(shellSrc).toMatch(/shouldRenderContent && !hideContent/);
    });

    it('primary tabs — пять равных колонок, без legacy cap 48px', () => {
        expect(baseCss).toMatch(/\.tab:not\(\.tab-primary-nav\)[\s\S]*?max-width:\s*48px/);
        expect(baseCss).toMatch(/\.tabs--v4-primary \.tab\.tab-primary-nav[\s\S]*?flex:\s*1 1 0/);
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.tabs--v4-primary \.tab-settings-wrap > \.tab[\s\S]*?display:\s*none !important/);
    });

    it('шапка расстановки — Отмена откатывает, Готово сохраняет', () => {
        expect(shellSrc).toContain('handleWidgetsEditCancel');
        expect(shellSrc).toContain("exitEditMode({ revert: true })");
        expect(shellSrc).toContain('handleWidgetsEditDone');
        expect(shellSrc).toContain("hdr-widgets-edit-title");
        expect(shellSrc).toContain('showWidgetsDateRow');
        expect(shellSrc).not.toContain('handleWidgetsEditStart');
        expect(shellSrc).not.toContain("hdr-widgets-edit-btn--primary");
    });

    it('вход в расстановку — FAB настройки, без строки «Изменить экран»', () => {
        const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
        expect(uiSrc).toContain("id: 'tour-widgets-settings-fab'");
        expect(uiSrc).toContain('openEditWithCatalog');
        expect(uiSrc).not.toContain('Изменить экран');
        expect(uiSrc).not.toContain('widgets-tab__edit-row');
    });

    it('v4 nav chrome — отступы и фон как в макете', () => {
        const shellRules = [...baseCss.matchAll(/\.tabs\.tabs--v4-primary \{[^}]+\}/g)].map((m) => m[0]);
        const shellRule = shellRules.find((rule) => rule.includes('padding:')) || '';
        expect(shellRule).toMatch(/padding:\s*4px 16px calc\(16px \+ env\(safe-area-inset-bottom/);
        expect(shellRule).toMatch(/background:\s*var\(--v4-bg/);
        expect(shellRule).toMatch(/border-top:\s*none/);
        expect(baseCss).toMatch(
            /\.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*var\(--v4-sand-act-text[\s\S]*?background:\s*var\(--v4-hero/,
        );
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs\.tabs--v4-primary \{[\s\S]*?background:\s*#141210/,
        );
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*#e2a468[\s\S]*?background:\s*#2f2820/,
        );
        const start = baseCss.indexOf('.tab-primary-nav-row');
        expect(start).toBeGreaterThan(-1);
        expect(baseCss.slice(start, start + 800)).toMatch(/padding:\s*8px 10px/);
        expect(baseCss).toMatch(/\.tabs--v4-primary \.crs-bar-container[\s\S]*?display:\s*none/);
        expect(baseCss).toMatch(/body:has\(\[data-heys-visible-frame="consent"\]\) \.tabs/);
    });
});

describe('UI v4 — точка правок куратора на «Питании»', () => {
    const pwaCss = fs.readFileSync(
        path.join(WEB_DIR, 'styles/modules/500-pwa-and-offline.css'),
        'utf8',
    );

    it('точка 7px на иконке «Питания», без счётчика, скрыта на самой вкладке', () => {
        expect(shellSrc).toContain('ca-tab-dot-mark');
        expect(shellSrc).toContain("tab !== 'diary'");
        expect(shellSrc).toContain('shouldShowNutritionDot');
        expect(shellSrc).toContain('openFromTab');
        expect(shellSrc).not.toMatch(/shouldShowNutritionDot[\s\S]{0,120}tab === 'widgets'/);
        expect(shellSrc).not.toMatch(/ca-tab-dot-mark[\s\S]{0,80}43/);
        expect(pwaCss).toMatch(/\.ca-tab-dot-mark \{[\s\S]*?width:\s*7px/);
        expect(pwaCss).toMatch(/\.ca-tab-dot-mark \{[\s\S]*?height:\s*7px/);
    });

    it('тап «Питание» с другой вкладки открывает лист, если точка горит', () => {
        expect(shellSrc).toContain('openCuratorFromDot');
        expect(shellSrc).toMatch(/nextTab === 'diary' && tab !== 'diary'/);
        expect(shellSrc).toContain('CuratorActionsBanner?.openFromTab');
    });
});
