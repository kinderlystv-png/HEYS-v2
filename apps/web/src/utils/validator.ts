// filepath: apps/web/src/utils/validator.ts

/**
 * Input Validation Utils для HEYS API
 * Защита от инъекций и валидация входных данных
 */

import { z } from 'zod';

/**
 * Фабричные функции для создания схем валидации
 */
export const ValidationSchemas = {
  // Email валидация
  email: z.string().email('Некорректный email адрес'),

  // Пароль (минимум 8 символов, буквы, цифры, спец. символы)
  password: z
    .string()
    .min(8, 'Пароль должен содержать минимум 8 символов')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Пароль должен содержать строчные и заглавные буквы, цифры и специальные символы',
    ),

  // UUID валидация
  uuid: z.string().uuid('Некорректный UUID'),

  // Текст с ограничением длины
  text: (maxLength: number) =>
    z
      .string()
      .min(1, 'Поле не может быть пустым')
      .max(maxLength, `Максимальная длина: ${maxLength} символов`)
      .trim(),

  // Числа в диапазоне
  number: (min: number, max: number) =>
    z.number().min(min, `Минимальное значение: ${min}`).max(max, `Максимальное значение: ${max}`),

  // URL валидация (только HTTPS/HTTP)
  url: z
    .string()
    .url('Некорректный URL')
    .refine(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
      'URL должен начинаться с http:// или https://',
    ),

  // JSON валидация
  json: z.any().refine((value) => {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }, 'Некорректный JSON'),

  // Дата валидация
  date: z.date().refine((date) => !isNaN(date.getTime()), 'Некорректная дата'),

  // Файл валидация
  file: (maxSize: number, allowedTypes: string[]) =>
    z.object({
      name: z.string().min(1, 'Имя файла не может быть пустым'),
      size: z.number().max(maxSize, `Максимальный размер файла: ${maxSize} байт`),
      type: z
        .string()
        .refine(
          (type) => allowedTypes.includes(type),
          `Разрешенные типы файлов: ${allowedTypes.join(', ')}`,
        ),
    }),

  // Короткий текст
  shortText: z.string().max(100, 'Слишком длинный текст').trim(),
};

/**
 * HEYS-специфичные схемы валидации
 */
export const HeysValidationSchemas = {
  // Пользователь
  user: z.object({
    email: ValidationSchemas.email,
    password: ValidationSchemas.password,
    firstName: ValidationSchemas.text(50),
    lastName: ValidationSchemas.text(50),
    phone: z.string().optional(),
  }),

  // Обновление пользователя
  userUpdate: z.object({
    firstName: ValidationSchemas.text(50).optional(),
    lastName: ValidationSchemas.text(50).optional(),
    phone: z.string().optional(),
    bio: ValidationSchemas.text(500).optional(),
  }),

  // Сессия
  session: z.object({
    userId: ValidationSchemas.uuid,
    sessionType: z.enum(['meditation', 'breathing', 'mindfulness', 'sleep']),
    duration: ValidationSchemas.number(1, 7200), // до 2 часов
    mood: ValidationSchemas.number(1, 10),
    notes: ValidationSchemas.text(1000).optional(),
    tags: z.array(ValidationSchemas.shortText).optional(),
  }),

  // Дневная запись
  dayEntry: z.object({
    userId: ValidationSchemas.uuid,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD'),
    mood: ValidationSchemas.number(1, 10),
    energy: ValidationSchemas.number(1, 10),
    stress: ValidationSchemas.number(1, 10),
    sleep: ValidationSchemas.number(0, 1440), // минуты в сутках
    notes: ValidationSchemas.text(1000).optional(),
    activities: z.array(ValidationSchemas.shortText).optional(),
    gratitude: z.array(ValidationSchemas.text(200)).optional(),
  }),

  // API запрос
  apiRequest: z.object({
    endpoint: z.string().max(200),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    params: z.record(z.unknown()).optional(),
    body: z.record(z.unknown()).optional(),
    headers: z.record(z.string()).optional(),
  }),
};

/**
 * Результат валидации
 */
export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]> | undefined;
}

/**
 * Результат проверки безопасности
 */
export interface SecurityCheckResult {
  safe: boolean;
  threats: string[];
  details?: Record<string, any> | undefined;
}

/**
 * Основной класс для валидации и санитизации входных данных
 */
