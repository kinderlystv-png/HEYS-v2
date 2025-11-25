// filepath: apps/web/src/middleware/__tests__/auth.test.ts

import { beforeEach, describe, expect, it } from 'vitest';

import {
  AuthMiddlewareConfig,
  createAuthMiddleware,
  getUserFromRequest,
  JWTAuthMiddleware,
} from '../auth';

describe('JWTAuthMiddleware', () => {
  let middleware: JWTAuthMiddleware;
  let config: AuthMiddlewareConfig;

  beforeEach(() => {
    config = {
      allowAnonymous: false,
      skipPaths: ['/api/health', '/api/public'],
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    };
    middleware = new JWTAuthMiddleware(config);
  });

  describe('Authentication', () => {
    it('should skip authentication for excluded paths', async () => {
      const request = new Request('https://test.com/api/health', {
        method: 'GET',
      });

      const result = await middleware.authenticate(request, '/api/health');
      expect(result.success).toBe(true);
    });

    it('should require authentication for protected paths', async () => {
      const request = new Request('https://test.com/api/users', {
        method: 'GET',
      });

      const result = await middleware.authenticate(request, '/api/users');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required');
      expect(result.statusCode).toBe(401);
    });

    it('should allow anonymous access when configured', async () => {
      const anonymousMiddleware = new JWTAuthMiddleware({
        allowAnonymous: true,
      });

      const request = new Request('https://test.com/api/users', {
        method: 'GET',
      });

      const result = await anonymousMiddleware.authenticate(request, '/api/users');
      expect(result.success).toBe(true);
    });

    it('should extract token from Authorization header', async () => {
      // Создаем валидный JWT токен для тестов
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };

      // Простая base64 кодировка для тестов
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(mockPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const request = new Request('https://test.com/api/users', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await middleware.authenticate(request, '/api/users');
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-123');
      expect(result.user?.email).toBe('test@example.com');
    });

    it('should reject expired tokens', async () => {
      // Создаем просроченный токен
      const expiredPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(expiredPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const request = new Request('https://test.com/api/users', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await middleware.authenticate(request, '/api/users');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
      expect(result.statusCode).toBe(401);
    });

    it('should reject malformed tokens', async () => {
      const request = new Request('https://test.com/api/users', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      const result = await middleware.authenticate(request, '/api/users');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token format');
      expect(result.statusCode).toBe(401);
    });

    it('should check required role', async () => {
      const roleMiddleware = new JWTAuthMiddleware({
        requiredRole: 'admin',
      });

      // Создаем токен с ролью пользователя
      const userPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'user',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(userPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const request = new Request('https://test.com/api/admin', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await roleMiddleware.authenticate(request, '/api/admin');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions');
      expect(result.statusCode).toBe(403);
    });

    it('should allow access with correct role', async () => {
      const roleMiddleware = new JWTAuthMiddleware({
        requiredRole: 'admin',
      });

      // Создаем токен с ролью админа
      const adminPayload = {
        sub: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(adminPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const request = new Request('https://test.com/api/admin', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await roleMiddleware.authenticate(request, '/api/admin');
      expect(result.success).toBe(true);
      expect(result.user?.role).toBe('admin');
    });
  });

  describe('Express Middleware', () => {
    it('should create express middleware function', () => {
      const expressMiddleware = middleware.createExpressMiddleware();
      expect(typeof expressMiddleware).toBe('function');
    });

    it('should add user to request object', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(mockPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const mockReq = {
        path: '/api/users',
        headers: {
          get: (name: string) => (name === 'authorization' ? `Bearer ${token}` : null),
        },
        url: 'https://test.com/api/users',
      };

      const mockRes = {
        status: (code: number) => ({
          json: (data: any) => ({ status: code, data }),
        }),
      };

      const mockNext = () => {};

      const expressMiddleware = middleware.createExpressMiddleware();
      await expressMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq).toHaveProperty('user');
      expect((mockReq as any).user.id).toBe('user-123');
    });
  });

  describe('Factory Functions', () => {
    it('should create auth middleware with default config', () => {
      const authMiddleware = createAuthMiddleware();
      expect(typeof authMiddleware).toBe('function');
    });

    it('should create auth middleware with custom config', () => {
      const customMiddleware = createAuthMiddleware({
        allowAnonymous: true,
        requiredRole: 'user',
      });
      expect(typeof customMiddleware).toBe('function');
    });
  });

  describe('Cookie Token Extraction', () => {
    it('should extract token from cookie header', async () => {
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify(mockPayload));
      const signature = 'mock-signature';
      const token = `${header}.${payload}.${signature}`;

      const request = new Request('https://test.com/api/users', {
        method: 'GET',
        headers: {
          Cookie: `supabase-auth-token=${token}; other-cookie=value`,
        },
      });

      const result = await middleware.authenticate(request, '/api/users');
      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-123');
    });
  });
});

// Тесты для утилитарных функций
describe('Utility Functions', () => {
  it('should extract user from request with user property', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      aud: 'authenticated',
    };

    const mockRequest = {
      user: mockUser,
    };

    const result = getUserFromRequest(mockRequest);
    expect(result).toEqual(mockUser);
  });

  it('should return null when no user data in request', () => {
    const mockRequest = {};

    const result = getUserFromRequest(mockRequest);
    expect(result).toBeNull();
  });
});
