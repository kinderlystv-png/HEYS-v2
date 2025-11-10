// heys_storage_supabase_v1.ts — Supabase bridge (TypeScript version)
// Дополнительно:
//  • перехватываем localStorage.setItem и зеркалим не только 'heys_*', но и ключи дней: 'day*' (без учёта регистра);
//  • при входе/выходе чистим и 'heys_*', и 'day*' — отчётность не увидит чужие дни;
//  • во время sync/clear отключаем зеркалирование (muteMirror), чтобы не гонять «эхо».

import type { HEYSGlobal } from './types/heys';

// Supabase types
interface SupabaseClient {
  auth: {
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<AuthResponse>;
    signOut: () => Promise<void>;
  };
  from: (table: string) => SupabaseQueryBuilder;
}

interface AuthResponse {
  data: { user?: SupabaseUser } | null;
  error: any;
}

interface SupabaseUser {
  id: string;
  email: string;
  [key: string]: any;
}

interface SupabaseQueryBuilder {
  select: (columns?: string) => SupabaseQueryBuilder;
  insert: (data: any) => SupabaseQueryBuilder;
  upsert: (data: any, options?: { onConflict?: string }) => SupabaseQueryBuilder;
  eq: (column: string, value: any) => SupabaseQueryBuilder;
  single: () => Promise<{ data: any; error: any }>;
  then: (onFulfilled: (value: { data: any; error: any }) => any) => Promise<any>;
}

interface KVStoreRecord {
  k: string;
  v: any;
  updated_at?: string;
  client_id?: string;
}

