// filepath: apps/web/src/utils/__tests__/validator.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ValidationSchemas,
  HeysValidationSchemas,
  InputValidator,
  createValidationMiddleware,
  validateAndSanitize,
  validateHeysData,
  validateRequest
} from '../validator';

describe('ValidationSchemas', () => {
  describe('Базовые схемы валидации', () => {
    it('должен валидировать email', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+tag@example.org'
      ];

      validEmails.forEach(email => {
        const result = ValidationSchemas.email.safeParse(email);
        expect(result.success).toBe(true);
      });

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'test@',
        'test..email@domain.com'
      ];

      invalidEmails.forEach(email => {
        const result = ValidationSchemas.email.safeParse(email);
        expect(result.success).toBe(false);
      });
    });

    it('должен валидировать пароли', () => {
      const validPasswords = [
        'SecurePass123!',
        'MyP@ssw0rd',
        'Complex_Pass1'
      ];

      validPasswords.forEach(password => {
        const result = ValidationSchemas.password.safeParse(password);
        expect(result.success).toBe(true);
      });

      const invalidPasswords = [
        '123',          // Слишком короткий
        'password',     // Без цифр и спец. символов
        'PASSWORD123',  // Без строчных букв
        'password123'   // Без спец. символов
      ];

      invalidPasswords.forEach(password => {
        const result = ValidationSchemas.password.safeParse(password);
        expect(result.success).toBe(false);
      });
    });

    it('должен валидировать UUID', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      ];

      validUUIDs.forEach(uuid => {
        const result = ValidationSchemas.uuid.safeParse(uuid);
        expect(result.success).toBe(true);
      });

      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra'
      ];

      invalidUUIDs.forEach(uuid => {
        const result = ValidationSchemas.uuid.safeParse(uuid);
        expect(result.success).toBe(false);
      });
    });

    it('должен валидировать текст с ограничениями', () => {
      const result1 = ValidationSchemas.text(50).safeParse('Valid text');
      expect(result1.success).toBe(true);

      const result2 = ValidationSchemas.text(10).safeParse('This text is too long for validation');
      expect(result2.success).toBe(false);

      const result3 = ValidationSchemas.text(50).safeParse('');
      expect(result3.success).toBe(false);
    });

    it('должен валидировать числа в диапазоне', () => {
      const schema = ValidationSchemas.number(1, 100);

      expect(schema.safeParse(50).success).toBe(true);
      expect(schema.safeParse(1).success).toBe(true);
      expect(schema.safeParse(100).success).toBe(true);
      expect(schema.safeParse(0).success).toBe(false);
      expect(schema.safeParse(101).success).toBe(false);
    });

    it('должен валидировать URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://sub.domain.co.uk/path?query=value'
      ];

      validUrls.forEach(url => {
        const result = ValidationSchemas.url.safeParse(url);
        expect(result.success).toBe(true);
      });

      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        'javascript:alert(1)'
      ];

      invalidUrls.forEach(url => {
        const result = ValidationSchemas.url.safeParse(url);
        expect(result.success).toBe(false);
      });
    });

    it('должен валидировать JSON', () => {
      const validJson = { key: 'value', number: 123 };
      const result = ValidationSchemas.json.safeParse(validJson);
      expect(result.success).toBe(true);

      // Циклические ссылки должны быть отклонены
      const cyclicObj: any = { prop: null };
      cyclicObj.prop = cyclicObj;
      const result2 = ValidationSchemas.json.safeParse(cyclicObj);
      expect(result2.success).toBe(false);
    });

    it('должен валидировать даты', () => {
      const validDates = [
        new Date(),
        new Date('2023-01-01'),
        new Date('2025-12-31T23:59:59Z')
      ];

      validDates.forEach(date => {
        const result = ValidationSchemas.date.safeParse(date);
        expect(result.success).toBe(true);
      });

      const invalidDate = new Date('invalid-date');
      const result = ValidationSchemas.date.safeParse(invalidDate);
      expect(result.success).toBe(false);
    });

    it('должен валидировать файлы', () => {
      const validFile = {
        name: 'document.pdf',
        size: 1024 * 1024, // 1MB
        type: 'application/pdf'
      };

      const result = ValidationSchemas.file(2 * 1024 * 1024, ['application/pdf']).safeParse(validFile);
      expect(result.success).toBe(true);

      // Файл слишком большой
      const largeFile = { ...validFile, size: 3 * 1024 * 1024 };
      const result2 = ValidationSchemas.file(2 * 1024 * 1024, ['application/pdf']).safeParse(largeFile);
      expect(result2.success).toBe(false);

      // Неправильный тип
      const wrongType = { ...validFile, type: 'application/exe' };
      const result3 = ValidationSchemas.file(2 * 1024 * 1024, ['application/pdf']).safeParse(wrongType);
      expect(result3.success).toBe(false);
    });
  });
});

