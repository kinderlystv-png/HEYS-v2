import { log } from '@heys/logger';
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

import type { ClientStatus } from './curatorData';

const HEYS_PREFIX = 'heys_';
const DAY_KEY_PREFIX = `${HEYS_PREFIX}dayv2_`;
const KNOWN_STATUSES: ClientStatus[] = ['active', 'paused', 'archived'];

let warnedAboutEnv = false;
let cachedService: SupabaseCuratorService | null | undefined;

export interface SupabaseCuratorConfig {
  supabaseUrl: string;
  serviceKey: string;
}

export interface SupabaseClientRecord {
  id: string;
  name: string;
  email?: string;
  status: ClientStatus;
  createdAt?: string;
  updatedAt?: string;
  lastActivityAt?: string;
}

export interface ClientKvRecord<T = unknown> {
  key: string;
  rawKey: string;
  value: T;
  updatedAt?: string;
}

export interface SupabaseCuratorClientSnapshot {
  client: SupabaseClientRecord;
  kv: Record<string, ClientKvRecord>;
}

export interface FetchClientsOptions {
  includeKeys?: string[];
  includeKeyPrefixes?: string[];
}

export class SupabaseUnavailableError extends Error {
  constructor(message = 'Supabase подключение не настроено') {
    super(message);
    this.name = 'SupabaseUnavailableError';
  }
}

export class SupabaseClientAccessError extends Error {
  constructor(message = 'Клиент не найден или нет доступа') {
    super(message);
    this.name = 'SupabaseClientAccessError';
  }
}

export class SupabaseDataError extends Error {
  constructor(public readonly entity: string, public readonly original?: PostgrestError) {
    super(original ? `Supabase error for ${entity}: ${original.message}` : `Supabase error for ${entity}`);
    this.name = 'SupabaseDataError';
  }
}

export class SupabaseCuratorService {
  private supabase: SupabaseClient | null = null;

  constructor(private readonly config: SupabaseCuratorConfig) {
    if (!config.supabaseUrl || !config.serviceKey) {
      throw new SupabaseUnavailableError();
    }
  }

  static fromEnv(): SupabaseCuratorService | null {
    const supabaseUrl = process.env.SUPABASE_URL ?? '';
    const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';

    if (!supabaseUrl || !serviceKey) {
      if (!warnedAboutEnv) {
        log.warn('[SupabaseCuratorService] SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы — backend продолжит работу на мок-данных');
        warnedAboutEnv = true;
      }
      return null;
    }

    return new SupabaseCuratorService({ supabaseUrl, serviceKey });
  }

  static getSharedInstance(): SupabaseCuratorService | null {
    if (cachedService !== undefined) {
      return cachedService;
    }
    cachedService = SupabaseCuratorService.fromEnv();
    return cachedService;
  }

  isEnabled(): boolean {
    return Boolean(this.config.supabaseUrl && this.config.serviceKey);
  }

  async fetchClients(curatorId: string, options: FetchClientsOptions = {}): Promise<SupabaseCuratorClientSnapshot[]> {
    if (!curatorId) {
      throw new SupabaseClientAccessError('curatorId обязателен');
    }

    const supabase = this.ensureClient();
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,email,status,created_at,updated_at,last_activity_at')
      .eq('curator_id', curatorId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new SupabaseDataError('clients', error);
    }

    const rows = data ?? [];
    const clientIds = rows.map((row) => row.id).filter(Boolean);
    const kvMap = await this.fetchKvRecords(clientIds, options.includeKeys, options.includeKeyPrefixes);

    return rows.map((row) => ({
      client: this.mapClientRow(row),
      kv: bucketToRecord(kvMap.get(row.id))
    }));
  }

  async fetchClientById(
    curatorId: string,
    clientId: string,
    options: FetchClientsOptions = {}
  ): Promise<SupabaseCuratorClientSnapshot | null> {
    if (!curatorId || !clientId) {
      throw new SupabaseClientAccessError('curatorId и clientId обязательны');
    }

    const supabase = this.ensureClient();
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,email,status,created_at,updated_at,last_activity_at,curator_id')
      .eq('curator_id', curatorId)
      .eq('id', clientId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new SupabaseDataError('clients', error);
    }

    if (!data) {
      return null;
    }

    const kvMap = await this.fetchKvRecords([clientId], options.includeKeys, options.includeKeyPrefixes);

    return {
      client: this.mapClientRow(data),
      kv: bucketToRecord(kvMap.get(clientId))
    };
  }

  async fetchClientKey<T = unknown>(
    curatorId: string,
    clientId: string,
    key: string
  ): Promise<ClientKvRecord<T> | null> {
    await this.assertClientAccess(curatorId, clientId);

    const keyVariants = expandKeyVariants(key);
    if (!keyVariants.length) {
      return null;
    }

    const supabase = this.ensureClient();
    let query = supabase
      .from('client_kv_store')
      .select('client_id,k,v,updated_at')
      .eq('client_id', clientId)
      .limit(1);

    if (keyVariants.length === 1) {
      query = query.eq('k', keyVariants[0]);
    } else {
      query = query.in('k', keyVariants);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new SupabaseDataError('client_kv_store', error);
    }

    if (!data) {
      return null;
    }

    return mapKvRecord<T>(data);
  }

