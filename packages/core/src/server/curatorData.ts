export type ClientStatus = 'active' | 'paused' | 'archived';

export interface ClientTodaySummary {
  calories: number;
  caloriesPercent: number;
  mealsCount: number;
}

export interface ClientProfile {
  age?: number;
  gender?: 'male' | 'female';
  weight?: number;
  height?: number;
  deficitPctTarget?: number;
}

export interface ClientWeekStats {
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  daysWithData: number;
}

export interface ClientDayRecord {
  clientId: string;
  date: string;
  meals: Array<{
    id: string;
    type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    time: string;
    products: Array<{
      productId?: string;
      name: string;
      weight: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }>;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface CuratorClientRecord {
  id: string;
  name: string;
  email?: string;
  status: ClientStatus;
  lastActivityAt?: string;
  todaySummary?: ClientTodaySummary;
  profile?: ClientProfile;
  weekStats?: ClientWeekStats;
  targetCalories?: number;
  curatorNotes?: string;
  createdAt: string;
  updatedAt: string;
  dayData?: Record<string, ClientDayRecord>;
}

const now = new Date();
const today = now.toISOString().slice(0, 10);

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const annaDay: ClientDayRecord = {
  clientId: 'demo-anna',
  date: today,
  meals: [
    {
      id: 'anna-breakfast',
      type: 'breakfast',
      time: '08:10',
      products: [
        { name: 'Овсянка на воде', weight: 100, calories: 350, protein: 12, carbs: 60, fat: 6 },
        { name: 'Ягоды замороженные', weight: 50, calories: 30, protein: 1, carbs: 7, fat: 0.3 }
      ]
    },
    {
      id: 'anna-lunch',
      type: 'lunch',
      time: '13:05',
      products: [
        { name: 'Куриная грудка', weight: 150, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
        { name: 'Булгур', weight: 120, calories: 170, protein: 5, carbs: 34, fat: 2 },
        { name: 'Овощной салат', weight: 100, calories: 60, protein: 2, carbs: 10, fat: 2.5 }
      ]
    },
    {
      id: 'anna-dinner',
      type: 'dinner',
      time: '19:45',
      products: [
        { name: 'Запечённый лосось', weight: 140, calories: 280, protein: 28, carbs: 0, fat: 18 },
        { name: 'Киноа', weight: 100, calories: 120, protein: 4, carbs: 21, fat: 2 }
      ]
    }
  ],
  totals: {
    calories: 1175,
    protein: 83,
    carbs: 132,
    fat: 34.4
  }
};

const juliaDay: ClientDayRecord = {
  clientId: 'demo-julia',
  date: today,
  meals: [
    {
      id: 'julia-breakfast',
      type: 'breakfast',
      time: '07:40',
      products: [
        { name: 'Творог 5%', weight: 150, calories: 210, protein: 27, carbs: 6, fat: 9 },
        { name: 'Мёд', weight: 15, calories: 45, protein: 0, carbs: 11, fat: 0 }
      ]
    }
  ],
  totals: {
    calories: 255,
    protein: 27,
    carbs: 17,
    fat: 9
  }
};

export const CURATOR_CLIENTS: CuratorClientRecord[] = [
  {
    id: 'demo-anna',
    name: 'Анна Петрова',
    email: 'anna@example.com',
    status: 'active',
    lastActivityAt: now.toISOString(),
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
    updatedAt: daysAgo(7),
    dayData: {
      [today]: annaDay
    }
  },
  {
    id: 'demo-ivan',
    name: 'Иван Смирнов',
    email: 'ivan@example.com',
    status: 'paused',
    lastActivityAt: daysAgo(14),
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
    updatedAt: daysAgo(14),
    dayData: {}
  },
  {
    id: 'demo-julia',
    name: 'Юлия Руднева',
    email: 'julia@example.com',
    status: 'active',
    lastActivityAt: daysAgo(1),
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
    updatedAt: daysAgo(2),
    dayData: {
      [today]: juliaDay
    }
  }
];

export function findClientRecord(clientId: string): CuratorClientRecord | undefined {
  return CURATOR_CLIENTS.find((client) => client.id === clientId);
}

export function getAllowedClients(allowedIds: string[] | null | undefined): CuratorClientRecord[] {
  if (!allowedIds || allowedIds.length === 0) {
    return CURATOR_CLIENTS;
  }

  const allowedSet = new Set(allowedIds);
  return CURATOR_CLIENTS.filter((client) => allowedSet.has(client.id));
}

export function getClientDayRecord(clientId: string, date: string): ClientDayRecord | undefined {
  const client = findClientRecord(clientId);
  if (!client?.dayData) {
    return undefined;
  }
  return client.dayData[date];
}
