import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { trackEvent } from '../index.js';

describe('Analytics', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('trackEvent', () => {
    it('should track event with name only', () => {
      trackEvent('user_login');

      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'user_login', undefined);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should track event with name and data', () => {
      const eventData = { userId: '123', timestamp: Date.now() };
      trackEvent('user_action', eventData);

      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'user_action', eventData);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle different event names', () => {
      const events = ['page_view', 'button_click', 'form_submit', 'api_call', 'error_occurred'];

      events.forEach((eventName) => {
        trackEvent(eventName);
        expect(consoleSpy).toHaveBeenCalledWith('Track:', eventName, undefined);
      });

      expect(consoleSpy).toHaveBeenCalledTimes(events.length);
    });

    it('should handle different data types', () => {
      const testCases = [
        { event: 'string_data', data: 'test string' },
        { event: 'number_data', data: 42 },
        { event: 'boolean_data', data: true },
        { event: 'object_data', data: { key: 'value', count: 5 } },
        { event: 'array_data', data: [1, 2, 3, 'test'] },
        { event: 'null_data', data: null },
        { event: 'undefined_data', data: undefined },
      ];

      testCases.forEach(({ event, data }) => {
        trackEvent(event, data);
        expect(consoleSpy).toHaveBeenCalledWith('Track:', event, data);
      });

      expect(consoleSpy).toHaveBeenCalledTimes(testCases.length);
    });

    it('should handle empty string event', () => {
      trackEvent('');

      expect(consoleSpy).toHaveBeenCalledWith('Track:', '', undefined);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle complex nested data', () => {
      const complexData = {
        user: {
          id: '123',
          profile: {
            name: 'John Doe',
            preferences: ['fitness', 'nutrition'],
          },
        },
        session: {
          startTime: new Date(),
          actions: [
            { type: 'click', target: 'button' },
            { type: 'scroll', position: 500 },
          ],
        },
        metadata: {
          version: '1.0.0',
          browser: 'chrome',
        },
      };

      trackEvent('complex_interaction', complexData);

      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'complex_interaction', complexData);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle special characters in event names', () => {
      const specialEvents = [
        'event-with-dashes',
        'event_with_underscores',
        'event.with.dots',
        'event:with:colons',
        'event with spaces',
        'event#with#hashes',
        'event@with@symbols',
      ];

      specialEvents.forEach((eventName) => {
        trackEvent(eventName);
        expect(consoleSpy).toHaveBeenCalledWith('Track:', eventName, undefined);
      });

      expect(consoleSpy).toHaveBeenCalledTimes(specialEvents.length);
    });

    it('should handle unicode characters', () => {
      const unicodeEvents = ['событие', '事件', 'événement', 'حدث', '🎉 celebration'];

      unicodeEvents.forEach((eventName) => {
        trackEvent(eventName);
        expect(consoleSpy).toHaveBeenCalledWith('Track:', eventName, undefined);
      });

      expect(consoleSpy).toHaveBeenCalledTimes(unicodeEvents.length);
    });

    it('should not throw errors with any input', () => {
      expect(() => trackEvent('normal_event')).not.toThrow();
      expect(() => trackEvent('', null)).not.toThrow();
      expect(() => trackEvent('event', { circular: {} })).not.toThrow();

      // Создаем циклическую ссылку
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      expect(() => trackEvent('circular', circularObj)).not.toThrow();
    });
  });

  describe('Return value', () => {
    it('should return undefined', () => {
      const result = trackEvent('test_event');
      expect(result).toBeUndefined();
    });

    it('should consistently return undefined', () => {
      const results = [
        trackEvent('event1'),
        trackEvent('event2', { data: 'test' }),
        trackEvent('event3', null),
      ];

      results.forEach((result) => {
        expect(result).toBeUndefined();
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle rapid consecutive calls', () => {
      for (let i = 0; i < 100; i++) {
        trackEvent(`rapid_event_${i}`, { index: i });
      }

      expect(consoleSpy).toHaveBeenCalledTimes(100);

      // Проверяем первый и последний вызовы
      expect(consoleSpy).toHaveBeenNthCalledWith(1, 'Track:', 'rapid_event_0', { index: 0 });
      expect(consoleSpy).toHaveBeenNthCalledWith(100, 'Track:', 'rapid_event_99', { index: 99 });
    });

    it('should work with real-world analytics scenarios', () => {
      // User journey simulation
      trackEvent('app_opened');
      trackEvent('page_viewed', { page: 'dashboard' });
      trackEvent('button_clicked', { button: 'add_meal' });
      trackEvent('form_filled', { form: 'meal_entry', fields: 5 });
      trackEvent('data_saved', { type: 'meal', id: '123' });
      trackEvent('notification_sent', { type: 'success', message: 'Meal saved' });

      expect(consoleSpy).toHaveBeenCalledTimes(6);
      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'app_opened', undefined);
      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'data_saved', { type: 'meal', id: '123' });
    });

    it('should handle error tracking scenarios', () => {
      const errorData = {
        error: new Error('Test error'),
        stack: 'Error stack trace',
        url: 'https://example.com/page',
        userAgent: 'Mozilla/5.0...',
        timestamp: new Date().toISOString(),
      };

      trackEvent('error_occurred', errorData);

      expect(consoleSpy).toHaveBeenCalledWith('Track:', 'error_occurred', errorData);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });
});
