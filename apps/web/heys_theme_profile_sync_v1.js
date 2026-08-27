// heys_theme_profile_sync_v1.js — палитра/режим в профиле + LS-кеш до загрузки профиля
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.ThemeProfileSync && HEYS.ThemeProfileSync.__initialized) return;

    let applyingFromProfile = false;
    let bootMigrated = false;

    function readProfile() {
        const U = HEYS.utils;
        return (U && typeof U.lsGet === 'function' ? U.lsGet('heys_profile', {}) : null) || {};
    }

    function writeProfileTheme(patch) {
        const U = HEYS.utils;
        if (!U || typeof U.lsGet !== 'function' || typeof U.lsSet !== 'function') return false;
        const profile = readProfile();
        const next = {
            ...profile,
            ...patch,
            revision: (profile.revision || 0) + 1,
            updatedAt: Date.now(),
        };
        U.lsSet('heys_profile', next);
        try {
            global.dispatchEvent(new CustomEvent('heys:profile-updated', {
                detail: {
                    fields: Object.keys(patch),
                    source: 'theme-profile-sync',
                },
            }));
        } catch (_) { /* noop */ }
        return true;
    }

    function readThemeApi() {
        return HEYS.Theme;
    }

    function normalizePalette(value, Theme) {
        if (!Theme || !value) return null;
        return Theme.PALETTES.includes(value) ? value : null;
    }

    function normalizeModePref(value, Theme) {
        if (!Theme || !value) return null;
        return Theme.isModePreference(value) ? value : null;
    }

    function syncThemeToProfile() {
        if (applyingFromProfile) return;
        const Theme = readThemeApi();
        if (!Theme) return;

        const palette = Theme.getPalette(Theme.readStoredThemeId());
        const modePref = Theme.getModePreference();
        const profile = readProfile();

        if (profile.themePalette === palette && profile.themeModePref === modePref) return;
        writeProfileTheme({ themePalette: palette, themeModePref: modePref });
    }

    function applyProfileTheme(profile, options = {}) {
        const Theme = readThemeApi();
        if (!Theme || !profile || typeof profile !== 'object') return false;

        const palette = normalizePalette(profile.themePalette, Theme);
        const modePref = normalizeModePref(profile.themeModePref, Theme);
        if (!palette && !modePref) return false;

        const currentPalette = Theme.getPalette(Theme.readStoredThemeId());
        const currentPref = Theme.getModePreference();
        const targetPalette = palette || currentPalette;
        const targetPref = modePref || currentPref;

        if (targetPalette === currentPalette && targetPref === currentPref) return false;

        applyingFromProfile = true;
        try {
            if (targetPref !== currentPref) Theme.setModePreference(targetPref);
            const afterPrefPalette = Theme.getPalette(Theme.readStoredThemeId());
            if (targetPalette !== afterPrefPalette) Theme.setPalette(targetPalette);
        } finally {
            applyingFromProfile = false;
        }

        if (!options.skipProfileWrite) {
            writeProfileTheme({
                themePalette: Theme.getPalette(Theme.readStoredThemeId()),
                themeModePref: Theme.getModePreference(),
            });
        }
        return true;
    }

    function migrateLocalThemeToProfileIfNeeded() {
        if (bootMigrated) return;
        bootMigrated = true;

        const Theme = readThemeApi();
        if (!Theme) return;

        const profile = readProfile();
        const hasProfileTheme = normalizePalette(profile.themePalette, Theme)
            || normalizeModePref(profile.themeModePref, Theme);

        if (hasProfileTheme) {
            applyProfileTheme(profile, { skipProfileWrite: true });
            return;
        }

        syncThemeToProfile();
    }

    function onProfileUpdated(event) {
        const fields = Array.isArray(event?.detail?.fields)
            ? event.detail.fields
            : (event?.detail?.field ? [event.detail.field] : []);
        if (fields.length > 0
            && !fields.includes('themePalette')
            && !fields.includes('themeModePref')) return;
        if (event?.detail?.source === 'theme-profile-sync') return;

        const profile = readProfile();
        applyProfileTheme(profile, { skipProfileWrite: true });
    }

    function install() {
        const Theme = readThemeApi();
        if (!Theme || typeof Theme.subscribeThemeChange !== 'function') return false;
        if (HEYS.ThemeProfileSync.__subscribed) return true;

        migrateLocalThemeToProfileIfNeeded();
        Theme.subscribeThemeChange(() => syncThemeToProfile());
        HEYS.ThemeProfileSync.__subscribed = true;

        global.addEventListener('heys:profile-updated', onProfileUpdated);
        global.addEventListener('heys:client-changed', () => migrateLocalThemeToProfileIfNeeded());
        return true;
    }

    function ensureInstalled() {
        if (install()) return;
        let tries = 0;
        const timer = global.setInterval(() => {
            tries += 1;
            if (install() || tries > 50) global.clearInterval(timer);
        }, 200);
    }

    HEYS.ThemeProfileSync = {
        __initialized: true,
        __subscribed: false,
        install,
        ensureInstalled,
        syncThemeToProfile,
        applyProfileTheme,
        migrateLocalThemeToProfileIfNeeded,
    };

    if (readThemeApi()) ensureInstalled();
}(typeof window !== 'undefined' ? window : globalThis));
