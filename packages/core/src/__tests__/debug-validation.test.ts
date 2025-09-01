import { describe, it, expect } from 'vitest';
import { defaultValidator, ValidationSchemas } from '@heys/shared';

describe('Debug Validation', () => {
  it('should validate user schema directly', async () => {
    const testUserData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com', 
      username: 'testuser',
      password: 'SecurePassword123!',
      role: 'user' as const,
      isActive: true,
      createdAt: new Date(),
    };

    const validation = await defaultValidator.validateSchema(
      testUserData, 
      ValidationSchemas.user,
      { sanitize: true, strictMode: false }
    );

    console.log('Validation result:', validation);
    console.log('User data:', testUserData);
    console.log('Schema:', ValidationSchemas.user._def);

    expect(validation.isValid).toBe(true);
  });
});
