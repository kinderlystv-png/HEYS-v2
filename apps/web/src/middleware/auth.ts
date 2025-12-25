import type { NextFunction, Request, Response } from 'express';

import { log } from '../lib/browser-logger';

// filepath: apps/web/src/middleware/auth.ts

/**
 * JWT Authentication Middleware for HEYS API
 * Интегрируется с существующей Supabase аутентификацией
 */

// Типы для безопасности
interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string | undefined;
  aud: string;
}

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Конфигурация JWT middleware
 */
export interface AuthMiddlewareConfig {
  requiredRole?: string | undefined;
  allowAnonymous?: boolean | undefined;
  skipPaths?: string[] | undefined;
  supabaseUrl?: string | undefined;
  supabaseAnonKey?: string | undefined;
}

// filepath: apps/web/src/middleware/auth.ts

/**
 * JWT Authentication Middleware for HEYS API
 * Интегрируется с существующей Supabase аутентификацией
 */

// Типы для безопасности
interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string | undefined;
  aud: string;
}

/**
 * Конфигурация JWT middleware
 */
export interface AuthMiddlewareConfig {
  requiredRole?: string | undefined;
  allowAnonymous?: boolean | undefined;
  skipPaths?: string[] | undefined;
  supabaseUrl?: string | undefined;
  supabaseAnonKey?: string | undefined;
}

/**
 * Результат аутентификации
 */
export interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  statusCode?: number;
}

/**
 * Основной класс JWT Auth Middleware
 */
export class JWTAuthMiddleware {
  private config: AuthMiddlewareConfig;

  constructor(config: AuthMiddlewareConfig = {}) {
    this.config = {
      allowAnonymous: false,
      skipPaths: ['/api/health', '/api/public', '/auth/login', '/auth/register'],
      ...config,
    };
  }

  /**
   * Проверить, нужно ли пропустить аутентификацию для данного пути
   */
  private shouldSkipAuth(path: string): boolean {
    return this.config.skipPaths?.some((skipPath) => path.startsWith(skipPath)) || false;
  }

  /**
   * Извлечь JWT токен из запроса
   */
  private extractToken(request: Request): string | null {
    // Проверяем Authorization header
    const authHeader = request.headers['authorization'];
    const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (authValue && authValue.startsWith('Bearer ')) {
      return authValue.substring(7);
    }

    // Проверяем cookie (fallback для браузерных запросов)
    const cookieHeader = request.headers['cookie'];
    const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    if (cookieValue) {
      const match = cookieValue.match(/supabase-auth-token=([^;]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Базовая валидация JWT токена (без Supabase клиента)
   */
  private async validateTokenBasic(token: string): Promise<AuthResult> {
    try {
      // Простая проверка структуры JWT токена
      const parts = token.split('.');
      if (parts.length !== 3) {
        return {
          success: false,
          error: 'Invalid token format',
          statusCode: 401,
        };
      }

      // Декодируем payload (base64)
      const payloadBase64 = parts[1];
      if (!payloadBase64) {
        return {
          success: false,
          error: 'Invalid token payload',
          statusCode: 401,
        };
      }

      const payload = JSON.parse(atob(payloadBase64));

      // Проверяем expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return {
          success: false,
          error: 'Token expired',
          statusCode: 401,
        };
      }

      // Проверка роли, если требуется
      if (this.config.requiredRole) {
        const userRole = payload.role || payload.user_metadata?.role;
        if (userRole !== this.config.requiredRole) {
          return {
            success: false,
            error: 'Insufficient permissions',
            statusCode: 403,
          };
        }
      }

      return {
        success: true,
        user: {
          id: payload.sub || payload.user_id || '',
          email: payload.email || '',
          role: payload.role || payload.user_metadata?.role,
          aud: payload.aud || 'authenticated',
        },
      };
    } catch (error) {
      log.error('JWT validation error', {
        error,
      });
      return {
        success: false,
        error: 'Token validation failed',
        statusCode: 401,
      };
    }
  }

  /**
   * Основной метод middleware для аутентификации
   */
  async authenticate(request: Request, pathname?: string): Promise<AuthResult> {
    const path = pathname || new URL(request.url).pathname;

    // Пропускаем аутентификацию для исключенных путей
    if (this.shouldSkipAuth(path)) {
      return { success: true };
    }

    // Извлекаем токен
    const token = this.extractToken(request);

    // Если токен отсутствует
    if (!token) {
      if (this.config.allowAnonymous) {
        return { success: true };
      }
      return {
        success: false,
        error: 'Authentication required',
        statusCode: 401,
      };
    }

    // Валидируем токен
    return await this.validateTokenBasic(token);
  }

  /**
   * Middleware function для Express/API routes
   */
  createExpressMiddleware() {
    return async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
      const authResult = await this.authenticate(req, req.path);

      if (!authResult.success) {
        res.status(authResult.statusCode || 401).json({
          error: authResult.error,
          message: 'Authentication failed',
        });
        return;
      }

      // Добавляем информацию о пользователе в request
      if (authResult.user) {
        req.user = authResult.user;
      }

      next();
    };
  }
}

/**
 * Создать базовый auth middleware с настройками по умолчанию
 */
export function createAuthMiddleware(config?: AuthMiddlewareConfig) {
  const authMiddleware = new JWTAuthMiddleware({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    ...config,
  });

  return authMiddleware.createExpressMiddleware();
}

/**
 * Хелпер для извлечения пользователя из запроса в API routes
 */
export function getUserFromRequest(request: RequestWithUser): AuthenticatedUser | null {
  const req = request;
  // Если пользователь уже добавлен middleware
  if (req.user) {
    return req.user;
  }

  // Fallback - извлекаем из headers (Express style)
  const getUserHeader = (name: string): string | undefined => {
    const value = req.headers?.[name];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const userId = getUserHeader('x-user-id');
  const userEmail = getUserHeader('x-user-email');
  const userRole = getUserHeader('x-user-role');

  if (!userId || !userEmail) {
    return null;
  }

  return {
    id: userId,
    email: userEmail,
    role: userRole || undefined,
    aud: 'authenticated',
  };
}

/**
 * Middleware для защиты API routes, требующих авторизации
 */
export const requireAuth = createAuthMiddleware({
  allowAnonymous: false,
  skipPaths: ['/api/health', '/api/public'],
});

/**
 * Middleware для админских API routes
 */
export const requireAdmin = createAuthMiddleware({
  requiredRole: 'admin',
  allowAnonymous: false,
  skipPaths: ['/api/health'],
});

/**
 * Middleware с поддержкой анонимных пользователей
 */
export const optionalAuth = createAuthMiddleware({
  allowAnonymous: true,
  skipPaths: ['/api/health', '/api/public'],
});

export default JWTAuthMiddleware;
