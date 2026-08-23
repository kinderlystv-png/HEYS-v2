// heys_e2e_fixtures_v1.js — dev fixture filter for curator panel (E2E + smoke junk)
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    /** @type {readonly string[]} Keep in sync with .env.local.example HEYS_TEST_E2E_CLIENT_* */
    const E2E_CLIENT_IDS = Object.freeze([
        '11111111-1111-1111-1111-111111111111', // E2E-TestAlex
        '22222222-2222-2222-2222-222222222222', // E2E-TestPopl
    ]);

    /** @type {readonly string[]} Production/login smoke rows on poplanton@mail.ru — hide from panel */
    const SMOKE_DEV_CLIENT_IDS = Object.freeze([
        '7397a9db-03bb-45ce-a202-74b3aea2836e', // HEYS production smoke 165216038
        '9bc6f6c3-77e1-49cd-a270-ab3356f8bdb6', // HEYS production smoke 163655556
        '5d067903-da72-407a-bc36-bfd57e3eb60f', // Login Smoke Test
        'f5822a0f-3944-40c5-88cf-a4fd6c4215cb', // login-smoke-deploy
        'a8958ff0-0000-4000-8000-000000008958', // Purge Warn Smoke Client
    ]);

    /** @type {readonly string[]} All dev fixtures hidden from curator panel unless bypass flag set */
    const DEV_FIXTURE_CLIENT_IDS = Object.freeze([
        ...E2E_CLIENT_IDS,
        ...SMOKE_DEV_CLIENT_IDS,
    ]);

    const DEV_FIXTURE_ID_SET = new Set(DEV_FIXTURE_CLIENT_IDS.map((id) => id.toLowerCase()));

    /** @type {readonly RegExp[]} Name patterns for dev fixtures not yet in UUID list */
    const DEV_FIXTURE_NAME_PATTERNS = Object.freeze([
        /^E2E-/,
        /^HEYS production smoke/i,
        /^Login Smoke/i,
        /^login-smoke-/i,
        /^Purge Warn Smoke/i,
    ]);

    const SHOW_E2E_LS_KEY = 'heys_show_e2e_clients';

    function shouldShowE2EInCuratorPanel() {
        try {
            return localStorage.getItem(SHOW_E2E_LS_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function matchesDevFixtureName(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        return DEV_FIXTURE_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
    }

    function isDevFixtureClient(client) {
        if (!client) return false;
        const id = String(client.id || '').toLowerCase();
        if (id && DEV_FIXTURE_ID_SET.has(id)) return true;
        return matchesDevFixtureName(client.name);
    }

    /** @deprecated alias — covers E2E + smoke dev fixtures */
    function isE2EFixtureClient(client) {
        return isDevFixtureClient(client);
    }

    /** Hide dev fixtures from curator panel UI; full list stays in HEYS.curatorClients for sync/switch. */
    function filterCuratorPanelClients(clients) {
        if (!Array.isArray(clients)) return [];
        if (shouldShowE2EInCuratorPanel()) return clients.slice();
        return clients.filter((client) => !isDevFixtureClient(client));
    }

    HEYS.E2EFixtures = {
        CLIENT_IDS: E2E_CLIENT_IDS,
        SMOKE_CLIENT_IDS: SMOKE_DEV_CLIENT_IDS,
        DEV_FIXTURE_CLIENT_IDS,
        NAME_PATTERNS: DEV_FIXTURE_NAME_PATTERNS,
        SHOW_IN_PANEL_LS_KEY: SHOW_E2E_LS_KEY,
        isDevFixtureClient,
        isE2EFixtureClient,
        filterCuratorPanelClients,
        shouldShowE2EInCuratorPanel,
    };
})();