interface ClientKVStoreRecord {
  client_id: string;
  k: string;
  v: any;
  updated_at?: string;
}

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
    supabase: any; // Keep as any to avoid conflicts with existing global
    localStorage: Storage;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const cloud = (HEYS.cloud = HEYS.cloud || ({} as HEYSGlobal['cloud']));

  let client: SupabaseClient | null = null;
  let status: 'offline' | 'signin' | 'sync' | 'online' = 'offline';
  let user: SupabaseUser | null = null;
  let muteMirror = false;

  // Logging utilities
  function log(...args: any[]): void {
    try {
      console.log.apply(console, ['[HEYS.cloud]'].concat(args as any));
    } catch (e) {
      // Silent fail
    }
  }

  function err(...args: any[]): void {
    try {
      console.error.apply(console, ['[HEYS.cloud:ERR]'].concat(args as any));
    } catch (e) {
      // Silent fail
    }
  }

  function tryParse(v: string): any {
    try {
      return JSON.parse(v);
    } catch (e) {
      return v;
    }
  }

  // Определяем какие ключи мы зеркалим / чистим
  function isOurKey(k: string): boolean {
    if (typeof k !== 'string') return false;
    if (k.indexOf('heys_') === 0) return true;
    // также разрешаем ключи дней
    const lower = k.toLowerCase();
    if (lower.indexOf('day') >= 0) return true;
    return false;
  }

  function clearNamespace(clientId?: string): void {
    try {
      const ls = global.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k) continue;
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
          if (
            k === 'heys_products' ||
            k === 'heys_profile' ||
            k === 'heys_hr_zones' ||
            k === 'heys_norms'
          ) {
            ls.removeItem(k);
            continue;
          }
        } else {
          // clear all
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
    } catch (e) {
      err('clearNamespace', e);
    }
  }

  // intercept localStorage.setItem (зеркалим наши ключи)
  let originalSetItem: ((key: string, value: string) => void) | null = null;

  function interceptSetItem(): void {
    try {
      if (originalSetItem) return;
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      global.localStorage.setItem = function (k: string, v: string): void {
        originalSetItem!(k, v);
        if (!muteMirror && isOurKey(k)) {
          // Проверяем, нужно ли направить в client_kv_store
          const needsClientStorage =
            (k && k.includes('dayv2_')) || // дни пользователя
            k === 'heys_profile' || // профиль
            k === 'heys_hr_zones' || // зоны пульса
            k === 'heys_norms' || // нормы
            k === 'heys_products'; // продукты

          if (needsClientStorage) {
            cloud.saveClientKey(k, tryParse(v));
          } else {
            cloud.saveKey(k, tryParse(v));
          }
        }
      };
    } catch (e) {
      err('intercept setItem failed', e);
    }
  }

  // Cloud API implementation
  cloud.init = function ({ url, anonKey }: { url: string; anonKey: string }): void {
    // Idempotent init: avoid double creation & duplicate intercept logs
    if (cloud._inited) return;
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
    } catch (e) {
      err('init failed', e);
    }
  };

  cloud.signIn = async function (
    email: string,
    password: string,
  ): Promise<{ user?: SupabaseUser; error?: any }> {
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
    } catch (e) {
      status = 'offline';
      err('signIn exception', e);
      return { error: e };
    }
  };

  cloud.signOut = function (): void {
    if (client) client.auth.signOut();
    user = null;
    status = 'offline';
    clearNamespace();
    log('signOut ok');
  };

  cloud.getUser = function (): SupabaseUser | null {
    return user;
  };

  cloud.getStatus = function (): string {
    return status;
  };

  cloud.bootstrapSync = async function (): Promise<void> {
    try {
      muteMirror = true;
      if (!client || !user) return;
      const { data, error } = await client.from('kv_store').select('k,v,updated_at');
      if (error) {
        err('bootstrap select', error);
        return;
      }
      const ls = global.localStorage;
      // clear only global keys for full bootstrap (no clientId)
      clearNamespace();
      (data || []).forEach((row: KVStoreRecord) => {
        try {
          const key = row.k;
          ls.setItem(key, JSON.stringify(row.v));
        } catch (e) {
          // Silent fail for individual items
        }
      });
      muteMirror = false;
    } catch (e) {
      err('bootstrapSync failed', e);
    } finally {
      muteMirror = false;
    }
  };

  cloud.bootstrapClientSync = async function (clientId: string): Promise<void> {
    try {
      muteMirror = true;
      if (!client || !user) return;

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

      (data || []).forEach((row: ClientKVStoreRecord) => {
        try {
          const key = row.k;
          ls.setItem(key, JSON.stringify(row.v));
        } catch (e) {
          // Silent fail for individual items
        }
      });

      log(`Client ${clientId} synced ${(data || []).length} keys`);
    } catch (e) {
      err('bootstrapClientSync failed', e);
    } finally {
      muteMirror = false;
    }
  };

  cloud.shouldSyncClient = function (clientId: string, maxAgeMs: number = 5 * 60 * 1000): boolean {
    if (!cloud._lastClientSync) return true;
    if (cloud._lastClientSync.clientId !== clientId) return true;
    return Date.now() - cloud._lastClientSync.ts > maxAgeMs;
  };

  cloud.saveKey = async function (key: string, value: any): Promise<void> {
    if (!client || !user || muteMirror) return;
    try {
      const record: KVStoreRecord = {
        k: key,
        v: value,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client.from('kv_store').upsert(record, { onConflict: 'k' });

      if (error) {
        err('saveKey failed', key, error);
      }
    } catch (e) {
      err('saveKey exception', key, e);
    }
  };

  cloud.saveClientKey = async function (key: string, value: any, clientId?: string): Promise<void> {
    if (!client || !user || muteMirror) return;

    // Используем текущий clientId если не указан
    const targetClientId = clientId || HEYS.currentClientId;
    if (!targetClientId) {
      err('saveClientKey: no clientId specified');
      return;
    }

    try {
      const record: ClientKVStoreRecord = {
        client_id: targetClientId,
        k: key,
        v: value,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client
        .from('client_kv_store')
        .upsert(record, { onConflict: 'client_id,k' });

      if (error) {
        err('saveClientKey failed', key, error);
      }
    } catch (e) {
      err('saveClientKey exception', key, e);
    }
  };

  cloud.ensureClient = async function (clientId: string): Promise<boolean> {
    if (!client || !user) return false;
    try {
      const { data, error } = await client.from('clients').select('id').eq('id', clientId).single();

      if (error && error.code === 'PGRST116') {
        // Client doesn't exist, create it
        const { error: insertError } = await client.from('clients').insert({
          id: clientId,
          name: `Client ${clientId}`,
          curator_id: user.id,
          created_at: new Date().toISOString(),
        });

        if (insertError) {
          err('ensureClient create failed', clientId, insertError);
          return false;
        }

        log(`Client ${clientId} created`);
        return true;
      } else if (error) {
        err('ensureClient select failed', clientId, error);
        return false;
      }

      return true; // Client exists
    } catch (e) {
      err('ensureClient exception', clientId, e);
      return false;
    }
  };

  cloud.upsert = async function (tableName: string, obj: any, conflictKey?: string): Promise<any> {
    if (!client || !user) return { error: 'Not authenticated' };
    try {
      const options = conflictKey ? { onConflict: conflictKey } : undefined;
      const { data, error } = await client.from(tableName).upsert(obj, options);

      return { data, error };
    } catch (e) {
      err('upsert exception', tableName, e);
      return { error: e };
    }
  };

  // Sync status tracking
  const syncStatuses = new Map<string, 'pending' | 'syncing' | 'synced' | 'error'>();

  cloud.getSyncStatus = function (key: string): string {
    return syncStatuses.get(key) || 'unknown';
  };

  cloud.waitForSync = async function (key: string, timeout: number = 5000): Promise<string> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkStatus = (): void => {
        const status = syncStatuses.get(key);
        if (status === 'synced' || status === 'error') {
          resolve(status);
        } else if (Date.now() - startTime > timeout) {
          resolve('timeout');
        } else {
          setTimeout(checkStatus, 100);
        }
      };
      checkStatus();
    });
  };

  // Utility functions for compatibility
  cloud.lsGet = function (key: string, defaultValue: any = null): any {
    try {
      const item = global.localStorage.getItem(key);
      return item !== null ? tryParse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };

  cloud.lsSet = function (key: string, value: any): void {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      err('lsSet failed', key, e);
    }
  };

  // Assign to cloud object
  (cloud as any).client = null; // Will be set in init()

  console.log('☁️ HEYS Storage Supabase v1 (TypeScript) загружен');
})(window);
