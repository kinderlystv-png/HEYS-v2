import { describe, expect, it } from 'vitest';
import { createAchievement } from '../index.js';

describe('Gaming System', () => {
  describe('createAchievement', () => {
    it('should create an achievement with name and unlocked status', () => {
      const achievement = createAchievement('First Steps');

      expect(achievement).toEqual({
        name: 'First Steps',
        unlocked: false,
      });
    });

    it('should handle different achievement names', () => {
      const testCases = [
        'Beginner',
        'Expert Level',
        'Master Chef',
        'Fitness Guru',
        '30-Day Streak',
        'Healthy Eating Champion',
      ];

      testCases.forEach((name) => {
        const achievement = createAchievement(name);

        expect(achievement.name).toBe(name);
        expect(achievement.unlocked).toBe(false);
        expect(typeof achievement.name).toBe('string');
        expect(typeof achievement.unlocked).toBe('boolean');
      });
    });

    it('should handle empty string name', () => {
      const achievement = createAchievement('');

      expect(achievement.name).toBe('');
      expect(achievement.unlocked).toBe(false);
    });

    it('should handle special characters in name', () => {
      const specialNames = [
        'Achievement #1',
        'Level Up! 🎉',
        'Nutrition Expert (Advanced)',
        'Goal: 10,000 steps',
        'Weight Loss - 5kg',
        'Protein Intake > 100g',
      ];

      specialNames.forEach((name) => {
        const achievement = createAchievement(name);

        expect(achievement.name).toBe(name);
        expect(achievement.unlocked).toBe(false);
      });
    });

    it('should handle very long achievement names', () => {
      const longName =
        'This is a very long achievement name that might be used for complex goals or detailed descriptions of what the user has accomplished in their fitness and nutrition journey';
      const achievement = createAchievement(longName);

      expect(achievement.name).toBe(longName);
      expect(achievement.unlocked).toBe(false);
    });

    it('should create unique objects for each call', () => {
      const achievement1 = createAchievement('Test Achievement');
      const achievement2 = createAchievement('Test Achievement');

      // Должны иметь одинаковые значения
      expect(achievement1).toEqual(achievement2);

      // Но быть разными объектами
      expect(achievement1).not.toBe(achievement2);

      // Изменение одного не должно влиять на другой
      achievement1.unlocked = true;
      expect(achievement2.unlocked).toBe(false);
    });

    it('should return immutable-like structure', () => {
      const achievement = createAchievement('Test Achievement');

      // Проверяем что объект содержит только ожидаемые свойства
      const keys = Object.keys(achievement);
      expect(keys).toEqual(['name', 'unlocked']);
      expect(keys).toHaveLength(2);
    });

    it('should handle unicode characters', () => {
      const unicodeNames = ['Достижение', '成就', 'Értelme', '🏆 Champion', "Médaille d'or"];

      unicodeNames.forEach((name) => {
        const achievement = createAchievement(name);

        expect(achievement.name).toBe(name);
        expect(achievement.unlocked).toBe(false);
      });
    });
  });

  describe('Achievement object properties', () => {
    it('should have correct property types', () => {
      const achievement = createAchievement('Type Test');

      expect(typeof achievement.name).toBe('string');
      expect(typeof achievement.unlocked).toBe('boolean');
      expect(achievement.unlocked).toBe(false);
    });

    it('should be modifiable after creation', () => {
      const achievement = createAchievement('Modifiable Test');

      // Изначально заблокировано
      expect(achievement.unlocked).toBe(false);

      // Можем изменить
      achievement.unlocked = true;
      expect(achievement.unlocked).toBe(true);

      // Можем изменить обратно
      achievement.unlocked = false;
      expect(achievement.unlocked).toBe(false);
    });

    it('should allow name modification', () => {
      const achievement = createAchievement('Original Name');

      expect(achievement.name).toBe('Original Name');

      // Можем изменить имя
      achievement.name = 'New Name';
      expect(achievement.name).toBe('New Name');
    });
  });

  describe('Integration scenarios', () => {
    it('should work for creating multiple achievements', () => {
      const achievements = [
        'First Login',
        'Complete Profile',
        'Log First Meal',
        'Reach Daily Calorie Goal',
        'Exercise for 30 minutes',
      ].map((name) => createAchievement(name));

      expect(achievements).toHaveLength(5);

      // Все должны быть заблокированы изначально
      achievements.forEach((achievement) => {
        expect(achievement.unlocked).toBe(false);
      });

      // Имитируем разблокировку
      achievements[0]!.unlocked = true; // Первый логин
      achievements[2]!.unlocked = true; // Логирование первого приема пищи

      expect(achievements[0]?.unlocked).toBe(true);
      expect(achievements[1]?.unlocked).toBe(false);
      expect(achievements[2]?.unlocked).toBe(true);
      expect(achievements[3]?.unlocked).toBe(false);
      expect(achievements[4]?.unlocked).toBe(false);
    });

    it('should work with filtering and mapping', () => {
      const allAchievements = [
        createAchievement('Daily Login'),
        createAchievement('Weekly Goal'),
        createAchievement('Monthly Challenge'),
      ];

      // Разблокируем некоторые
      allAchievements[0]!.unlocked = true;
      allAchievements[1]!.unlocked = true;

      // Фильтрация разблокированных
      const unlockedAchievements = allAchievements.filter((a) => a.unlocked);
      expect(unlockedAchievements).toHaveLength(2);
      expect(unlockedAchievements.map((a) => a.name)).toEqual(['Daily Login', 'Weekly Goal']);

      // Фильтрация заблокированных
      const lockedAchievements = allAchievements.filter((a) => !a.unlocked);
      expect(lockedAchievements).toHaveLength(1);
      expect(lockedAchievements[0]?.name).toBe('Monthly Challenge');
    });
  });
});
