/**
 * Security Integration Tests for Core Package
 * Tests the security-enhanced core functionality
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SecureDayManager,
  SecureHeysCore,
  SecureSessionManager,
  SecureUserManager,
} from '../secure';

// Mock browser APIs
global.alert = vi.fn();
global.navigator = {
  ...global.navigator,
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 100,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
} as any;

describe('SecureUserManager', () => {
  let secureUserManager: SecureUserManager;

  beforeEach(() => {
    secureUserManager = new SecureUserManager();
  });

  it('should validate user data before creation', async () => {
    const validUserData = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
      email: 'test@example.com',
      username: 'testuser',
      password: 'SecurePassword123!',
      role: 'user' as const,
      isActive: true,
      createdAt: new Date(),
    };

    const result = await secureUserManager.createUser(validUserData);
    expect(result).toBeDefined();
    expect(result.id).toBe(validUserData.id);
  });

  it('should reject invalid user data', async () => {
    const invalidUserData = {
      email: 'invalid-email',
      username: '<script>alert("xss")</script>',
    };

    await expect(secureUserManager.createUser(invalidUserData)).rejects.toThrow(
      'User validation failed',
    );
  });

  it('should sanitize search queries', async () => {
    const validQuery = 'test search';

    // Should not throw and should work with valid query
    const result = await secureUserManager.searchUsers(validQuery);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('SecureDayManager', () => {
  let secureDayManager: SecureDayManager;

  beforeEach(() => {
    secureDayManager = new SecureDayManager();
  });

  it('should validate day data before creation', async () => {
    const validDayData = {
      id: '550e8400-e29b-41d4-a716-446655440001', // Valid UUID
      title: 'Test Day',
      content: 'This is test content',
      authorId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID for author
      date: new Date(),
      isPublic: false,
    };

    const result = await secureDayManager.createDay(validDayData);
    expect(result).toBeDefined();
  });

  it('should sanitize content when retrieving days', async () => {
    const dayId = 'day123';

    const result = await secureDayManager.getDayContent(dayId);
    expect(result).toBeDefined();
    expect(result.id).toBe(dayId);
  });
});

describe('SecureSessionManager', () => {
  let secureSessionManager: SecureSessionManager;

  beforeEach(() => {
    secureSessionManager = new SecureSessionManager();
  });

  it('should validate session data before creation', async () => {
    const validSessionData = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
      email: 'test@example.com',
      token: { authorization: 'Bearer valid-token-here' }, // Headers format
      expiresAt: new Date(Date.now() + 3600000),
    };

    const result = await secureSessionManager.createSession(validSessionData);
    expect(result).toBeDefined();
  });

  it('should validate session tokens', async () => {
    const validToken = 'this-is-a-valid-token-with-enough-length';
    const invalidToken = 'short';

    const validResult = await secureSessionManager.validateSessionToken(validToken);
    const invalidResult = await secureSessionManager.validateSessionToken(invalidToken);

    expect(validResult).toBe(true);
    expect(invalidResult).toBe(false);
  });
});

describe('SecureHeysCore', () => {
  let secureCore: SecureHeysCore;

  beforeEach(() => {
    secureCore = new SecureHeysCore();
  });

  it('should initialize with validated configuration', async () => {
    const config = {
      database: { host: 'localhost' },
      security: { enabled: true },
    };

    await expect(secureCore.initialize(config)).resolves.not.toThrow();
  });

  it('should handle secure API requests', async () => {
    const validRequest = {
      method: 'GET' as const,
      path: '/users',
      headers: { 'content-type': 'application/json' },
      query: { q: 'test' },
      body: null,
    };

    const result = await secureCore.handleApiRequest(validRequest);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should reject malformed API requests', async () => {
    const invalidRequest = {
      method: 'INVALID' as any,
      path: '/users',
    };

    await expect(secureCore.handleApiRequest(invalidRequest)).rejects.toThrow(
      'API request validation failed',
    );
  });

  it('should handle POST requests with validation', async () => {
    const postRequest = {
      method: 'POST' as const,
      path: '/users',
      headers: { 'content-type': 'application/json' },
      body: {
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        createdAt: new Date().toISOString(),
      },
    };

    const result = await secureCore.handleApiRequest(postRequest);
    expect(result).toBeDefined();
  });

  it('should require authorization for DELETE requests', async () => {
    const deleteRequest = {
      method: 'DELETE' as const,
      path: '/users/123',
      headers: {},
    };

    await expect(secureCore.handleApiRequest(deleteRequest)).rejects.toThrow(
      'API request validation failed',
    );
  });
});