export class InputValidator {
  /**
   * Валидация данных с Zod схемой
   */
  validate<T>(data: unknown, schema: z.ZodSchema<T>): ValidationResult<T> {
    try {
      const result = schema.safeParse(data);

      if (result.success) {
        return {
          success: true,
          data: result.data,
        };
      }

      const errors: Record<string, string[]> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        if (!errors[path]) errors[path] = [];
        errors[path].push(issue.message);
      });

      return {
        success: false,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        errors: { _general: ['Ошибка валидации'] },
      };
    }
  }

  /**
   * Валидация нескольких полей
   */
  validateMultiple(
    data: Record<string, unknown>,
    schemas: Record<string, z.ZodSchema>,
  ): ValidationResult {
    const results: Record<string, any> = {};
    const errors: Record<string, string[]> = {};
    let hasErrors = false;

    for (const [field, schema] of Object.entries(schemas)) {
      const result = this.validate(data[field], schema);

      if (result.success) {
        results[field] = result.data;
      } else {
        hasErrors = true;
        errors[field] = result.errors?.[field] || result.errors?.[''] || ['Ошибка валидации'];
      }
    }

    return {
      success: !hasErrors,
      data: hasErrors ? undefined : results,
      errors: hasErrors ? errors : undefined,
    };
  }

  /**
   * Санитизация объекта (удаление подозрительных ключей)
   */
  sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const dangerousKeys = [
      '__proto__',
      'prototype',
      'constructor',
      'eval',
      'function',
      'script',
      'javascript',
      'onload',
      'onerror',
      'onclick',
      'onmouseover',
      'DROP',
      'DELETE',
      'INSERT',
      'UPDATE',
      'UNION',
      'SELECT',
    ];

    for (const [key, value] of Object.entries(obj)) {
      // Проверяем ключ на безопасность
      const keyLower = key.toLowerCase();
      const isDangerous = dangerousKeys.some((dangerous) =>
        keyLower.includes(dangerous.toLowerCase()),
      );

      if (!isDangerous && typeof key === 'string' && key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Санитизация строки
   */
  sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';

    return (
      input
        // Удаляем HTML теги
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/<meta\b[^>]*>/gi, '')
        // Удаляем javascript: ссылки
        .replace(/javascript:/gi, '')
        // Удаляем SQL инъекции
        .replace(/('\s*(OR|AND)\s*')/gi, '')
        .replace(/(UNION\s+SELECT|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO)/gi, '')
        // Обрезаем пробелы
        .trim()
    );
  }

  /**
   * Глубокая санитизация объекта
   */
  deepSanitize(obj: any, visited = new WeakSet()): any {
    if (obj === null || obj === undefined) return obj;

    // Защита от циклических ссылок
    if (typeof obj === 'object' && visited.has(obj)) {
      return {};
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepSanitize(item, visited));
    }

    if (typeof obj === 'object') {
      visited.add(obj);
      const sanitized = this.sanitizeObject(obj);
      const result: Record<string, any> = {};

      for (const [key, value] of Object.entries(sanitized)) {
        result[key] = this.deepSanitize(value, visited);
      }

      visited.delete(obj);
      return result;
    }

    return obj;
  }

  /**
   * Обнаружение SQL инъекций
   */
  detectSQLInjection(input: string): boolean {
    if (typeof input !== 'string') return false;

    const sqlPatterns = [
      /(\s|^)(union|select|insert|update|delete|drop|create|alter|exec|execute)(\s|$)/i,
      /(\s|^)(or|and)(\s|$).*(\s|^)(=|like)(\s|$)/i,
      /'\s*(or|and)\s*'/i,
      /--/,
      /\/\*/,
      /\*\//,
      /;.*(--)|(\/\*)|(\*\/)/i,
      /'\s*;\s*(drop|delete|insert|update)/i,
    ];

    return sqlPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Обнаружение XSS атак
   */
  detectXSS(input: string): boolean {
    if (typeof input !== 'string') return false;

    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/i,
      /on\w+\s*=/i,
      /<img[^>]*onerror/i,
      /<svg[^>]*onload/i,
      /<body[^>]*onload/i,
      /<input[^>]*onfocus/i,
      /eval\s*\(/i,
      /document\.cookie/i,
      /window\.location/i,
      /alert\s*\(/i,
    ];

    return xssPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Комплексная проверка безопасности
   */
  checkSecurity(data: any): SecurityCheckResult {
    const threats: string[] = [];
    const details: Record<string, any> = {};

    const checkValue = (value: any, path: string) => {
      if (typeof value === 'string') {
        if (this.detectSQLInjection(value)) {
          threats.push('sql_injection');
          details[path] = 'Обнаружена потенциальная SQL инъекция';
        }

        if (this.detectXSS(value)) {
          threats.push('xss');
          details[path] = 'Обнаружена потенциальная XSS атака';
        }
      }

      if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, `${path}.${key}`);
        }
      }
    };

    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        checkValue(value, key);
      }
    } else if (typeof data === 'string') {
      checkValue(data, 'root');
    }

    return {
      safe: threats.length === 0,
      threats: [...new Set(threats)], // убираем дубликаты
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }
}

