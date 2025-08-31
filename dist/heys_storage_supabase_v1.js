// heys_storage_supabase_v1.ts — Supabase bridge (TypeScript version)
// Дополнительно:
//  • перехватываем localStorage.setItem и зеркалим не только 'heys_*', но и ключи дней: 'day*' (без учёта регистра);
//  • при входе/выходе чистим и 'heys_*', и 'day*' — отчётность не увидит чужие дни;
//  • во время sync/clear отключаем зеркалирование (muteMirror), чтобы не гонять «эхо».
// Module implementation
;
(function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const cloud = HEYS.cloud = HEYS.cloud || {};
    let client = null;
    let status = 'offline';
    let user = null;
    let muteMirror = false;
    // Logging utilities
    function log(...args) {
        try {
            console.log.apply(console, ['[HEYS.cloud]'].concat(args));
        }
        catch (e) {
            // Silent fail
        }
    }
    function err(...args) {
        try {
            console.error.apply(console, ['[HEYS.cloud:ERR]'].concat(args));
        }
        catch (e) {
            // Silent fail
        }
    }
    function tryParse(v) {
        try {
            return JSON.parse(v);
        }
        catch (e) {
            return v;
        }
    }
    // Определяем какие ключи мы зеркалим / чистим
    function isOurKey(k) {
        if (typeof k !== 'string')
            return false;
        if (k.indexOf('heys_') === 0)
            return true;
        // также разрешаем ключи дней
        const lower = k.toLowerCase();
        if (lower.indexOf('day') >= 0)
            return true;
        return false;
    }
    function clearNamespace(clientId) {
        try {
            const ls = global.localStorage;
            for (let i = ls.length - 1; i >= 0; i--) {
                const k = ls.key(i);
                if (!k)
                    continue;
                const lower = k.toLowerCase();
                if (clientId) {
                    // clear only client-specific keys AND general heys_ keys
                    if (lower.indexOf(('heys_' + clientId + '_').toLowerCase()) === 0) {
                        ls.removeItem(k);
                        continue;
                    }
                    if (lower.indexOf(('day_' + clientId + '_').toLowerCase()) === 0) {
                        ls.removeItem(k);
                        continue;
                    }
                    // Also clear general keys that should be client-specific
                    if (k === 'heys_products' || k === 'heys_profile' || k === 'heys_hr_zones' || k === 'heys_norms') {
                        ls.removeItem(k);
                        continue;
                    }
                }
                else {
                    // clear all
                    if (isOurKey(k))
                        ls.removeItem(k);
                }
            }
        }
        catch (e) {
            err('clearNamespace', e);
        }
    }
    // intercept localStorage.setItem (зеркалим наши ключи)
    let originalSetItem = null;
    function interceptSetItem() {
        try {
            if (originalSetItem)
                return;
            originalSetItem = global.localStorage.setItem.bind(global.localStorage);
            global.localStorage.setItem = function (k, v) {
                originalSetItem(k, v);
                if (!muteMirror && isOurKey(k)) {
                    // Проверяем, нужно ли направить в client_kv_store
                    const needsClientStorage = ((k && k.includes('dayv2_')) || // дни пользователя
                        (k === 'heys_profile') || // профиль
                        (k === 'heys_hr_zones') || // зоны пульса  
                        (k === 'heys_norms') || // нормы
                        (k === 'heys_products') // продукты
                    );
                    if (needsClientStorage) {
                        cloud.saveClientKey(k, tryParse(v));
                    }
                    else {
                        cloud.saveKey(k, tryParse(v));
                    }
                }
            };
        }
        catch (e) {
            err('intercept setItem failed', e);
        }
    }
    // Cloud API implementation
    cloud.init = function ({ url, anonKey }) {
        // Idempotent init: avoid double creation & duplicate intercept logs
        if (cloud._inited)
            return;
        if (!global.supabase || !global.supabase.createClient) {
            err('supabase-js не загружен');
            return;
        }
        try {
            client = global.supabase.createClient(url, anonKey);
            cloud.client = client;
            status = 'offline';
            interceptSetItem();
            cloud._inited = true;
            log('cloud bridge loaded');
        }
        catch (e) {
            err('init failed', e);
        }
    };
    cloud.signIn = async function (email, password) {
        if (!client) {
            err('client not initialized');
            return { error: 'Client not initialized' };
        }
        try {
            status = 'signin';
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) {
                status = 'offline';
                err('signIn failed', error);
                return { error };
            }
            user = data?.user || null;
            if (!user) {
                status = 'offline';
                err('no user after signin');
                return { error: 'no user' };
            }
            status = 'sync';
            await cloud.bootstrapSync();
            status = 'online';
            log('signIn ok, user=', user.email);
            return { user };
        }
        catch (e) {
            status = 'offline';
            err('signIn exception', e);
            return { error: e };
        }
    };
    cloud.signOut = function () {
        if (client)
            client.auth.signOut();
        user = null;
        status = 'offline';
        clearNamespace();
        log('signOut ok');
    };
    cloud.getUser = function () {
        return user;
    };
    cloud.getStatus = function () {
        return status;
    };
    cloud.bootstrapSync = async function () {
        try {
            muteMirror = true;
            if (!client || !user)
                return;
            const { data, error } = await client.from('kv_store').select('k,v,updated_at');
            if (error) {
                err('bootstrap select', error);
                return;
            }
            const ls = global.localStorage;
            // clear only global keys for full bootstrap (no clientId)
            clearNamespace();
            (data || []).forEach((row) => {
                try {
                    const key = row.k;
                    ls.setItem(key, JSON.stringify(row.v));
                }
                catch (e) {
                    // Silent fail for individual items
                }
            });
            muteMirror = false;
        }
        catch (e) {
            err('bootstrapSync failed', e);
        }
        finally {
            muteMirror = false;
        }
    };
    cloud.bootstrapClientSync = async function (clientId) {
        try {
            muteMirror = true;
            if (!client || !user)
                return;
            // Запоминаем время синхронизации
            cloud._lastClientSync = { clientId, ts: Date.now() };
            const { data, error } = await client
                .from('client_kv_store')
                .select('k,v,updated_at')
                .eq('client_id', clientId);
            if (error) {
                err('bootstrapClientSync select', error);
                return;
            }
            const ls = global.localStorage;
            // Очищаем только клиентские ключи
            clearNamespace(clientId);
            (data || []).forEach((row) => {
                try {
                    const key = row.k;
                    ls.setItem(key, JSON.stringify(row.v));
                }
                catch (e) {
                    // Silent fail for individual items
                }
            });
            log(`Client ${clientId} synced ${(data || []).length} keys`);
        }
        catch (e) {
            err('bootstrapClientSync failed', e);
        }
        finally {
            muteMirror = false;
        }
    };
    cloud.shouldSyncClient = function (clientId, maxAgeMs = 5 * 60 * 1000) {
        if (!cloud._lastClientSync)
            return true;
        if (cloud._lastClientSync.clientId !== clientId)
            return true;
        return (Date.now() - cloud._lastClientSync.ts) > maxAgeMs;
    };
    cloud.saveKey = async function (key, value) {
        if (!client || !user || muteMirror)
            return;
        try {
            const record = {
                k: key,
                v: value,
                updated_at: new Date().toISOString()
            };
            const { error } = await client
                .from('kv_store')
                .upsert(record, { onConflict: 'k' });
            if (error) {
                err('saveKey failed', key, error);
            }
        }
        catch (e) {
            err('saveKey exception', key, e);
        }
    };
    cloud.saveClientKey = async function (key, value, clientId) {
        if (!client || !user || muteMirror)
            return;
        // Используем текущий clientId если не указан
        const targetClientId = clientId || HEYS.currentClientId;
        if (!targetClientId) {
            err('saveClientKey: no clientId specified');
            return;
        }
        try {
            const record = {
                client_id: targetClientId,
                k: key,
                v: value,
                updated_at: new Date().toISOString()
            };
            const { error } = await client
                .from('client_kv_store')
                .upsert(record, { onConflict: 'client_id,k' });
            if (error) {
                err('saveClientKey failed', key, error);
            }
        }
        catch (e) {
            err('saveClientKey exception', key, e);
        }
    };
    cloud.ensureClient = async function (clientId) {
        if (!client || !user)
            return false;
        try {
            const { data, error } = await client
                .from('clients')
                .select('id')
                .eq('id', clientId)
                .single();
            if (error && error.code === 'PGRST116') {
                // Client doesn't exist, create it
                const { error: insertError } = await client
                    .from('clients')
                    .insert({
                    id: clientId,
                    name: `Client ${clientId}`,
                    curator_id: user.id,
                    created_at: new Date().toISOString()
                });
                if (insertError) {
                    err('ensureClient create failed', clientId, insertError);
                    return false;
                }
                log(`Client ${clientId} created`);
                return true;
            }
            else if (error) {
                err('ensureClient select failed', clientId, error);
                return false;
            }
            return true; // Client exists
        }
        catch (e) {
            err('ensureClient exception', clientId, e);
            return false;
        }
    };
    cloud.upsert = async function (tableName, obj, conflictKey) {
        if (!client || !user)
            return { error: 'Not authenticated' };
        try {
            const options = conflictKey ? { onConflict: conflictKey } : undefined;
            const { data, error } = await client
                .from(tableName)
                .upsert(obj, options);
            return { data, error };
        }
        catch (e) {
            err('upsert exception', tableName, e);
            return { error: e };
        }
    };
    // Sync status tracking
    const syncStatuses = new Map();
    cloud.getSyncStatus = function (key) {
        return syncStatuses.get(key) || 'unknown';
    };
    cloud.waitForSync = async function (key, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkStatus = () => {
                const status = syncStatuses.get(key);
                if (status === 'synced' || status === 'error') {
                    resolve(status);
                }
                else if (Date.now() - startTime > timeout) {
                    resolve('timeout');
                }
                else {
                    setTimeout(checkStatus, 100);
                }
            };
            checkStatus();
        });
    };
    // Utility functions for compatibility
    cloud.lsGet = function (key, defaultValue = null) {
        try {
            const item = global.localStorage.getItem(key);
            return item !== null ? tryParse(item) : defaultValue;
        }
        catch (e) {
            return defaultValue;
        }
    };
    cloud.lsSet = function (key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
        }
        catch (e) {
            err('lsSet failed', key, e);
        }
    };
    // Assign to cloud object
    cloud.client = null; // Will be set in init()
    console.log('☁️ HEYS Storage Supabase v1 (TypeScript) загружен');
})(window);
export {};
//# sourceMappingURL=heys_storage_supabase_v1.js.map