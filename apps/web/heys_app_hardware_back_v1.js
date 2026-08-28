// heys_app_hardware_back_v1.js — стек вкладок для аппаратной «назад» (home-widgets контракт)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.AppBackNav && HEYS.AppBackNav.__initialized) return;

    const PRIMARY_TABS = Object.freeze(['widgets', 'diary', 'activity', 'stats', 'insights']);
    const BACK_TRAP_KEY = 'heysAppNav';

    let visitStack = [];
    let suppressNextVisitPush = false;
    let installed = false;
    let getTabFn = () => 'widgets';
    let setTabFn = () => { /* noop */ };

    function isPrimaryTab(tab) {
        return PRIMARY_TABS.includes(tab);
    }

    function pushBackTrap() {
        try {
            if (global.history.state?.[BACK_TRAP_KEY]) return;
            global.history.pushState({ [BACK_TRAP_KEY]: true }, '');
        } catch (_) { /* история недоступна */ }
    }

    function hasOpenProductLayer() {
        if (global.document.querySelector('.tab-settings-backdrop--v4-popover')) return true;
        if (global.document.querySelector('.hdr-notify-detail-sheet')) return true;
        if (global.document.querySelector('.heys-consent-sign-sheet')) return true;
        if (global.document.querySelector('.heys-date-sheet-backdrop')) return true;
        if (global.document.querySelector('.heys-meal-edit-sheet')) return true;
        if (global.document.querySelector('.widgets-quick-fab-wrap.is-open')) return true;
        if (global.document.querySelector('.widget-wd-sheet')) return true;
        if (HEYS.Widgets?.isEditMode?.()) return true;
        const state = global.history.state || {};
        if (state.heysSettingsSheet || state.heysNotifyDetailSheet || state.heysQuickActions
            || state.heysCuratorEdits || state.heysDateSheet || state.heysMealEditSheet
            || state.heysWidgetVariantSheet || state.heysWidgetsEditMode
            || state.heysFullscreen || state.heysConsentBackDepth || state.heysIntakeBack) {
            return true;
        }
        return false;
    }

    function recordVisit(fromTab, toTab) {
        if (suppressNextVisitPush) {
            suppressNextVisitPush = false;
            return;
        }
        if (!fromTab || fromTab === toTab) return;
        if (!isPrimaryTab(toTab)) return;
        if (isPrimaryTab(fromTab)) visitStack.push(fromTab);
    }

    function popVisit(currentTab) {
        while (visitStack.length) {
            const prev = visitStack.pop();
            if (prev && prev !== currentTab) return prev;
        }
        return null;
    }

    function navigateBackTab() {
        const currentTab = getTabFn();
        const prevTab = popVisit(currentTab);
        if (prevTab) {
            suppressNextVisitPush = true;
            setTabFn(prevTab);
            pushBackTrap();
            return true;
        }
        if (currentTab === 'widgets') {
            visitStack = [];
            return false;
        }
        suppressNextVisitPush = true;
        setTabFn('widgets');
        pushBackTrap();
        return true;
    }

    function onPopState() {
        global.setTimeout(() => {
            if (hasOpenProductLayer()) {
                pushBackTrap();
                return;
            }
            const state = global.history.state || {};
            // Закрыли слой и вернулись на ловушку — вкладку не меняем (одно «назад»
            // не должно и закрыть лист, и уйти на другую вкладку).
            if (state[BACK_TRAP_KEY]) return;
            if (!navigateBackTab()) {
                // На Главной без слоёв — выход из приложения (не возвращаем trap).
                return;
            }
        }, 0);
    }

    function install(options = {}) {
        if (typeof options.getTab === 'function') getTabFn = options.getTab;
        if (typeof options.setTab === 'function') setTabFn = options.setTab;
        if (installed) return;
        installed = true;
        global.addEventListener('popstate', onPopState);
        pushBackTrap();
    }

    HEYS.AppBackNav = {
        __initialized: true,
        PRIMARY_TABS,
        install,
        recordVisit,
        popVisit,
        pushBackTrap,
        _resetForTests() {
            visitStack = [];
            suppressNextVisitPush = false;
        },
    };
}(typeof window !== 'undefined' ? window : globalThis));
