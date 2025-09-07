/**
 * 🧪 УНИВЕРСАЛЬНАЯ ОБЕРТКА ДЛЯ ТЕСТИРОВАНИЯ
 * Единый интерфейс для всех фреймворков
 */

import { vi } from 'vitest';

/**
 * Автоматически определяет и загружает нужную testing library
 */
async function getTestingLibrary() {
  try {
    // Пробуем React
    const reactLib = await import('@testing-library/react');
    return { type: 'react', lib: reactLib };
  } catch {
    try {
      // Пробуем Vue
      const vueLib = await import('@testing-library/vue');
      return { type: 'vue', lib: vueLib };
    } catch {
      try {
        // Пробуем Svelte
        const svelteLib = await import('@testing-library/svelte');
        return { type: 'svelte', lib: svelteLib };
      } catch {
        throw new Error('Не удалось найти поддерживаемую testing library');
      }
    }
  }
}

/**
 * Универсальная функция рендеринга
 */
export async function renderWithProviders(component, options = {}) {
  const { type, lib } = await getTestingLibrary();

  switch (type) {
    case 'react':
      return lib.render(component, options);

    case 'vue':
      return lib.render(component, {
        global: {
          plugins: options.plugins || []
        },
        ...options
      });

    case 'svelte':
      return lib.render(component, options);

    default:
      throw new Error(`Неподдерживаемый тип: ${type}`);
  }
}

/**
 * Универсальные моки для всех фреймворков
 */
export const universalMocks = {
  // Мок для роутера (React/Next.js)
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/'
  },

  // Мок для API запросов
  apiResponse: (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data)
  }),

  // Мок для localStorage
  localStorage: () => {
    const store = {};
    return {
      getItem: vi.fn(key => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value; }),
      removeItem: vi.fn(key => { delete store[key]; }),
      clear: vi.fn(() => { Object.keys(store).forEach(key => delete store[key]); })
    };
  },

  // Мок для IntersectionObserver
  intersectionObserver: () => vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  })),

  // Мок для matchMedia
  matchMedia: () => vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
};

/**
 * Универсальные хелперы для тестирования
 */
export const testHelpers = {
  // Ожидание загрузки
  waitForLoad: async (timeout = 5000) => {
    const { lib } = await getTestingLibrary();
    return lib.waitFor(() => {}, { timeout });
  },

  // Поиск элемента с повторными попытками
  findElement: async (selector, timeout = 5000) => {
    const { lib } = await getTestingLibrary();
    return lib.waitFor(() => {
      const element = lib.screen.getByTestId(selector);
      if (!element) throw new Error(`Элемент ${selector} не найден`);
      return element;
    }, { timeout });
  },

  // Симуляция пользовательского ввода
  userInput: async (element, value) => {
    const userEvent = await import('@testing-library/user-event');
    const user = userEvent.default.setup();
    await user.clear(element);
    await user.type(element, value);
  },

  // Симуляция клика
  userClick: async (element) => {
    const userEvent = await import('@testing-library/user-event');
    const user = userEvent.default.setup();
    await user.click(element);
  }
};

/**
 * Специализированные функции для фреймворков
 */
export const frameworkSpecific = {
  // React/Next.js специфичные моки
  react: {
    mockNextRouter: () => {
      vi.mock('next/router', () => ({
        useRouter: () => universalMocks.router
      }));
    },

    mockNextImage: () => {
      vi.mock('next/image', () => ({
        default: ({ src, alt, ...props }) => ({
          type: 'img',
          props: { src, alt, ...props }
        })
      }));
    }
  },

  // Vue/Nuxt специфичные моки
  vue: {
    mockNuxtRouter: () => {
      global.$nuxt = {
        $router: universalMocks.router
      };
    },

    createMockStore: (initialState = {}) => ({
      state: initialState,
      commit: vi.fn(),
      dispatch: vi.fn()
    })
  },

  // SvelteKit специфичные моки
  svelte: {
    mockPageStore: async () => {
      const { readable } = await import('svelte/store');
      return readable({
        url: new URL('http://localhost'),
        params: {}
      });
    },

    mockNavigationStore: () => ({
      goto: vi.fn(),
      invalidate: vi.fn()
    })
  }
};

/**
 * Утилиты для создания тестовых данных
 */
export const testDataUtils = {
  // Генерация уникального ID
  generateId: () => crypto.randomUUID(),

  // Генерация email
  generateEmail: (prefix = 'test') => `${prefix}-${Date.now()}@example.com`,

  // Генерация даты
  generateDate: (daysFromNow = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString();
  },

  // Создание мок-функции с предустановленными возвращаемыми значениями
  createMockWithReturns: (returnValues) => {
    const mock = vi.fn();
    returnValues.forEach((value) => {
      mock.mockReturnValueOnce(value);
    });
    return mock;
  }
};

/**
 * Кастомные матчеры для более удобного тестирования
 */
export const customMatchers = {
  // Проверка видимости элемента
  toBeVisible: (element) => {
    const isVisible = element.offsetParent !== null;
    return {
      pass: isVisible,
      message: () => `Элемент ${isVisible ? 'видим' : 'не видим'}`
    };
  },

  // Проверка наличия класса
  toHaveClass: (element, className) => {
    const hasClass = element.classList.contains(className);
    return {
      pass: hasClass,
      message: () => `Элемент ${hasClass ? 'имеет' : 'не имеет'} класс ${className}`
    };
  }
};

/**
 * Настройка моков для конкретного фреймворка
 */
export async function setupFrameworkMocks() {
  const { type } = await getTestingLibrary();

  // Универсальные моки
  global.IntersectionObserver = universalMocks.intersectionObserver();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: universalMocks.matchMedia()
  });
  Object.defineProperty(window, 'localStorage', {
    value: universalMocks.localStorage()
  });

  // Фреймворк-специфичные моки
  switch (type) {
    case 'react':
      frameworkSpecific.react.mockNextRouter();
      frameworkSpecific.react.mockNextImage();
      break;

    case 'vue':
      frameworkSpecific.vue.mockNuxtRouter();
      break;

    case 'svelte':
      // SvelteKit специфичные настройки
      break;
  }
}

/**
 * Основная функция для настройки тестового окружения
 */
export function setupTestEnvironment() {
  // Очистка моков после каждого теста
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Настройка моков перед всеми тестами
  beforeAll(async () => {
    await setupFrameworkMocks();
  });
}

// Экспорт всех утилит одним объектом
const testingUtils = {
  renderWithProviders,
  universalMocks,
  testHelpers,
  frameworkSpecific,
  testDataUtils,
  customMatchers,
  setupTestEnvironment
};

export default testingUtils;