describe('HeysValidationSchemas', () => {
  describe('HEYS-специфичные схемы', () => {
    it('должен валидировать пользователя', () => {
      const validUser = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890'
      };

      const result = HeysValidationSchemas.user.safeParse(validUser);
      expect(result.success).toBe(true);

      // Обязательные поля
      const invalidUser = {
        email: 'invalid-email',
        password: '123'
      };

      const result2 = HeysValidationSchemas.user.safeParse(invalidUser);
      expect(result2.success).toBe(false);
    });

    it('должен валидировать обновления пользователя', () => {
      const validUpdate = {
        firstName: 'Jane',
        phone: '+9876543210'
      };

      const result = HeysValidationSchemas.userUpdate.safeParse(validUpdate);
      expect(result.success).toBe(true);

      // Пустой объект должен быть валидным
      const emptyUpdate = {};
      const result2 = HeysValidationSchemas.userUpdate.safeParse(emptyUpdate);
      expect(result2.success).toBe(true);
    });

    it('должен валидировать сессию', () => {
      const validSession = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        sessionType: 'meditation',
        duration: 1800,
        mood: 8,
        notes: 'Great session today',
        tags: ['relaxation', 'breathing']
      };

      const result = HeysValidationSchemas.session.safeParse(validSession);
      expect(result.success).toBe(true);

      // Некорректная mood оценка
      const invalidSession = {
        ...validSession,
        mood: 15 // Должно быть 1-10
      };

      const result2 = HeysValidationSchemas.session.safeParse(invalidSession);
      expect(result2.success).toBe(false);
    });

    it('должен валидировать дневную запись', () => {
      const validDayEntry = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        date: new Date().toISOString().split('T')[0],
        mood: 7,
        energy: 6,
        stress: 3,
        sleep: 480, // 8 часов в минутах
        notes: 'Good day overall',
        activities: ['work', 'exercise', 'reading'],
        gratitude: ['family', 'health', 'weather']
      };

      const result = HeysValidationSchemas.dayEntry.safeParse(validDayEntry);
      expect(result.success).toBe(true);

      // Некорректный формат даты
      const invalidDayEntry = {
        ...validDayEntry,
        date: '2023/01/01' // Должно быть YYYY-MM-DD
      };

      const result2 = HeysValidationSchemas.dayEntry.safeParse(invalidDayEntry);
      expect(result2.success).toBe(false);
    });

    it('должен валидировать API запрос', () => {
      const validApiRequest = {
        endpoint: '/api/sessions',
        method: 'POST',
        params: { limit: 10 },
        body: { sessionType: 'meditation' },
        headers: { 'Content-Type': 'application/json' }
      };

      const result = HeysValidationSchemas.apiRequest.safeParse(validApiRequest);
      expect(result.success).toBe(true);

      // Некорректный HTTP метод
      const invalidApiRequest = {
        ...validApiRequest,
        method: 'INVALID'
      };

      const result2 = HeysValidationSchemas.apiRequest.safeParse(invalidApiRequest);
      expect(result2.success).toBe(false);
    });
  });
});

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('Валидация данных', () => {
    it('должен валидировать данные с схемой', () => {
      const schema = ValidationSchemas.email;
      const validEmail = 'test@example.com';
      const invalidEmail = 'invalid-email';

      const result1 = validator.validate(validEmail, schema);
      expect(result1.success).toBe(true);
      expect(result1.data).toBe(validEmail);

      const result2 = validator.validate(invalidEmail, schema);
      expect(result2.success).toBe(false);
      expect(result2.errors).toBeDefined();
    });

    it('должен валидировать множественные поля', () => {
      const data = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        age: 25
      };

      const schemas = {
        email: ValidationSchemas.email,
        password: ValidationSchemas.password,
        age: ValidationSchemas.number(18, 100)
      };

      const result = validator.validateMultiple(data, schemas);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);

      // С ошибками
      const invalidData = {
        email: 'invalid-email',
        password: '123',
        age: 150
      };

      const result2 = validator.validateMultiple(invalidData, schemas);
      expect(result2.success).toBe(false);
      expect(result2.errors?.email).toBeDefined();
      expect(result2.errors?.password).toBeDefined();
      expect(result2.errors?.age).toBeDefined();
    });
  });

  describe('Санитизация данных', () => {
    it('должен очищать объекты', () => {
      const dirtyObject = {
        validField: 'value',
        '<script>': 'malicious',
        'valid_field_2': 'another value',
        'DROP TABLE': 'users'
      };

      const cleaned = validator.sanitizeObject(dirtyObject);
      expect(cleaned.validField).toBe('value');
      expect(cleaned.valid_field_2).toBe('another value');
      expect(cleaned['<script>']).toBeUndefined();
      expect(cleaned['DROP TABLE']).toBeUndefined();
    });

    it('должен очищать строки', () => {
      const dirtyStrings = [
        '<script>alert("xss")</script>',
        'SELECT * FROM users WHERE 1=1; DROP TABLE users;',
        'Normal text',
        '<img src="x" onerror="alert(1)">'
      ];

      const cleanedStrings = dirtyStrings.map(str => validator.sanitizeString(str));
      
      expect(cleanedStrings[0]).not.toContain('<script>');
      expect(cleanedStrings[1]).not.toContain('DROP TABLE');
      expect(cleanedStrings[2]).toBe('Normal text');
      expect(cleanedStrings[3]).not.toContain('onerror');
    });

    it('должен глубоко очищать вложенные объекты', () => {
      const deepObject = {
        level1: {
          level2: {
            '<script>alert(1)</script>': 'malicious',
            safeField: 'safe value',
            level3: {
              'DROP TABLE users': 'sql injection',
              normalField: 'normal'
            }
          }
        }
      };

      const cleaned = validator.deepSanitize(deepObject);
      expect(cleaned.level1.level2.safeField).toBe('safe value');
      expect(cleaned.level1.level2.level3.normalField).toBe('normal');
      expect(cleaned.level1.level2['<script>alert(1)</script>']).toBeUndefined();
      expect(cleaned.level1.level2.level3['DROP TABLE users']).toBeUndefined();
    });
  });

  describe('Безопасность', () => {
    it('должен обнаруживать SQL инъекции', () => {
      const sqlInjections = [
        "'; DROP TABLE users; --",
        'SELECT * FROM users WHERE id = 1; DELETE FROM users;',
        "' OR '1'='1",
        'UNION SELECT password FROM users',
        'INSERT INTO admin VALUES (1, "attacker")'
      ];

      sqlInjections.forEach(injection => {
        const result = validator.detectSQLInjection(injection);
        expect(result).toBe(true);
      });

      const safeSql = 'SELECT name FROM users WHERE id = ?';
      expect(validator.detectSQLInjection(safeSql)).toBe(false);
    });

    it('должен обнаруживать XSS атаки', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        'javascript:alert(document.cookie)',
        '<svg onload="alert(1)">',
        '<body onload="alert(1)">'
      ];

      xssAttempts.forEach(xss => {
        const result = validator.detectXSS(xss);
        expect(result).toBe(true);
      });

      const safeHtml = '<p>This is safe text</p>';
      expect(validator.detectXSS(safeHtml)).toBe(false);
    });

    it('должен проверять безопасность данных', () => {
      const unsafeData = {
        username: 'admin\'; DROP TABLE users; --',
        bio: '<script>alert("xss")</script>',
        website: 'javascript:alert(1)'
      };

      const result = validator.checkSecurity(unsafeData);
      expect(result.safe).toBe(false);
      expect(result.threats).toContain('sql_injection');
      expect(result.threats).toContain('xss');

      const safeData = {
        username: 'john_doe',
        bio: 'I love programming',
        website: 'https://johndoe.com'
      };

      const result2 = validator.checkSecurity(safeData);
      expect(result2.safe).toBe(true);
      expect(result2.threats).toHaveLength(0);
    });
  });
});

