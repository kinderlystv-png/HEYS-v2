import type { ClientDayData, ClientDetails } from '../types/api';

import { httpRequest } from './httpClient';

const USE_MOCKS = import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';

const mockClientDetails: Record<string, ClientDetails> = {
  'demo-anna': {
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
    weekStats: {
      avgCalories: 1760,
      avgProtein: 115,
      avgCarbs: 180,
      avgFat: 52,
      daysWithData: 6
    },
    targetCalories: 1800,
    curatorNotes: 'Следить за водой 2.5л/день',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-02-05T08:00:00Z'
  },
  'demo-ivan': {
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
    weekStats: {
      avgCalories: 0,
      avgProtein: 0,
      avgCarbs: 0,
      avgFat: 0,
      daysWithData: 0
    },
    targetCalories: 2200,
    curatorNotes: 'На паузе до 01.03',
    createdAt: '2023-11-12T08:00:00Z',
    updatedAt: '2024-02-01T10:16:00Z'
  },
  'demo-julia': {
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
    weekStats: {
      avgCalories: 1880,
      avgProtein: 125,
      avgCarbs: 210,
      avgFat: 58,
      daysWithData: 7
    },
    targetCalories: 1900,
    curatorNotes: 'Добавить углеводы в дни тренировок',
    createdAt: '2023-09-05T08:00:00Z',
    updatedAt: '2024-02-11T20:00:00Z'
  }
};

const mockDayData: Record<string, Record<string, ClientDayData>> = {
  'demo-anna': {
    '2025-02-14': {
      clientId: 'demo-anna',
      date: '2025-02-14',
      meals: [
        {
          id: 'anna-breakfast',
          type: 'breakfast',
          time: '08:10',
          products: [
            {
              productId: 'oats',
              name: 'Овсянка на воде',
              weight: 100,
              calories: 350,
              protein: 12,
              carbs: 60,
              fat: 6
            },
            {
              productId: 'berries',
              name: 'Ягоды замороженные',
              weight: 50,
              calories: 30,
              protein: 1,
              carbs: 7,
              fat: 0.3
            }
          ]
        },
        {
          id: 'anna-lunch',
          type: 'lunch',
          time: '13:05',
          products: [
            {
              name: 'Куриная грудка',
              weight: 150,
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6
            },
            {
              name: 'Булгур',
              weight: 120,
              calories: 170,
              protein: 5,
              carbs: 34,
              fat: 2
            },
            {
              name: 'Овощной салат',
              weight: 100,
              calories: 60,
              protein: 2,
              carbs: 10,
              fat: 2.5
            }
          ]
        },
        {
          id: 'anna-dinner',
          type: 'dinner',
          time: '19:45',
          products: [
            {
              name: 'Запечённый лосось',
              weight: 140,
              calories: 280,
              protein: 28,
              carbs: 0,
              fat: 18
            },
            {
              name: 'Киноа',
              weight: 100,
              calories: 120,
              protein: 4,
              carbs: 21,
              fat: 2
            }
          ]
        }
      ],
      totals: {
        calories: 1175,
        protein: 83,
        carbs: 132,
        fat: 34.4
      }
    }
  },
  'demo-julia': {
    '2025-02-14': {
      clientId: 'demo-julia',
      date: '2025-02-14',
      meals: [
        {
          id: 'julia-breakfast',
          type: 'breakfast',
          time: '07:40',
          products: [
            {
              name: 'Творог 5%',
              weight: 150,
              calories: 210,
              protein: 27,
              carbs: 6,
              fat: 9
            },
            {
              name: 'Мёд',
              weight: 15,
              calories: 45,
              protein: 0,
              carbs: 11,
              fat: 0
            }
          ]
        }
      ],
      totals: {
        calories: 255,
        protein: 27,
        carbs: 17,
        fat: 9
      }
    }
  }
};

const fallbackDay: ClientDayData = {
  clientId: 'unknown',
  date: new Date().toISOString().slice(0, 10),
  meals: [],
  totals: {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  }
};

export async function fetchClientDetails(clientId: string): Promise<ClientDetails> {
  if (USE_MOCKS) {
    const client = mockClientDetails[clientId];
    if (!client) {
      throw new Error('Клиент не найден (mock)');
    }
    return client;
  }

  const response = await httpRequest(`/api/curator/clients/${clientId}`);
  if (!response.ok) {
    throw new Error(`Не удалось получить данные клиента (код ${response.status})`);
  }
  return response.json() as Promise<ClientDetails>;
}

export async function fetchClientDayData(clientId: string, date: string): Promise<ClientDayData> {
  if (USE_MOCKS) {
    const dayData = mockDayData[clientId]?.[date];
    if (dayData) {
      return dayData;
    }
    return { ...fallbackDay, clientId, date };
  }

  const response = await httpRequest(`/api/curator/clients/${clientId}/day/${date}`);
  if (!response.ok) {
    throw new Error(`Не удалось получить данные дня (код ${response.status})`);
  }
  return response.json() as Promise<ClientDayData>;
}
