// filepath: apps/web/src/middleware/demo-usage.ts

/**
 * Демонстрационные примеры использования HEYS Security Middleware
 * Показывает как интегрировать безопасность в API endpoints
 */

import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { validateAndSanitize, validateHeysData, ValidationSchemas } from '../utils/validator';

import { optionalAuth, requireAdmin, requireAuth } from './auth';
import { createSecurityStack, STRICT_SECURITY_CONFIG } from './security';

const app = express();

// Применяем глобальную защиту security headers + CORS
app.use(createSecurityStack(STRICT_SECURITY_CONFIG));

/**
 * ПУБЛИЧНЫЕ ENDPOINTS - только validation
 */

// Регистрация пользователя
app.post(
  '/api/auth/register',
  validateHeysData('user'), // Валидация данных пользователя
  async (req, res) => {
    // req.body уже валидирован и санитизирован
    void req.body;

    try {
      // Создание пользователя в Supabase
      // const user = await createUser({ email, password, firstName, lastName });
      res.json({ success: true, message: 'User created' });
    } catch (error) {
      res.status(400).json({ error: 'Registration failed' });
    }
  },
);

// Логин пользователя
app.post(
  '/api/auth/login',
  validateAndSanitize({
    body: {
      email: ValidationSchemas.email,
      password: ValidationSchemas.password,
    },
  }),
  async (req, res) => {
    void req.body;

    try {
      // Аутентификация через Supabase
      // const session = await signIn(email, password);
      res.json({ success: true, token: 'jwt-token-here' });
    } catch (error) {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  },
);

/**
 * ЗАЩИЩЕННЫЕ ENDPOINTS - требуют авторизации
 */

// Получение профиля пользователя
app.get(
  '/api/user/profile',
  requireAuth(), // Обязательная авторизация
  async (req, res) => {
    // req.user доступен после middleware
    const userId = req.user.id;

    try {
      // const profile = await getUserProfile(userId);
      res.json({ id: userId, email: req.user.email });
    } catch (error) {
      res.status(404).json({ error: 'Profile not found' });
    }
  },
);

// Обновление профиля пользователя
app.put(
  '/api/user/profile',
  requireAuth(),
  validateHeysData('userUpdate'), // Валидация данных обновления
  async (req, res) => {
    void req.user.id;
    void req.body;

    try {
      // const updatedProfile = await updateUserProfile(userId, updates);
      res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
      res.status(400).json({ error: 'Update failed' });
    }
  },
);

// Создание сессии медитации
app.post('/api/sessions', requireAuth(), validateHeysData('session'), async (req, res) => {
  const userId = req.user.id;
  void req.body;
  void userId;

  try {
    // const session = await createSession(sessionData);
    res.json({ success: true, id: 'session-id' });
  } catch (error) {
    res.status(400).json({ error: 'Session creation failed' });
  }
});

// Получение сессий пользователя
app.get(
  '/api/sessions',
  requireAuth(),
  validateAndSanitize({
    query: {
      limit: ValidationSchemas.number(1, 100).optional(),
      offset: ValidationSchemas.number(0, 10000).optional(),
      type: ValidationSchemas.shortText.optional(),
    },
  }),
  async (req, res) => {
    void req.user.id;
    void req.query;

    try {
      // const sessions = await getUserSessions(userId, { limit, offset, type });
      res.json({ sessions: [], total: 0 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  },
);

// Создание дневной записи
app.post('/api/diary/entries', requireAuth(), validateHeysData('dayEntry'), async (req, res) => {
  const userId = req.user.id;
  void req.body;
  void userId;

  try {
    // const entry = await createDayEntry(entryData);
    res.json({ success: true, id: 'entry-id' });
  } catch (error) {
    res.status(400).json({ error: 'Entry creation failed' });
  }
});

/**
 * АДМИНСКИЕ ENDPOINTS - только для администраторов
 */

// Получение всех пользователей (только админы)
app.get(
  '/api/admin/users',
  requireAdmin(), // Проверка роли администратора
  validateAndSanitize({
    query: {
      limit: ValidationSchemas.number(1, 1000).optional(),
      search: ValidationSchemas.text(100).optional(),
    },
  }),
  async (req, res) => {
    void req.query;

    try {
      // const users = await getAllUsers({ limit, search });
      res.json({ users: [], total: 0 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },
);

// Удаление пользователя (только админы)
app.delete(
  '/api/admin/users/:id',
  requireAdmin(),
  validateAndSanitize({
    params: {
      id: ValidationSchemas.uuid,
    },
  }),
  async (req, res) => {
    void req.params;

    try {
      // await deleteUser(id);
      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      res.status(400).json({ error: 'Deletion failed' });
    }
  },
);

/**
 * ПУБЛИЧНЫЕ ENDPOINTS с опциональной авторизацией
 */

// Получение публичной статистики
app.get(
  '/api/public/stats',
  optionalAuth(), // Авторизация опциональна
  async (req, res) => {
    // req.user может быть undefined
    const isAuthenticated = !!req.user;

    try {
      // const stats = await getPublicStats(isAuthenticated);
      res.json({
        totalUsers: 1000,
        totalSessions: 5000,
        authenticated: isAuthenticated,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  },
);

/**
 * ДЕМОНСТРАЦИЯ ОБРАБОТКИ ОШИБОК
 */

// Middleware для обработки ошибок валидации
app.use((error: Error & { name?: string; details?: unknown }, _req: Request, res: Response, _next: NextFunction) => {
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details,
    });
  }

  if (error.name === 'AuthenticationError') {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  if (error.name === 'AuthorizationError') {
    return res.status(403).json({
      error: 'Insufficient permissions',
    });
  }

  // Общая ошибка сервера
  res.status(500).json({
    error: 'Internal server error',
  });
});

/**
 * РЕКОМЕНДАЦИИ ПО ИСПОЛЬЗОВАНИЮ
 */

/*
1. ПОРЯДОК MIDDLEWARE:
   - Security headers (первый)
   - CORS
   - Authentication (если нужна)
   - Validation
   - Business logic

2. ВАЛИДАЦИЯ:
   - Используйте validateHeysData() для HEYS-специфичных схем
   - Используйте validateAndSanitize() для кастомной валидации
   - Всегда валидируйте params, query и body

3. АВТОРИЗАЦИЯ:
   - requireAuth() для защищенных endpoints
   - requireAdmin() для админских функций
   - optionalAuth() для публичных endpoints с доп. функциями

4. БЕЗОПАСНОСТЬ:
   - Все входные данные автоматически санитизируются
   - SQL injection и XSS атаки блокируются
   - CSRF защита через security headers
   - Rate limiting следует добавить отдельно

5. ТЕСТИРОВАНИЕ:
   - Тестируйте каждый endpoint с валидными/невалидными данными
   - Проверяйте авторизацию
   - Тестируйте security headers
*/

export { app };
export default app;