describe('Middleware Functions', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    mockNext = vi.fn();
  });

  describe('createValidationMiddleware', () => {
    it('должен создавать middleware для валидации body', () => {
      const schema = ValidationSchemas.email;
      const middleware = createValidationMiddleware('body', 'email', schema);

      // Валидные данные
      mockReq.body = { email: 'test@example.com' };
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();

      // Сброс моков
      mockNext.mockClear();
      mockRes.status.mockClear();

      // Невалидные данные
      mockReq.body = { email: 'invalid-email' };
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          field: 'email'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('должен создавать middleware для валидации query параметров', () => {
      const schema = ValidationSchemas.number(1, 100);
      const middleware = createValidationMiddleware('query', 'page', schema);

      mockReq.query = { page: '5' };
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query.page).toBe(5); // Должно быть преобразовано в число
    });

    it('должен создавать middleware для валидации params', () => {
      const schema = ValidationSchemas.uuid;
      const middleware = createValidationMiddleware('params', 'id', schema);

      mockReq.params = { id: '550e8400-e29b-41d4-a716-446655440000' };
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateAndSanitize', () => {
    it('должен валидировать и санитизировать данные', () => {
      const middleware = validateAndSanitize({
        body: {
          email: ValidationSchemas.email,
          name: ValidationSchemas.text(50)
        }
      });

      mockReq.body = {
        email: 'test@example.com',
        name: 'John Doe',
        maliciousField: '<script>alert(1)</script>'
      };

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.email).toBe('test@example.com');
      expect(mockReq.body.name).toBe('John Doe');
      expect(mockReq.body.maliciousField).toBeUndefined();
    });

    it('должен обрабатывать ошибки валидации', () => {
      const middleware = validateAndSanitize({
        body: {
          email: ValidationSchemas.email
        }
      });

      mockReq.body = {
        email: 'invalid-email'
      };

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateHeysData', () => {
    it('должен валидировать HEYS-специфичные данные', () => {
      const middleware = validateHeysData('user');

      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('должен отклонять невалидные HEYS данные', () => {
      const middleware = validateHeysData('session');

      mockReq.body = {
        userId: 'invalid-uuid',
        sessionType: 'invalid-type',
        mood: 15 // Вне диапазона 1-10
      };

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateRequest', () => {
    it('должен валидировать полный запрос', () => {
      const middleware = validateRequest({
        maxSize: 1024,
        requireAuth: false,
        sanitize: true
      });

      mockReq.body = {
        message: 'Hello world',
        data: { test: 'value' }
      };

      // Мокаем размер запроса
      const originalJson = JSON.stringify;
      JSON.stringify = vi.fn().mockReturnValue('{"message":"Hello world","data":{"test":"value"}}');

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // Восстанавливаем оригинальный метод
      JSON.stringify = originalJson;
    });

    it('должен отклонять слишком большие запросы', () => {
      const middleware = validateRequest({
        maxSize: 10, // Очень маленький лимит
        requireAuth: false
      });

      mockReq.body = {
        largeData: 'x'.repeat(1000)
      };

      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('Edge Cases и Performance', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  it('должен обрабатывать пустые/null значения', () => {
    expect(() => validator.sanitizeString('')).not.toThrow();
    expect(() => validator.sanitizeObject({})).not.toThrow();
    expect(() => validator.deepSanitize(null)).not.toThrow();
    expect(() => validator.checkSecurity(undefined)).not.toThrow();
  });

  it('должен быстро обрабатывать большие объекты', () => {
    const largeObject: any = {};
    for (let i = 0; i < 1000; i++) {
      largeObject[`field_${i}`] = `value_${i}`;
    }

    const start = performance.now();
    validator.deepSanitize(largeObject);
    const end = performance.now();

    // Должно обрабатываться быстрее 100ms
    expect(end - start).toBeLessThan(100);
  });

  it('должен обрабатывать циклические ссылки', () => {
    const cyclicObj: any = { prop: 'value' };
    cyclicObj.self = cyclicObj;

    expect(() => validator.deepSanitize(cyclicObj)).not.toThrow();
  });

  it('должен обрабатывать глубоко вложенные объекты', () => {
    let deepObj: any = {};
    let current = deepObj;

    // Создаем объект с вложенностью 50 уровней
    for (let i = 0; i < 50; i++) {
      current.next = { value: `level_${i}` };
      current = current.next;
    }

    expect(() => validator.deepSanitize(deepObj)).not.toThrow();
  });
});
