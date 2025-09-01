import { describe, expect, it } from 'vitest';
import { ExerciseSchema, TrainingProgramSchema, WorkoutSessionSchema } from '../models/training.js';

describe('Training Models', () => {
  describe('ExerciseSchema validation', () => {
    it('should validate a complete exercise', () => {
      const exercise = {
        id: 'exercise-1',
        name: 'Отжимания',
        category: 'strength' as const,
        muscleGroups: ['грудь', 'трицепс'],
        equipment: 'нет',
        instructions: 'Лежа на полу, отжимайтесь',
        difficulty: 'beginner' as const,
      };

      const result = ExerciseSchema.parse(exercise);
      expect(result.name).toBe('Отжимания');
      expect(result.category).toBe('strength');
      expect(result.muscleGroups).toContain('грудь');
    });

    it('should reject invalid difficulty', () => {
      const exercise = {
        id: 'exercise-1',
        name: 'Отжимания',
        category: 'strength' as const,
        muscleGroups: ['грудь'],
        difficulty: 'impossible' as any, // невалидная сложность
      };

      expect(() => ExerciseSchema.parse(exercise)).toThrow();
    });
  });

  describe('WorkoutSessionSchema validation', () => {
    it('should validate a workout session', () => {
      const session = {
        id: 'session-1',
        userId: 'user-123',
        name: 'Утренняя тренировка',
        date: new Date(),
        sets: [
          {
            exerciseId: 'exercise-1',
            reps: 10,
            weight: 50,
            rest: 60,
          },
        ],
        notes: 'Хорошая тренировка',
        duration: 3600, // 1 час
        createdAt: new Date(),
      };

      const result = WorkoutSessionSchema.parse(session);
      expect(result.name).toBe('Утренняя тренировка');
      expect(result.sets).toHaveLength(1);
      expect(result.sets[0]?.reps).toBe(10);
    });
  });

  describe('TrainingProgramSchema validation', () => {
    it('should validate a training program', () => {
      const program = {
        id: 'program-1',
        name: 'Программа для начинающих',
        description: 'Базовая программа тренировок',
        duration: 8, // 8 недель
        sessions: [
          {
            name: 'День 1',
            exercises: [
              {
                exerciseId: 'exercise-1',
                sets: 3,
                reps: '8-12',
                weight: 'собственный вес',
              },
            ],
          },
        ],
        level: 'beginner' as const,
        createdAt: new Date(),
      };

      const result = TrainingProgramSchema.parse(program);
      expect(result.name).toBe('Программа для начинающих');
      expect(result.duration).toBe(8);
      expect(result.sessions).toHaveLength(1);
    });

    it('should reject invalid level', () => {
      const program = {
        id: 'program-1',
        name: 'Программа',
        description: 'Описание',
        duration: 4,
        sessions: [],
        level: 'professional' as any, // невалидный уровень
        createdAt: new Date(),
      };

      expect(() => TrainingProgramSchema.parse(program)).toThrow();
    });
  });
});
