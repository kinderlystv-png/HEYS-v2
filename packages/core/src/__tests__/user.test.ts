import { describe, it, expect } from 'vitest';
import { createUser, UserSchema, UserDraft } from '../models/user.js';

describe('User Model', () => {
  describe('UserSchema validation', () => {
    it('should validate a complete user object', () => {
      const validUser = {
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        profile: {
          age: 25,
          gender: 'male' as const,
          weight: 70,
          height: 175,
          activityLevel: 'moderate' as const,
        },
        preferences: {
          units: 'metric' as const,
          language: 'en' as const,
          theme: 'dark' as const,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = UserSchema.parse(validUser);
      expect(result).toEqual(validUser);
    });

    it('should validate minimal user object', () => {
      const minimalUser = {
        id: 'test-id',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = UserSchema.parse(minimalUser);
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
    });

    it('should reject invalid email', () => {
      const invalidUser = {
        id: 'test-id',
        email: 'invalid-email',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => UserSchema.parse(invalidUser)).toThrow();
    });

    it('should reject missing required fields', () => {
      const incompleteUser = {
        id: 'test-id',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => UserSchema.parse(incompleteUser)).toThrow();
    });
  });

  describe('createUser function', () => {
    it('should create user with minimal data', () => {
      const draft: UserDraft = {
        email: 'test@example.com',
        name: 'Test User',
      };

      const user = createUser(draft);

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.preferences.units).toBe('metric');
      expect(user.preferences.language).toBe('en');
      expect(user.preferences.theme).toBe('auto');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create user with complete profile', () => {
      const draft: UserDraft = {
        email: 'test@example.com',
        name: 'Test User',
        profile: {
          age: 30,
          gender: 'female',
          weight: 60,
          height: 165,
          activityLevel: 'active',
        },
        preferences: {
          units: 'imperial',
          language: 'ru',
          theme: 'dark',
        },
      };

      const user = createUser(draft);

      expect(user.profile?.age).toBe(30);
      expect(user.profile?.gender).toBe('female');
      expect(user.preferences.units).toBe('imperial');
      expect(user.preferences.language).toBe('ru');
    });

    it('should generate unique IDs', () => {
      const draft: UserDraft = {
        email: 'test@example.com',
        name: 'Test User',
      };

      const user1 = createUser(draft);
      const user2 = createUser(draft);

      expect(user1.id).not.toBe(user2.id);
    });
  });
});
