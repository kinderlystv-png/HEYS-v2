import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClientKvRecord, SupabaseCuratorClientSnapshot } from '../supabaseCuratorService';

interface SetupOptions {
  supabaseClients?: SupabaseCuratorClientSnapshot[];
  clientDetails?: SupabaseCuratorClientSnapshot | null;
  clientDay?: ClientKvRecord | null;
  curatorMap?: string;
}

describe('serverRouter Supabase integration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_CURATOR_MAP;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('issues Supabase-backed session when Telegram user is mapped', async () => {
    const supabaseSnapshot = createClientSnapshot('sup-client-1', 'Анна Петрова');
    const { agent, mockSupabaseService } = await setupRouterTest({
      supabaseClients: [supabaseSnapshot]
    });

    const response = await agent.post('/api/telegram/auth/verify').send({ initData: 'mock' }).expect(200);

    expect(response.body.dataSource).toBe('supabase');
    expect(response.body.supabaseCuratorId).toBe('00000000-0000-4000-8000-aaaaaaaaaaaa');
    expect(mockSupabaseService.fetchClients).toHaveBeenCalledWith('00000000-0000-4000-8000-aaaaaaaaaaaa');
  });

  it('returns clients from Supabase for curator sessions', async () => {
    const supabaseSnapshot = createClientSnapshot('sup-client-2', 'Иван Смирнов');
    const { agent } = await setupRouterTest({
      supabaseClients: [supabaseSnapshot]
    });

    const auth = await agent.post('/api/telegram/auth/verify').send({ initData: 'mock' }).expect(200);

    const list = await agent
      .get('/api/curator/clients')
      .set('authorization', `Bearer ${auth.body.token}`)
      .expect(200);

    expect(list.body.clients).toHaveLength(1);
    expect(list.body.clients[0].id).toBe('sup-client-2');
    expect(list.body.clients[0].name).toBe('Иван Смирнов');
  });

  it('maps Supabase day records to API schema', async () => {
    const supabaseSnapshot = createClientSnapshot('sup-client-3', 'Юлия Руднева');
    const supabaseDay: ClientKvRecord = {
      key: 'heys_dayv2_2025-02-01',
      rawKey: 'heys_dayv2_2025-02-01',
      value: {
        date: '2025-02-01',
        meals: [
          {
            id: 'meal-1',
            type: 'Lunch',
            time: '12:00',
            products: [
              {
                productId: 'prod-1',
                name: 'Куриная грудка',
                weight: 150,
                nutrition: {
                  kcal100: 165,
                  protein100: 31,
                  carbs100: 0,
                  fat100: 3.6
                }
              }
            ]
          }
        ]
      }
    };

    const { agent } = await setupRouterTest({
      supabaseClients: [supabaseSnapshot],
      clientDay: supabaseDay
    });

    const auth = await agent.post('/api/telegram/auth/verify').send({ initData: 'mock' }).expect(200);

    const day = await agent
      .get('/api/curator/clients/sup-client-3/day/2025-02-01')
      .set('authorization', `Bearer ${auth.body.token}`)
      .expect(200);

    expect(day.body.meals).toHaveLength(1);
    expect(day.body.meals[0].products[0].calories).toBeCloseTo(247.5, 1);
    expect(day.body.totals.protein).toBeCloseTo(46.5, 1);
  });
});

async function setupRouterTest(options: SetupOptions = {}) {
  vi.resetModules();

  const mockSupabaseService = {
    fetchClients: vi.fn().mockResolvedValue(options.supabaseClients ?? [createClientSnapshot('sup-client', 'Анна')]),
    fetchClientById: vi.fn().mockResolvedValue(options.clientDetails ?? null),
    fetchClientDayRaw: vi.fn().mockResolvedValue(options.clientDay ?? null)
  };

  vi.doMock('../supabaseCuratorService', () => ({
    getSupabaseCuratorService: () => mockSupabaseService
  }));

  const mockVerifyTelegram = vi.fn(() => ({ ok: true, user: { id: 123, first_name: 'Test' } }));
  const mockEnsureAllowed = vi.fn(() => ({ ok: true }));

  vi.doMock('../telegramAuth', () => ({
    verifyTelegramInitData: mockVerifyTelegram,
    ensureUserAllowed: mockEnsureAllowed
  }));

  process.env.TELEGRAM_CURATOR_MAP = options.curatorMap ?? '123=00000000-0000-4000-8000-aaaaaaaaaaaa';
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

  const { serverRouter } = await import('../router');
  const app = express();
  app.use(express.json());
  app.use(serverRouter);

  return {
    app,
    agent: request(app),
    mockSupabaseService
  };
}

function createClientSnapshot(id: string, name: string): SupabaseCuratorClientSnapshot {
  return {
    client: {
      id,
      name,
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      lastActivityAt: '2024-01-03T00:00:00Z'
    },
    kv: {
      heys_profile: {
        key: 'heys_profile',
        rawKey: 'heys_profile',
        value: {
          gender: 'female',
          height: 170,
          weight: 62
        }
      }
    }
  };
}