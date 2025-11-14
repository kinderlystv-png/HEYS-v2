// API Types для Telegram mini-app куратора
// Эти типы описывают контракт между фронтендом и backend

/**
 * Сессия куратора (авторизация через Telegram)
 */
export interface CuratorSession {
  /** ID куратора в системе HEYS */
  curatorId: string;

  /** Имя куратора */
  name: string;

  /** Username из Telegram */
  username?: string;

  /** Telegram User ID */
  telegramUserId: number;

  /** Токен сессии */
  token: string;

  /** Истекает в */
  expiresAt: string; // ISO 8601

  /** Признак dev-режима (моковая сессия для разработки) */
  isDevFallback?: boolean;
}

/**
 * Запрос авторизации через Telegram initData
 * POST /api/curator/auth
 */
export interface CuratorAuthRequest {
  /** initData строка от Telegram WebApp */
  initData: string;
}

/**
 * Ответ API авторизации
 */
export interface CuratorAuthResponse {
  /** Успешно ли прошла авторизация */
  success: boolean;

  /** Сессия (если успешно) */
  session?: CuratorSession;

  /** Ошибка (если неуспешно) */
  error?: string;
}

/**
 * Минимальная информация о клиенте для списка в панели куратора
 */
export interface CuratorClient {
  /** UUID клиента */
  id: string;

  /** Имя клиента */
  name: string;

  /** Email (опционально) */
  email?: string;

  /** Статус клиента */
  status: 'active' | 'paused' | 'archived';

  /** Дата последнего обновления дневника питания */
  lastActivityAt?: string; // ISO 8601

  /** Краткая сводка по текущему дню */
  todaySummary?: {
    /** Калории за сегодня */
    calories: number;
    /** Процент выполнения дневной нормы калорий */
    caloriesPercent: number;
    /** Количество приёмов пищи */
    mealsCount: number;
  };

  /** Метаданные профиля клиента (для UI) */
  profile?: {
    /** Возраст */
    age?: number;
    /** Пол */
    gender?: 'male' | 'female';
    /** Вес (кг) */
    weight?: number;
    /** Рост (см) */
    height?: number;
    /** Целевой процент дефицита/профицита калорий */
    deficitPctTarget?: number;
  };

  /** Дата создания */
  createdAt: string; // ISO 8601

  /** Дата последнего обновления */
  updatedAt: string; // ISO 8601
}

/**
 * Ответ API: список клиентов куратора
 * GET /api/curator/clients
 */
export interface GetClientsResponse {
  /** Массив клиентов */
  clients: CuratorClient[];

  /** Пагинация (опционально) */
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Параметры запроса списка клиентов
 * Query params для GET /api/curator/clients
 */
export interface GetClientsParams {
  /** Номер страницы (по умолчанию 1) */
  page?: number;

  /** Количество на странице (по умолчанию 20) */
  perPage?: number;

  /** Поиск по имени/email */
  search?: string;

  /** Фильтр по статусу */
  status?: 'active' | 'paused' | 'archived' | 'all';

  /** Сортировка */
  sortBy?: 'name' | 'lastActivity' | 'createdAt';

  /** Порядок сортировки */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Детальная информация о клиенте
 * GET /api/curator/clients/:clientId
 */
export interface ClientDetails extends CuratorClient {
  /** Статистика за последние 7 дней */
  weekStats?: {
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    daysWithData: number;
  };

  /** Текущая целевая норма калорий */
  targetCalories?: number;

  /** Примечания куратора */
  curatorNotes?: string;
}

/**
 * Данные дня клиента (приёмы пищи)
 * GET /api/curator/clients/:clientId/day/:date
 */
export interface ClientDayData {
  /** ID клиента */
  clientId: string;

  /** Дата в формате YYYY-MM-DD */
  date: string;

  /** Приёмы пищи */
  meals: Array<{
    /** ID приёма */
    id: string;
    /** Тип приёма */
    type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    /** Время приёма */
    time: string; // HH:mm
    /** Список продуктов */
    products: Array<{
      /** ID продукта в базе (опционально) */
      productId?: string;
      /** Название продукта */
      name: string;
      /** Вес (г) */
      weight: number;
      /** Калории */
      calories: number;
      /** Белки (г) */
      protein: number;
      /** Углеводы (г) */
      carbs: number;
      /** Жиры (г) */
      fat: number;
    }>;
  }>;

  /** Итоговые показатели дня */
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

/**
 * Продукт из базы HEYS
 */
export interface Product {
  /** ID продукта */
  id: string;

  /** Название продукта */
  name: string;

  /** Нутриенты на 100г */
  nutrition: {
    /** Калории на 100г */
    calories: number;
    /** Белки на 100г */
    protein: number;
    /** Углеводы на 100г */
    carbs: number;
    /** Жиры на 100г */
    fat: number;
    /** Клетчатка (г) */
    fiber?: number;
    /** Гликемический индекс */
    gi?: number;
  };

  /** Категория продукта (опционально) */
  category?: string;

  /** Дата создания */
  createdAt?: string;

  /** Дата обновления */
  updatedAt?: string;
}

/**
 * Поиск продуктов в базе
 * GET /api/products/search
 */
export interface SearchProductsParams {
  /** Поисковый запрос */
  query: string;

  /** Максимальное количество результатов (по умолчанию 20) */
  limit?: number;

  /** Категория для фильтрации */
  category?: string;
}

/**
 * Ответ поиска продуктов
 */
export interface SearchProductsResponse {
  /** Массив найденных продуктов */
  products: Product[];

  /** Общее количество найденных */
  total: number;
}

/**
 * Получить продукт по ID
 * GET /api/products/:productId
 */
export interface GetProductResponse {
  /** Продукт */
  product: Product;
}