/**
 * Middleware фабрики
 */

/**
 * Создать middleware для валидации конкретного поля
 */
export function createValidationMiddleware(
  source: 'body' | 'query' | 'params',
  field: string,
  schema: z.ZodSchema,
) {
  return (req: any, res: any, next: any) => {
    const validator = new InputValidator();
    const data = req[source]?.[field];

    const result = validator.validate(data, schema);

    if (result.success) {
      // Заменяем значение на валидированное
      if (req[source]) {
        req[source][field] = result.data;
      }
      next();
    } else {
      res.status(400).json({
        error: 'Validation failed',
        field,
        details: result.errors,
      });
    }
  };
}

/**
 * Middleware для валидации и санитизации множественных полей
 */
export function validateAndSanitize(config: {
  body?: Record<string, z.ZodSchema>;
  query?: Record<string, z.ZodSchema>;
  params?: Record<string, z.ZodSchema>;
}) {
  return (req: any, res: any, next: any) => {
    const validator = new InputValidator();
    const errors: Record<string, any> = {};

    // Валидация body
    if (config.body && req.body) {
      const result = validator.validateMultiple(req.body, config.body);
      if (!result.success) {
        errors.body = result.errors;
      } else {
        req.body = validator.deepSanitize(result.data);
      }
    }

    // Валидация query
    if (config.query && req.query) {
      const result = validator.validateMultiple(req.query, config.query);
      if (!result.success) {
        errors.query = result.errors;
      } else {
        req.query = validator.deepSanitize(result.data);
      }
    }

    // Валидация params
    if (config.params && req.params) {
      const result = validator.validateMultiple(req.params, config.params);
      if (!result.success) {
        errors.params = result.errors;
      } else {
        req.params = validator.deepSanitize(result.data);
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    } else {
      next();
    }
  };
}

/**
 * Middleware для валидации HEYS-специфичных данных
 */
export function validateHeysData(schemaType: keyof typeof HeysValidationSchemas) {
  return (req: any, res: any, next: any) => {
    const validator = new InputValidator();
    const schema = HeysValidationSchemas[schemaType] as z.ZodSchema;

    const result = validator.validate(req.body, schema);

    if (result.success) {
      req.body = validator.deepSanitize(result.data);
      next();
    } else {
      res.status(400).json({
        error: 'Validation failed',
        schema: schemaType,
        details: result.errors,
      });
    }
  };
}

/**
 * Middleware для комплексной валидации запроса
 */
export function validateRequest(options: {
  maxSize?: number;
  requireAuth?: boolean;
  sanitize?: boolean;
}) {
  return (req: any, res: any, next: any) => {
    const validator = new InputValidator();

    // Проверка размера запроса
    if (options.maxSize) {
      const size = JSON.stringify(req.body || {}).length;
      if (size > options.maxSize) {
        return res.status(413).json({
          error: 'Request too large',
          maxSize: options.maxSize,
          currentSize: size,
        });
      }
    }

    // Проверка безопасности
    const securityCheck = validator.checkSecurity(req.body);
    if (!securityCheck.safe) {
      return res.status(400).json({
        error: 'Security threat detected',
        threats: securityCheck.threats,
        details: securityCheck.details,
      });
    }

    // Санитизация данных
    if (options.sanitize && req.body) {
      req.body = validator.deepSanitize(req.body);
    }

    next();
  };
}

// Экспорт готовых экземпляров
export const validator = new InputValidator();
export default InputValidator;
