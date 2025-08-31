import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, generateId } from '../index.js';

describe('Shared Utilities', () => {
  describe('formatDate', () => {
    it('should format date to ISO string without time', () => {
      const date = new Date('2025-08-31T14:30:00.000Z');
      const result = formatDate(date);
      
      expect(result).toBe('2025-08-31');
      expect(typeof result).toBe('string');
    });

    it('should handle different dates correctly', () => {
      const testCases = [
        { input: new Date('2023-01-01T00:00:00.000Z'), expected: '2023-01-01' },
        { input: new Date('2023-12-31T23:59:59.999Z'), expected: '2023-12-31' },
        { input: new Date('2024-02-29T12:00:00.000Z'), expected: '2024-02-29' }, // leap year
        { input: new Date('2025-08-15T08:45:30.123Z'), expected: '2025-08-15' },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(formatDate(input)).toBe(expected);
      });
    });

    it('should handle current date', () => {
      const now = new Date();
      const result = formatDate(now);
      
      // Проверяем формат YYYY-MM-DD
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Проверяем что это сегодняшняя дата
      const expectedDate = now.toISOString().split('T')[0];
      expect(result).toBe(expectedDate);
    });

    it('should handle edge cases', () => {
      // Минимальная дата JavaScript
      const minDate = new Date('1970-01-01T00:00:00.000Z');
      expect(formatDate(minDate)).toBe('1970-01-01');
      
      // Дата в далеком будущем
      const futureDate = new Date('2099-12-31T23:59:59.999Z');
      expect(formatDate(futureDate)).toBe('2099-12-31');
    });

    it('should be consistent with timezone differences', () => {
      // Одна и та же дата в разных временных зонах должна давать один результат
      const date1 = new Date('2025-08-31T00:00:00.000Z'); // UTC midnight
      const date2 = new Date('2025-08-31T23:59:59.999Z'); // UTC end of day
      
      expect(formatDate(date1)).toBe('2025-08-31');
      expect(formatDate(date2)).toBe('2025-08-31');
    });
  });

  describe('generateId', () => {
    beforeEach(() => {
      // Mock crypto.randomUUID если он не доступен
      if (!global.crypto?.randomUUID) {
        const mockUUID = vi.fn(() => '12345678-1234-4567-8901-123456789012');
        global.crypto = {
          ...global.crypto,
          randomUUID: mockUUID,
        } as any;
      }
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should generate a valid UUID', () => {
      const id = generateId();
      
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      const count = 100;
      
      // Генерируем много ID и проверяем уникальность
      for (let i = 0; i < count; i++) {
        const id = generateId();
        expect(ids.has(id)).toBe(false); // Не должно быть дубликатов
        ids.add(id);
      }
      
      expect(ids.size).toBe(count);
    });

    it('should generate IDs of correct length', () => {
      const id = generateId();
      
      // UUID формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id.length).toBe(36);
      
      // Проверяем позиции дефисов
      expect(id[8]).toBe('-');
      expect(id[13]).toBe('-');
      expect(id[18]).toBe('-');
      expect(id[23]).toBe('-');
    });

    it('should handle multiple calls consistently', () => {
      const id1 = generateId();
      const id2 = generateId();
      const id3 = generateId();
      
      // Все должны быть строками правильного формата
      [id1, id2, id3].forEach(id => {
        expect(typeof id).toBe('string');
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      });
      
      // Все должны быть уникальными
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should work with mocked crypto', () => {
      // Мокаем только randomUUID метод
      const originalRandomUUID = global.crypto?.randomUUID;
      const mockUUID = vi.fn(() => 'mocked-uuid-1234-5678-9012-123456789012' as `${string}-${string}-${string}-${string}-${string}`);
      
      if (global.crypto) {
        (global.crypto as any).randomUUID = mockUUID;
      }
      
      const id = generateId();
      
      expect(mockUUID).toHaveBeenCalledTimes(1);
      expect(id).toBe('mocked-uuid-1234-5678-9012-123456789012');
      
      // Восстанавливаем оригинальный метод
      if (global.crypto && originalRandomUUID) {
        (global.crypto as any).randomUUID = originalRandomUUID;
      }
    });
  });

  describe('Integration tests', () => {
    it('should work together for creating timestamped records', () => {
      const now = new Date();
      const record = {
        id: generateId(),
        date: formatDate(now),
        name: 'Test Record',
      };
      
      expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.name).toBe('Test Record');
      
      // Проверяем что дата сегодняшняя
      const expectedDate = now.toISOString().split('T')[0];
      expect(record.date).toBe(expectedDate);
    });

    it('should handle batch operations', () => {
      const dates = [
        new Date('2025-01-01'),
        new Date('2025-06-15'),
        new Date('2025-12-31'),
      ];
      
      const records = dates.map(date => ({
        id: generateId(),
        date: formatDate(date),
      }));
      
      // Все ID уникальны
      const ids = records.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      
      // Все даты правильно отформатированы
      expect(records[0]?.date).toBe('2025-01-01');
      expect(records[1]?.date).toBe('2025-06-15');
      expect(records[2]?.date).toBe('2025-12-31');
    });
  });
});