  async fetchClientDayRaw(
    curatorId: string,
    clientId: string,
    date: string
  ): Promise<ClientKvRecord | null> {
    const normalizedDate = date?.trim();
    if (!normalizedDate) {
      throw new Error('Дата обязательна');
    }

    const dayKey = `${DAY_KEY_PREFIX}${normalizedDate}`;
    return this.fetchClientKey(curatorId, clientId, dayKey);
  }

  private ensureClient(): SupabaseClient {
    if (this.supabase) {
      return this.supabase;
    }

    this.supabase = createClient(this.config.supabaseUrl, this.config.serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      },
      global: {
        headers: {
          'X-Client-Info': 'heys-core-supabase'
        }
      }
    });

    return this.supabase;
  }

  private async assertClientAccess(curatorId: string, clientId: string): Promise<void> {
    const supabase = this.ensureClient();
    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .eq('curator_id', curatorId)
      .eq('id', clientId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new SupabaseClientAccessError();
      }
      throw new SupabaseDataError('clients', error);
    }

    if (!data) {
      throw new SupabaseClientAccessError();
    }
  }

  private mapClientRow(row: SupabaseClientRow): SupabaseClientRecord {
    if (!row.id) {
      throw new SupabaseDataError('clients');
    }

    return {
      id: row.id,
      name: row.name ?? 'Без имени',
      email: row.email ?? undefined,
      status: mapClientStatus(row.status),
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? row.created_at ?? undefined,
      lastActivityAt: row.last_activity_at ?? undefined
    };
  }

  private async fetchKvRecords(
    clientIds: string[],
    includeKeys?: string[],
    includePrefixes?: string[]
  ): Promise<Map<string, ClientKvRecord[]>> {
    const grouped = new Map<string, ClientKvRecord[]>();

    if (!clientIds.length || (!includeKeys?.length && !includePrefixes?.length)) {
      return grouped;
    }

    const supabase = this.ensureClient();
    const seen = new Set<string>();

    const pushRow = (row: SupabaseKvRow) => {
      if (!row.client_id) return;
      const dedupKey = `${row.client_id}::${row.k}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const record = mapKvRecord(row);
      const bucket = grouped.get(row.client_id) ?? [];
      bucket.push(record);
      grouped.set(row.client_id, bucket);
    };

    const keyVariants = buildVariantList(includeKeys);
    if (keyVariants.length) {
      const { data, error } = await supabase
        .from('client_kv_store')
        .select('client_id,k,v,updated_at')
        .in('client_id', clientIds)
        .in('k', keyVariants);

      if (error) {
        throw new SupabaseDataError('client_kv_store', error);
      }

      data?.forEach(pushRow);
    }

    const prefixVariants = buildVariantList(includePrefixes);
    if (prefixVariants.length) {
      const orFilter = prefixVariants
        .map((prefix) => `k.ilike.${escapeLikePattern(prefix)}%`)
        .join(',');

      if (orFilter) {
        const { data, error } = await supabase
          .from('client_kv_store')
          .select('client_id,k,v,updated_at')
          .in('client_id', clientIds)
          .or(orFilter);

        if (error) {
          throw new SupabaseDataError('client_kv_store', error);
        }

        data?.forEach(pushRow);
      }
    }

    return grouped;
  }
}

export function getSupabaseCuratorService(): SupabaseCuratorService | null {
  return SupabaseCuratorService.getSharedInstance();
}

interface SupabaseClientRow {
  id: string;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  curator_id?: string | null;
}

interface SupabaseKvRow {
  client_id: string;
  k: string;
  v: unknown;
  updated_at?: string | null;
}

function mapClientStatus(value?: string | null): ClientStatus {
  if (!value) {
    return 'active';
  }

  const normalized = value.toLowerCase().trim();
  return KNOWN_STATUSES.includes(normalized as ClientStatus)
    ? (normalized as ClientStatus)
    : 'active';
}

function expandKeyVariants(key: string): string[] {
  if (!key) {
    return [];
  }

  const trimmed = key.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>();
  variants.add(trimmed);
  if (trimmed.startsWith(HEYS_PREFIX)) {
    variants.add(trimmed.slice(HEYS_PREFIX.length));
  } else {
    variants.add(`${HEYS_PREFIX}${trimmed}`);
  }
  return Array.from(variants);
}

function buildVariantList(input?: string[]): string[] {
  if (!input?.length) {
    return [];
  }

  const variants = new Set<string>();
  input.forEach((key) => {
    expandKeyVariants(key).forEach((variant) => {
      const normalized = variant.trim();
      if (normalized) {
        variants.add(normalized);
      }
    });
  });

  return Array.from(variants);
}

function normalizeKey(rawKey: string): string {
  if (!rawKey) {
    return rawKey;
  }
  return rawKey.startsWith(HEYS_PREFIX) ? rawKey : `${HEYS_PREFIX}${rawKey}`;
}

function mapKvRecord<T = unknown>(row: SupabaseKvRow): ClientKvRecord<T> {
  return {
    key: normalizeKey(row.k),
    rawKey: row.k,
    value: row.v as T,
    updatedAt: row.updated_at ?? undefined
  };
}

function bucketToRecord(bucket?: ClientKvRecord[]): Record<string, ClientKvRecord> {
  if (!bucket?.length) {
    return {};
  }

  return bucket.reduce<Record<string, ClientKvRecord>>((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

