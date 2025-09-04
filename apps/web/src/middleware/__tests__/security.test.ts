// filepath: apps/web/src/middleware/__tests__/security.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityMiddleware,
  CORSMiddleware,
  createSecurityMiddleware,
  createCORSMiddleware,
  createSecurityStack,
  STRICT_SECURITY_CONFIG,
  DEVELOPMENT_SECURITY_CONFIG,
  basicSecurity,
  strictSecurity,
  developmentSecurity,
  basicCORS
} from '../security';
import type { SecurityConfig, CORSConfig } from '../security';

describe('SecurityMiddleware', () => {
  let mockRes: any;
  let mockReq: any;
  let mockNext: any;

  beforeEach(() => {
    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn()
    };
    mockReq = {
      method: 'GET',
      headers: {
        origin: 'https://heys.app'
      }
    };
    mockNext = vi.fn();
  });

  describe('Security Headers', () => {
    it('должен применять базовые security headers', () => {
      const middleware = createSecurityMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Powered-By', 'HEYS');
      expect(mockNext).toHaveBeenCalled();
    });

    it('должен применять Content Security Policy', () => {
      const config: SecurityConfig = {
        contentSecurityPolicy: {
          enabled: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"]
          }
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("script-src 'self' 'unsafe-inline'")
      );
    });

    it('должен применять HSTS заголовки', () => {
      const config: SecurityConfig = {
        hsts: {
          enabled: true,
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    });

    it('должен применять Permissions Policy', () => {
      const config: SecurityConfig = {
        permissionsPolicy: {
          'camera': ['()'],
          'microphone': ['()'],
          'geolocation': ['()']
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'camera=(()), microphone=(()), geolocation=(())'
      );
    });

    it('должен отключать определенные headers при конфигурации', () => {
      const config: SecurityConfig = {
        noSniff: false,
        frameguard: false,
        xssFilter: false,
        contentSecurityPolicy: {
          enabled: false
        },
        hsts: {
          enabled: false
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-Content-Type-Options', expect.any(String));
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-Frame-Options', expect.any(String));
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-XSS-Protection', expect.any(String));
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
    });
  });

  describe('SecurityMiddleware Class', () => {
    it('должен корректно инициализироваться с дефолтной конфигурацией', () => {
      const securityMiddleware = new SecurityMiddleware();
      const middleware = securityMiddleware.createMiddleware();

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockNext).toHaveBeenCalled();
    });

    it('должен объединять пользовательскую и дефолтную конфигурации', () => {
      const customConfig: SecurityConfig = {
        frameguard: 'sameorigin',
        contentSecurityPolicy: {
          enabled: true,
          directives: {
            'script-src': ["'self'", 'https://custom.cdn.com']
          }
        }
      };

      const securityMiddleware = new SecurityMiddleware(customConfig);
      const middleware = securityMiddleware.createMiddleware();

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("script-src 'self' https://custom.cdn.com")
      );
    });
  });

  describe('CORS Middleware', () => {
    it('должен применять базовые CORS headers', () => {
      const middleware = createCORSMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://heys.app');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockNext).toHaveBeenCalled();
    });

    it('должен обрабатывать preflight OPTIONS запросы', () => {
      mockReq.method = 'OPTIONS';
      const middleware = createCORSMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('должен проверять разрешенные origins', () => {
      const config: CORSConfig = {
        origin: ['https://heys.app', 'https://admin.heys.app']
      };

      const middleware = createCORSMiddleware(config);

      // Разрешенный origin
      mockReq.headers.origin = 'https://heys.app';
      middleware(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://heys.app');

      // Сброс моков
      mockRes.setHeader.mockClear();

      // Неразрешенный origin
      mockReq.headers.origin = 'https://malicious.com';
      middleware(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://malicious.com');
    });

    it('должен разрешать все origins в development режиме', () => {
      const config: CORSConfig = {
        origin: true
      };

      const middleware = createCORSMiddleware(config);
      mockReq.headers.origin = 'http://localhost:3000';
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
    });
  });

  describe('CORSMiddleware Class', () => {
    it('должен корректно инициализироваться с дефолтной конфигурацией', () => {
      const corsMiddleware = new CORSMiddleware();
      const middleware = corsMiddleware.createMiddleware();

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockNext).toHaveBeenCalled();
    });

    it('должен применять пользовательскую конфигурацию', () => {
      const customConfig: CORSConfig = {
        methods: ['GET', 'POST'],
        credentials: false,
        optionsSuccessStatus: 200
      };

      const corsMiddleware = new CORSMiddleware(customConfig);
      const middleware = corsMiddleware.createMiddleware();

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST');
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', expect.any(String));

      // Тест для OPTIONS
      mockReq.method = 'OPTIONS';
      mockRes.status.mockClear();
      middleware(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Security Stack', () => {
    it('должен комбинировать security и CORS middleware', () => {
      const securityConfig: SecurityConfig = { frameguard: 'sameorigin' };
      const corsConfig: CORSConfig = { credentials: false };

      const middleware = createSecurityStack(securityConfig, corsConfig);
      middleware(mockReq, mockRes, mockNext);

      // Проверяем что применяются и CORS и Security headers
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://heys.app');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Предустановленные конфигурации', () => {
    it('должен применять строгую security конфигурацию', () => {
      const middleware = createSecurityMiddleware(STRICT_SECURITY_CONFIG);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
      );
    });

    it('должен применять development конфигурацию', () => {
      const middleware = createSecurityMiddleware(DEVELOPMENT_SECURITY_CONFIG);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("'unsafe-eval'")
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
    });
  });

  describe('Экспортированные middleware', () => {
    it('basicSecurity должен работать корректно', () => {
      basicSecurity(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockNext).toHaveBeenCalled();
    });

    it('strictSecurity должен работать корректно', () => {
      strictSecurity(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('developmentSecurity должен работать корректно', () => {
      developmentSecurity(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
      expect(mockNext).toHaveBeenCalled();
    });

    it('basicCORS должен работать корректно', () => {
      basicCORS(mockReq, mockRes, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://heys.app');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('должен обрабатывать отсутствие origin в запросе', () => {
      mockReq.headers = {};
      const middleware = createCORSMiddleware({ origin: ['https://heys.app'] });
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });

    it('должен обрабатывать пустые директивы CSP', () => {
      const config: SecurityConfig = {
        contentSecurityPolicy: {
          enabled: false // Отключаем CSP
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      // CSP не должен быть установлен
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
    });

    it('должен обрабатывать HSTS без дополнительных параметров', () => {
      const config: SecurityConfig = {
        hsts: {
          enabled: true,
          maxAge: 3600,
          includeSubDomains: false,
          preload: false
        }
      };

      const middleware = createSecurityMiddleware(config);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=3600');
    });
  });

  describe('Производительность', () => {
    it('должен быстро обрабатывать запросы', () => {
      const middleware = createSecurityStack();
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        middleware(mockReq, { ...mockRes, setHeader: vi.fn() }, mockNext);
      }

      const end = performance.now();
      const timePerRequest = (end - start) / 1000;

      // Должен обрабатывать каждый запрос быстрее 1ms
      expect(timePerRequest).toBeLessThan(1);
    });
  });
});

describe('Integration Tests', () => {
  let mockRes: any;
  let mockReq: any;
  let mockNext: any;

  beforeEach(() => {
    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn()
    };
    mockReq = {
      method: 'POST',
      headers: {
        origin: 'https://heys.app',
        'content-type': 'application/json'
      }
    };
    mockNext = vi.fn();
  });

  it('должен интегрироваться с HEYS API endpoints', () => {
    const middleware = createSecurityStack(
      STRICT_SECURITY_CONFIG,
      { origin: ['https://heys.app'], credentials: true }
    );

    middleware(mockReq, mockRes, mockNext);

    // Проверяем критичные security headers для API
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://heys.app');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    expect(mockNext).toHaveBeenCalled();
  });

  it('должен блокировать подозрительные запросы', () => {
    const corsMiddleware = createCORSMiddleware({
      origin: ['https://heys.app']
    });

    // Подозрительный origin
    mockReq.headers.origin = 'https://malicious-site.com';
    corsMiddleware(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://malicious-site.com');
  });
});
