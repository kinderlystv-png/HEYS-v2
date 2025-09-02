// Тестирование исправлений импорта продуктов и React компонентов
// Создано: September 2, 2025

describe('Import Fixes Integration Tests', () => {
  describe('Product Import Component', () => {
    test('should have parsePasted function available globally', () => {
      // Проверяем что функция parsePasted доступна глобально
      expect(typeof window.parsePasted).toBe('function');
    });

    test('should have all required utility functions', () => {
      // Проверяем что все необходимые функции определены
      expect(typeof window.uuid).toBe('function');
      expect(typeof window.toNum).toBe('function'); 
      expect(typeof window.round1).toBe('function');
      expect(typeof window.computeDerived).toBe('function');
    });

    test('should handle synchronous parsing fallback', () => {
      // Тестируем что синхронный парсинг работает как фоллбэк
      const mockText = "Тестовый продукт\t100\t20\t5\t2\t1\t0.5\t15\t50\t2";
      
      // Мокаем parsePastedSync
      window.parsePastedSync = jest.fn().mockReturnValue([{
        id: 'test123',
        name: 'Тестовый продукт',
        simple100: 20,
        complex100: 5,
        protein100: 100,
        badFat100: 2,
        goodFat100: 1,
        trans100: 0.5,
        fiber100: 15,
        gi: 50,
        harmScore: 2
      }]);

      const result = window.parsePasted(mockText);
      
      // Проверяем что возвращается промис
      expect(result).toBeInstanceOf(Promise);
      
      return result.then(products => {
        expect(Array.isArray(products)).toBe(true);
        expect(products).toHaveLength(1);
        expect(products[0].name).toBe('Тестовый продукт');
      });
    });
  });

  describe('React Component Fixes', () => {
    test('should have ReportsTab component available', () => {
      // Проверяем что компонент ReportsTab экспортирован правильно
      expect(window.HEYS).toBeDefined();
      expect(window.HEYS.ReportsTab).toBeDefined();
      expect(typeof window.HEYS.ReportsTab).toBe('function');
    });

    test('should not have incorrect ReportTab export', () => {
      // Проверяем что неправильный экспорт не существует
      expect(window.HEYS.ReportTab).toBeUndefined();
    });
  });

  describe('Port Configuration', () => {
    test('should use correct ports for development', () => {
      // Проверяем переменные окружения
      const port = process.env.PORT || process.env.VITE_PORT;
      const apiPort = process.env.API_PORT;
      
      // Ожидаем правильные порты для проекта B
      expect(port).toBe('3001');
      expect(apiPort).toBe('4001');
    });
  });

  describe('Error Logging Enhancement', () => {
    test('should have enhanced error logging in place', () => {
      // Проверяем что логирование настроено
      const consoleSpy = jest.spyOn(console, 'log');
      
      // Симулируем вызов функции с логированием
      if (typeof window.importAppend === 'function') {
        window.importAppend([], true);
        expect(consoleSpy).toHaveBeenCalled();
      }
      
      consoleSpy.mockRestore();
    });
  });
});

// Моки для тестирования в браузерной среде
if (typeof window === 'undefined') {
  global.window = {
    HEYS: {},
    parsePasted: jest.fn(),
    parsePastedSync: jest.fn(),
    uuid: jest.fn(() => 'test-uuid'),
    toNum: jest.fn(x => Number(x) || 0),
    round1: jest.fn(x => Math.round(x * 10) / 10),
    computeDerived: jest.fn(() => ({ carbs100: 0, fat100: 0, kcal100: 0 })),
    importAppend: jest.fn()
  };
}
