import type { CuratorClient, GetClientsParams, GetClientsResponse } from '../types/api';

import { httpRequest } from './httpClient';

const USE_MOCKS = import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';

export class ApiError extends Error {
  public status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    if (typeof status !== 'undefined') {
      this.status = status;
    }
  }
}

const mockClients: GetClientsResponse = {
  clients: [
    {
      id: 'demo-anna',
      name: 'Анна Петрова',
      email: 'anna@example.com',
      status: 'active',
      lastActivityAt: new Date().toISOString(),
      todaySummary: {
        calories: 1520,
        caloriesPercent: 84,
        mealsCount: 4
      },
      profile: {
        age: 28,
        gender: 'female',
        weight: 62,
        height: 170,
        deficitPctTarget: -10
      },
      createdAt: '2024-01-10T08:00:00Z',
      updatedAt: '2024-02-05T08:00:00Z'
    },
    {
      id: 'demo-ivan',
      name: 'Иван Смирнов',
      email: 'ivan@example.com',
      status: 'paused',
      lastActivityAt: '2024-02-01T10:15:00Z',
      todaySummary: {
        calories: 0,
        caloriesPercent: 0,
        mealsCount: 0
      },
      profile: {
        age: 35,
        gender: 'male',
        weight: 90,
        height: 185
      },
      createdAt: '2023-11-12T08:00:00Z',
      updatedAt: '2024-02-01T10:16:00Z'
    },
    {
      id: 'demo-julia',
      name: 'Юлия Руднева',
      email: 'julia@example.com',
      status: 'active',
      lastActivityAt: '2024-02-12T07:30:00Z',
      todaySummary: {
        calories: 1890,
        caloriesPercent: 99,
        mealsCount: 5
      },
      profile: {
        age: 32,
        gender: 'female',
        weight: 58,
        height: 166,
        deficitPctTarget: -8
      },
      createdAt: '2023-09-05T08:00:00Z',
      updatedAt: '2024-02-11T20:00:00Z'
    }
  ],
  pagination: {
    page: 1,
    perPage: 20,
    total: 3,
    totalPages: 1
  }
};

function buildQueryString(params?: GetClientsParams) {
  const searchParams = new URLSearchParams();

  if (!params) {
    return '';
  }

  if (params.page) searchParams.set('page', String(params.page));
  if (params.perPage) searchParams.set('perPage', String(params.perPage));
  if (params.status && params.status !== 'all') searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchCuratorClients(params?: GetClientsParams): Promise<GetClientsResponse> {
  if (USE_MOCKS) {
    // Простая фильтрация по имени/email на клиенте в моках
    return filterMockClients(params);
  }

  const response = await httpRequest(`/api/curator/clients${buildQueryString(params)}`);

  if (!response.ok) {
    throw new ApiError('Не удалось загрузить список клиентов', response.status);
  }

  return response.json() as Promise<GetClientsResponse>;
}

function filterMockClients(params?: GetClientsParams): GetClientsResponse {
  if (!params) {
    return mockClients;
  }

  let clients: CuratorClient[] = [...mockClients.clients];

  if (params.search) {
    const queryLower = params.search.toLowerCase();
    clients = clients.filter((client) =>
      client.name.toLowerCase().includes(queryLower) || client.email?.toLowerCase().includes(queryLower)
    );
  }

  if (params.status && params.status !== 'all') {
    clients = clients.filter((client) => client.status === params.status);
  }

  const perPage = params.perPage ?? mockClients.pagination?.perPage ?? 20;
  const page = params.page ?? 1;
  const total = clients.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIndex = (page - 1) * perPage;
  const paginated = clients.slice(startIndex, startIndex + perPage);

  return {
    clients: paginated,
    pagination: {
      page,
      perPage,
      total,
      totalPages
    }
  };
}
