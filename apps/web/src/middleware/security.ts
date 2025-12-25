// filepath: apps/web/src/middleware/security.ts

import type { NextFunction, Request, Response } from 'express';

/**
 * Security Headers Middleware для HEYS
 * Базовая защита от XSS, CSRF и других атак
 */

/**
 * Конфигурация security headers
 */
export interface SecurityConfig {
  // Content Security Policy
  contentSecurityPolicy?: {
    enabled: boolean;
    directives?: Record<string, string[]>;
  };

  // HSTS (HTTP Strict Transport Security)
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };

  // Другие security headers
  noSniff?: boolean;
  frameguard?: 'deny' | 'sameorigin' | false;
  xssFilter?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
}

/**
 * Дефолтная конфигурация безопасности
 */
const DEFAULT_CONFIG: SecurityConfig = {
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:', 'blob:'],
      'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    },
  },
  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: 'deny',
  xssFilter: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: ['()'],
    microphone: ['()'],
    geolocation: ['()'],
    'interest-cohort': ['()'], // Блокировка FLoC
  },
};

/**
 * Основной класс Security Middleware
 */
export class SecurityMiddleware {
  private config: SecurityConfig;

  constructor(config: SecurityConfig = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * Создать middleware для Express/Next.js
   */
  createMiddleware() {
    return (_req: Request, res: Response, next: NextFunction) => {
      this.applySecurityHeaders(res);
      next();
    };
  }

  /**
   * Применить security headers к response
   */
  private applySecurityHeaders(res: Response): void {
    // Content Security Policy
    if (this.config.contentSecurityPolicy?.enabled) {
      const csp = this.buildCSP(this.config.contentSecurityPolicy.directives || {});
      res.setHeader('Content-Security-Policy', csp);
    }

    // HTTP Strict Transport Security
    if (this.config.hsts?.enabled) {
      const hstsValue = this.buildHSTS(this.config.hsts);
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // X-Content-Type-Options
    if (this.config.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (this.config.frameguard) {
      res.setHeader('X-Frame-Options', this.config.frameguard.toUpperCase());
    }

    // X-XSS-Protection
    if (this.config.xssFilter) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Referrer-Policy
    if (this.config.referrerPolicy) {
      res.setHeader('Referrer-Policy', this.config.referrerPolicy);
    }

    // Permissions-Policy
    if (this.config.permissionsPolicy) {
      const permissionsPolicy = this.buildPermissionsPolicy(this.config.permissionsPolicy);
      res.setHeader('Permissions-Policy', permissionsPolicy);
    }

    // Дополнительные security headers
    res.setHeader('X-Powered-By', 'HEYS'); // Скрываем технологию
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  }

  /**
   * Построить CSP директиву
   */
  private buildCSP(directives: Record<string, string[]>): string {
    return Object.entries(directives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');
  }

  /**
   * Построить HSTS заголовок
   */
  private buildHSTS(hsts: NonNullable<SecurityConfig['hsts']>): string {
    let value = `max-age=${hsts.maxAge || 31536000}`;

    if (hsts.includeSubDomains) {
      value += '; includeSubDomains';
    }

    if (hsts.preload) {
      value += '; preload';
    }

    return value;
  }

  /**
   * Построить Permissions-Policy заголовок
   */
  private buildPermissionsPolicy(permissions: Record<string, string[]>): string {
    return Object.entries(permissions)
      .map(([directive, allowlist]) => `${directive}=(${allowlist.join(' ')})`)
      .join(', ');
  }

  /**
   * Объединить конфигурации
   */
  private mergeConfig(defaultConfig: SecurityConfig, userConfig: SecurityConfig): SecurityConfig {
    const merged = { ...defaultConfig, ...userConfig };

    // Специальная обработка для CSP директив
    if (
      defaultConfig.contentSecurityPolicy?.directives &&
      userConfig.contentSecurityPolicy?.directives
    ) {
      merged.contentSecurityPolicy = {
        ...defaultConfig.contentSecurityPolicy,
        ...userConfig.contentSecurityPolicy,
        directives: {
          ...defaultConfig.contentSecurityPolicy.directives,
          ...userConfig.contentSecurityPolicy.directives,
        },
      };
    }

    return merged;
  }
}

/**
 * CORS конфигурация для HEYS
 */
export interface CORSConfig {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * CORS Middleware
 */
export class CORSMiddleware {
  private config: CORSConfig;

  constructor(config: CORSConfig = {}) {
    this.config = {
      origin:
        process.env.NODE_ENV === 'production'
          ? [process.env.NEXT_PUBLIC_APP_URL || 'https://heys.app']
          : true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-API-Key',
      ],
      credentials: true,
      optionsSuccessStatus: 204,
      ...config,
    };
  }

  /**
   * Создать CORS middleware
   */
  createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;

      // Проверка origin
      if (this.isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      }

      // Остальные CORS headers
      res.setHeader('Access-Control-Allow-Methods', this.config.methods?.join(', ') || '*');
      res.setHeader('Access-Control-Allow-Headers', this.config.allowedHeaders?.join(', ') || '*');

      if (this.config.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.status(this.config.optionsSuccessStatus || 204).end();
        return;
      }

      next();
    };
  }

  /**
   * Проверить разрешен ли origin
   */
  private isOriginAllowed(origin: string): boolean {
    if (!this.config.origin) return false;
    if (this.config.origin === true) return true;
    if (typeof this.config.origin === 'string') return this.config.origin === origin;
    if (Array.isArray(this.config.origin)) return this.config.origin.includes(origin);
    return false;
  }
}

/**
 * Фабричные функции для создания middleware
 */

/**
 * Создать базовый security middleware
 */
export function createSecurityMiddleware(config?: SecurityConfig) {
  const security = new SecurityMiddleware(config);
  return security.createMiddleware();
}

/**
 * Создать CORS middleware
 */
export function createCORSMiddleware(config?: CORSConfig) {
  const cors = new CORSMiddleware(config);
  return cors.createMiddleware();
}

/**
 * Создать комбинированный security + CORS middleware
 */
export function createSecurityStack(securityConfig?: SecurityConfig, corsConfig?: CORSConfig) {
  const securityMiddleware = createSecurityMiddleware(securityConfig);
  const corsMiddleware = createCORSMiddleware(corsConfig);

  return (req: Request, res: Response, next: NextFunction) => {
    corsMiddleware(req, res, () => {
      securityMiddleware(req, res, next);
    });
  };
}

/**
 * Предустановленные конфигурации
 */

/**
 * Строгая security конфигурация для продакшена
 */
export const STRICT_SECURITY_CONFIG: SecurityConfig = {
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https://*.supabase.co'],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
    },
  },
  hsts: {
    enabled: true,
    maxAge: 63072000, // 2 года
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: 'deny',
  xssFilter: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
};

/**
 * Развернутая security конфигурация для разработки
 */
export const DEVELOPMENT_SECURITY_CONFIG: SecurityConfig = {
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:', 'http:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https:', 'http:'],
      'img-src': ["'self'", 'data:', 'https:', 'http:'],
      'connect-src': ["'self'", '*'],
    },
  },
  hsts: {
    enabled: false, // Обычно не нужен в development
  },
  noSniff: true,
  frameguard: 'sameorigin',
  xssFilter: true,
  referrerPolicy: 'no-referrer-when-downgrade',
};

/**
 * Экспорт готовых middleware
 */
export const basicSecurity = createSecurityMiddleware();
export const strictSecurity = createSecurityMiddleware(STRICT_SECURITY_CONFIG);
export const developmentSecurity = createSecurityMiddleware(DEVELOPMENT_SECURITY_CONFIG);
export const basicCORS = createCORSMiddleware();

export default SecurityMiddleware;
