// User Model - Migrated from legacy heys_user_v12.ts
import { z } from 'zod';

// User Schema
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  profile: z
    .object({
      age: z.number().optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      weight: z.number().optional(),
      height: z.number().optional(),
      activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very-active']).optional(),
    })
    .optional(),
  preferences: z
    .object({
      units: z.enum(['metric', 'imperial']).default('metric'),
      language: z.enum(['en', 'ru']).default('en'),
      theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    })
    .default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// User Draft for forms
export const UserDraftSchema = UserSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UserDraft = z.infer<typeof UserDraftSchema>;

// User utilities
export const createUser = (draft: UserDraft): User => {
  const now = new Date();
  if (!draft.email || !draft.name) {
    throw new Error('User draft must include email and name');
  }
  return {
    id: crypto.randomUUID(),
    email: draft.email,
    name: draft.name,
    profile: draft.profile,
    preferences: draft.preferences || {
      units: 'metric',
      language: 'en',
      theme: 'auto',
    },
    createdAt: now,
    updatedAt: now,
  };
};
