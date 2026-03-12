// Local-only helper for embedded browser / DevTools auth flows.
// Usage in localhost console:
//   await import('/dev/heys-agent-auth-helper.js');
//   await window.HEYSAgentAuth.getStatus();
//   await window.HEYSAgentAuth.loginCurator({ email: 'dev@example.com', password: 'secret' });
//   await window.HEYSAgentAuth.loginPin({ phone: '79991234567', pin: '1234' });
//   await window.HEYSAgentAuth.logout();
(function (global) {
    if (global.HEYSAgentAuth) return;

    const PREFIX = '[HEYS.agentAuth]';
    const AUTH_STORAGE_KEYS = [
        'heys_client_current',
        'heys_client_phone',
        'heys_curator_session',
        'heys_last_client_id',
        'heys_pin_auth_client',
        'heys_remember_email',
        'heys_session_token',
        'heys_supabase_auth_token',
    ];

    function info(message, details) {
        if (typeof details === 'undefined') {
            console.info(PREFIX + ' ' + message);
            return;
        }
        console.info(PREFIX + ' ' + message, details);
    }

    function warn(message, details) {
        if (typeof details === 'undefined') {
            console.warn(PREFIX + ' ' + message);
            return;
        }
        console.warn(PREFIX + ' ' + message, details);
    }

    function error(message, details) {
        if (typeof details === 'undefined') {
            console.error(PREFIX + ' ' + message);
            return;
        }
        console.error(PREFIX + ' ' + message, details);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function readStorage(key, fallback) {
        try {
            const raw = global.localStorage.getItem(key);
            if (raw == null) return fallback;
            try {
                return JSON.parse(raw);
            } catch (_) {
                return raw;
            }
        } catch (_) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {
            try {
                global.localStorage.setItem(key, String(value));
            } catch (e) {
                warn('Не удалось записать ключ ' + key, e?.message || e);
            }
        }
    }

    function removeStorage(key) {
        try {
            global.localStorage.removeItem(key);
        } catch (_) { }
    }

    function normalizePhone(phone) {
        const auth = global.HEYS?.auth;
        if (auth?.normalizePhone) return auth.normalizePhone(phone);
        return String(phone || '').replace(/\D/g, '');
    }

    function maskToken(value) {
        const raw = String(value || '');
        if (!raw) return null;
        if (raw.length <= 10) return raw;
        return raw.slice(0, 4) + '***' + raw.slice(-4);
    }

    function getRuntime() {
        return global.HEYS || {};
    }

    async function waitForReady(timeoutMs) {
        const timeout = Math.max(1000, Number(timeoutMs) || 15000);
        const startedAt = Date.now();

        while ((Date.now() - startedAt) < timeout) {
            const HEYS = getRuntime();
            if (
                HEYS &&
                HEYS.auth &&
                typeof HEYS.auth.loginClient === 'function' &&
                typeof HEYS.auth.logout === 'function' &&
                HEYS.cloud &&
                typeof HEYS.cloud.signIn === 'function' &&
                typeof HEYS.cloud.signOut === 'function'
            ) {
                return getStatus();
            }
            await sleep(100);
        }

        throw new Error('HEYS runtime не готов за ' + timeout + 'ms');
    }

    function getStatus() {
        const HEYS = getRuntime();
        const cloudUser = HEYS.cloud?.getUser?.() || null;
        const currentClientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId || readStorage('heys_client_current', null) || null;
        const sessionToken = HEYS.auth?.getSessionToken?.() || readStorage('heys_session_token', null) || null;
        const pinAuthClientId = readStorage('heys_pin_auth_client', null);
        const curatorToken = global.localStorage.getItem('heys_curator_session');
        const legacyAuth = readStorage('heys_supabase_auth_token', null);
        const hasCuratorSession = !!(curatorToken || legacyAuth?.access_token || cloudUser);
        const hasClientSession = !!(sessionToken || pinAuthClientId || currentClientId);

        return {
            ok: true,
            mode: hasCuratorSession ? 'curator' : hasClientSession ? 'client' : 'anonymous',
            ready: !!(HEYS.auth && HEYS.cloud),
            hasCuratorSession,
            hasClientSession,
            currentClientId: currentClientId || null,
            pinAuthClientId: pinAuthClientId || null,
            hasSessionToken: !!sessionToken,
            sessionTokenMasked: maskToken(sessionToken),
            curatorEmail: cloudUser?.email || legacyAuth?.user?.email || null,
            cloudStatus: HEYS.cloud?.getStatus?.() || null,
            storage: AUTH_STORAGE_KEYS.reduce((acc, key) => {
                const value = readStorage(key, null);
                acc[key] = key.includes('token') || key.includes('session') ? maskToken(value?.access_token || value) : value;
                return acc;
            }, {}),
        };
    }

    function dispatchAuthEvents() {
        try {
            global.dispatchEvent(new Event('heys:auth-changed'));
        } catch (_) { }
        try {
            global.dispatchEvent(new Event('heys-auth-ready'));
        } catch (_) { }
    }

    function clearResidualState() {
        AUTH_STORAGE_KEYS.forEach(removeStorage);
        removeStorage('heys_connection_mode');

        try {
            if (global.HEYS) {
                global.HEYS.currentClientId = null;
            }
        } catch (_) { }

        try {
            global.HEYS?.cloud?.clearPinAuthClient?.();
        } catch (_) { }

        try {
            global.HEYS?.store?.flushMemory?.();
        } catch (_) { }
    }

    async function logout(options) {
        const opts = options || {};
        const reload = opts.reload !== false;
        const statusBefore = getStatus();
        const HEYS = getRuntime();

        info('Запуск logout', { mode: statusBefore.mode });

        try {
            if (statusBefore.hasClientSession && typeof HEYS.auth?.logout === 'function') {
                await HEYS.auth.logout();
            }
        } catch (e) {
            warn('Ошибка client logout', e?.message || e);
        }

        try {
            if ((statusBefore.hasCuratorSession || HEYS.cloud?.getUser?.()) && typeof HEYS.cloud?.signOut === 'function') {
                await HEYS.cloud.signOut();
            }
        } catch (e) {
            warn('Ошибка curator logout', e?.message || e);
        }

        clearResidualState();
        dispatchAuthEvents();

        const result = {
            ok: true,
            statusBefore,
            statusAfter: getStatus(),
            reloaded: reload,
        };

        info('Logout завершён', { modeBefore: statusBefore.mode, reload });

        if (reload) {
            global.location.reload();
        }

        return result;
    }

    async function loginPin(payload) {
        const params = payload || {};
        const reload = params.reload !== false;
        const ensureLoggedOut = params.ensureLoggedOut !== false;
        const phone = normalizePhone(params.phone);
        const pin = String(params.pin || '');

        if (!/^7\d{10}$/.test(phone)) {
            throw new Error('Phone должен быть в формате 79991234567');
        }
        if (!/^\d{4}$/.test(pin)) {
            throw new Error('PIN должен состоять из 4 цифр');
        }

        await waitForReady(params.timeoutMs);
        if (ensureLoggedOut) {
            await logout({ reload: false });
        }

        const HEYS = getRuntime();
        const result = await HEYS.auth.loginClient({ phone, pin });
        if (!result?.ok || !result.clientId) {
            error('PIN login failed', result);
            return {
                ok: false,
                error: result?.error || result?.message || 'pin_login_failed',
                details: result || null,
            };
        }

        try {
            HEYS.cloud?.setPinAuthClient?.(result.clientId);
        } catch (_) { }

        try {
            if (typeof HEYS.cloud?.switchClient === 'function') {
                await HEYS.cloud.switchClient(result.clientId);
            } else {
                writeStorage('heys_client_current', result.clientId);
            }
        } catch (e) {
            warn('switchClient завершился с ошибкой', e?.message || e);
            writeStorage('heys_client_current', result.clientId);
        }

        writeStorage('heys_last_client_id', result.clientId);
        writeStorage('heys_client_phone', phone);
        global.__heysPreAuth = {
            type: 'client-pin',
            clientId: result.clientId,
            timestamp: Date.now(),
        };

        dispatchAuthEvents();
        info('PIN login завершён', { clientId: result.clientId, reload });

        const response = {
            ok: true,
            clientId: result.clientId,
            sessionTokenMasked: maskToken(result.sessionToken),
            status: getStatus(),
            reloaded: reload,
        };

        if (reload) {
            global.location.reload();
        }

        return response;
    }

    async function loginCurator(payload) {
        const params = payload || {};
        const reload = params.reload !== false;
        const ensureLoggedOut = params.ensureLoggedOut !== false;
        const email = String(params.email || '').trim();
        const password = String(params.password || '');

        if (!email || !password) {
            throw new Error('Нужны email и password');
        }

        await waitForReady(params.timeoutMs);
        if (ensureLoggedOut) {
            await logout({ reload: false });
        }

        const HEYS = getRuntime();
        const result = await HEYS.cloud.signIn(email, password);
        if (!result || result.error) {
            error('Curator login failed', result?.error || result);
            return {
                ok: false,
                error: result?.error?.message || result?.error || 'curator_login_failed',
                details: result || null,
            };
        }

        global.__heysPreAuth = {
            type: 'curator',
            email,
            timestamp: Date.now(),
        };
        dispatchAuthEvents();
        info('Curator login завершён', { email, reload });

        const response = {
            ok: true,
            user: HEYS.cloud?.getUser?.() || result.user || null,
            status: getStatus(),
            reloaded: reload,
        };

        if (reload) {
            global.location.reload();
        }

        return response;
    }

    function help() {
        return {
            load: "await import('/dev/heys-agent-auth-helper.js')",
            status: 'await HEYSAgentAuth.getStatus()',
            logout: 'await HEYSAgentAuth.logout()',
            loginCurator: "await HEYSAgentAuth.loginCurator({ email: 'dev@example.com', password: 'secret' })",
            loginPin: "await HEYSAgentAuth.loginPin({ phone: '79991234567', pin: '1234' })",
        };
    }

    const api = {
        waitForReady,
        getStatus,
        logout,
        loginPin,
        loginCurator,
        help,
    };

    global.HEYSAgentAuth = api;
    info('Helper loaded. Вызовите HEYSAgentAuth.help() для примеров.');
})(typeof window !== 'undefined' ? window : globalThis);