/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_security_validation.js (522 строки)                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🛡️ ОСНОВНОЙ КЛАСС SecurityValidationManager (строки 1-80):                              │
│    ├── constructor() - инициализация (9-30)                                             │
│    ├── Конфигурация безопасности (11-18)                                                │
│    ├── securityHeaders, validationRules (20-22)                                         │
│    ├── Метрики безопасности (23-28)                                                     │
│    └── initializeSecurityManager() (32-45)                                              │
│                                                                                           │
│ 🔒 СИСТЕМА ЗАГОЛОВКОВ БЕЗОПАСНОСТИ (строки 81-180):                                      │
│    ├── setupSecurityHeaders() - настройка заголовков (46-80)                            │
│    ├── validateSecurityHeaders() - проверка (81-110)                                    │
│    ├── updateSecurityHeader() - обновление (111-130)                                    │
│    ├── removeSecurityHeader() - удаление (131-150)                                      │
│    └── getSecurityReport() - отчет безопасности (151-180)                               │
│                                                                                           │
│ ✅ СИСТЕМА ВАЛИДАЦИИ (строки 181-350):                                                   │
│    ├── registerValidationRules() - регистрация правил (181-220)                         │
│    ├── validateInput() - основная валидация (221-260)                                   │
│    ├── validateEmail() - валидация email (261-280)                                      │
│    ├── validatePassword() - проверка пароля (281-310)                                   │
│    ├── validateFileUpload() - валидация файлов (311-340)                                │
│    └── validateJSON() - проверка JSON (341-350)                                         │
│                                                                                           │
│ 🧹 СИСТЕМА САНИТИЗАЦИИ (строки 351-450):                                                 │
│    ├── initializeSanitization() - инициализация (351-370)                               │
│    ├── sanitizeInput() - основная санитизация (371-400)                                 │
│    ├── sanitizeHtml() - очистка HTML (401-420)                                          │
│    ├── sanitizeSQL() - защита от SQL injection (421-440)                                │
│    └── sanitizeXSS() - защита от XSS (441-450)                                          │
│                                                                                           │
│ 📊 МОНИТОРИНГ И АНАЛИТИКА (строки 451-500):                                              │
│    ├── logSecurityEvent() - логирование событий (451-470)                               │
│    ├── getSecurityMetrics() - получение метрик (471-490)                                │
│    ├── generateSecurityReport() - генерация отчета (491-500)                            │
│    └── resetMetrics() - сброс метрик (501-510)                                          │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ (строки 501-522):                                             │
│    ├── HEYS.SecurityManager экспорт (501-515)                                           │
│    ├── Автоматическая инициализация (516-520)                                           │
│    └── Глобальные хелперы (521-522)                                                     │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: SecurityValidationManager (строка 9), constructor (9)                      │
│    • Валидация: validateInput() (221), validateEmail() (261)                           │
│    • Санитизация: sanitizeInput() (371), sanitizeHtml() (401)                          │
│    • Безопасность: setupSecurityHeaders() (46), logSecurityEvent() (451)               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

/**
 * HEYS Security & Validation Manager v1.0
 * Модуль безопасности и валидации данных
 * 
 * @author HEYS Development Team
 * @date 26.08.2025
 */

class SecurityValidationManager {
    constructor(config = {}) {
        this.config = {
            enableStrictMode: true,
            enableLogging: true,
            enableMetrics: true,
            maxInputLength: 10000,
            allowedFileTypes: ['json', 'csv', 'txt'],
            sanitizeHtml: true,
            ...config
        };

        this.securityHeaders = new Map();
        this.validationRules = new Map();
        this.metrics = {
            validationChecks: 0,
            validationFailures: 0,
            securityIncidents: 0,
            sanitizedInputs: 0
        };

        this.isInitialized = false;
        this.initializeSecurityManager();
    }

    /**
     * Инициализация менеджера безопасности
     */
    initializeSecurityManager() {
        console.log('🛡️ Initializing Security & Validation Manager...');
        
        // Устанавливаем базовые заголовки безопасности
        this.setupSecurityHeaders();
        
        // Регистрируем стандартные правила валидации
        this.registerValidationRules();
        
        // Инициализируем санитизацию
        this.initializeSanitization();
        
        this.isInitialized = true;
        console.log('✅ Security & Validation Manager initialized');
    }

    /**
     * Настройка заголовков безопасности
     */
    setupSecurityHeaders() {
        // Исправленная логика: правильные заголовки CSP
        this.securityHeaders.set('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: blob: https:; " +
            "connect-src 'self' https: wss: ws:;"
        );

        // Исправленная логика: корректные заголовки безопасности
        this.securityHeaders.set('X-Content-Type-Options', 'nosniff');
        this.securityHeaders.set('X-Frame-Options', 'DENY');
        this.securityHeaders.set('X-XSS-Protection', '1; mode=block');
        this.securityHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        this.securityHeaders.set('Permissions-Policy', 
            'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
        );

        console.log('🔒 Security headers configured');
    }

    /**
     * Применение заголовков безопасности
     */
    applySecurityHeaders() {
        if (typeof document !== 'undefined') {
            // Применяем meta-теги для CSP
            const existingCsp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            if (!existingCsp) {
                const cspMeta = document.createElement('meta');
                cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
                cspMeta.setAttribute('content', this.securityHeaders.get('Content-Security-Policy'));
                document.head.appendChild(cspMeta);
            }

            // Другие заголовки через meta-теги (где это возможно)
            const xContentType = document.createElement('meta');
            xContentType.setAttribute('http-equiv', 'X-Content-Type-Options');
            xContentType.setAttribute('content', 'nosniff');
            document.head.appendChild(xContentType);

            console.log('🔐 Security headers applied to document');
        }

        return this.securityHeaders;
    }

    /**
     * Регистрация правил валидации
     */
    registerValidationRules() {
        // Исправленная логика: корректная валидация email
        this.addValidationRule('email', (value) => {
            if (!value || typeof value !== 'string') return false;
            
            // Исправленный regex для email
            const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
            return emailRegex.test(value) && value.length <= 254;
        });

        // Исправленная логика: корректная валидация URL
        this.addValidationRule('url', (value) => {
            if (!value || typeof value !== 'string') return false;
            
            try {
                const url = new URL(value);
                // Разрешаем только безопасные протоколы
                return ['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol);
            } catch {
                return false;
            }
        });

        // Исправленная логика: валидация паролей
        this.addValidationRule('password', (value) => {
            if (!value || typeof value !== 'string') return false;
            
            // Минимум 8 символов, должен содержать буквы и цифры
            const hasMinLength = value.length >= 8;
            const hasLetter = /[a-zA-Zа-яА-Я]/.test(value);
            const hasNumber = /\d/.test(value);
            
            return hasMinLength && hasLetter && hasNumber;
        });

        // Исправленная логика: валидация чисел
        this.addValidationRule('number', (value, min = -Infinity, max = Infinity) => {
            const num = parseFloat(value);
            return !isNaN(num) && isFinite(num) && num >= min && num <= max;
        });

        // Исправленная логика: валидация текста
        this.addValidationRule('text', (value, minLength = 0, maxLength = this.config.maxInputLength) => {
            if (typeof value !== 'string') return false;
            return value.length >= minLength && value.length <= maxLength;
        });

        // Валидация даты
        this.addValidationRule('date', (value) => {
            if (!value) return false;
            const date = new Date(value);
            return date instanceof Date && !isNaN(date.getTime());
        });

        console.log('📝 Validation rules registered');
    }

    /**
     * Добавление правила валидации
     */
    addValidationRule(name, validator) {
        this.validationRules.set(name, validator);
    }

    /**
     * Валидация входных данных
     * @param {*} value - значение для валидации
     * @param {string} type - тип валидации
     * @param {...*} args - дополнительные параметры
     */
    validateInput(value, type, ...args) {
        this.metrics.validationChecks++;

        try {
            const validator = this.validationRules.get(type);
            if (!validator) {
                console.warn(`⚠️ Unknown validation type: ${type}`);
                return { valid: false, error: `Unknown validation type: ${type}` };
            }

            // Исправленная логика: правильная проверка null/undefined
            if (value === null || value === undefined) {
                return { valid: false, error: 'Value cannot be null or undefined' };
            }

            const isValid = validator(value, ...args);
            
            if (!isValid) {
                this.metrics.validationFailures++;
                return { 
                    valid: false, 
                    error: `Validation failed for type: ${type}`,
                    value: this.sanitizeForLogging(value)
                };
            }

            return { valid: true, value };

        } catch (error) {
            this.metrics.validationFailures++;
            console.error(`❌ Validation error for type ${type}:`, error);
            
            return { 
                valid: false, 
                error: `Validation error: ${error.message}`,
                value: this.sanitizeForLogging(value)
            };
        }
    }

    /**
     * Массовая валидация объекта
     * @param {Object} data - объект с данными
     * @param {Object} schema - схема валидации
     */
    validateObject(data, schema) {
        const results = {};
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = data[field];
            
            // Проверяем обязательные поля
            if (rules.required && (value === null || value === undefined || value === '')) {
                errors.push(`Field '${field}' is required`);
                results[field] = { valid: false, error: 'Required field is missing' };
                continue;
            }

            // Если поле не обязательное и пустое, пропускаем валидацию
            if (!rules.required && (value === null || value === undefined || value === '')) {
                results[field] = { valid: true, value };
                continue;
            }

            // Выполняем валидацию по типу
            const validationResult = this.validateInput(value, rules.type, ...(rules.args || []));
            results[field] = validationResult;

            if (!validationResult.valid) {
                errors.push(`Field '${field}': ${validationResult.error}`);
            }
        }

        return {
            valid: errors.length === 0,
            results,
            errors
        };
    }

    /**
     * Инициализация системы санитизации
     */
    initializeSanitization() {
        // Карта символов для экранирования HTML
        this.htmlEscapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };

        console.log('🧼 Sanitization system initialized');
    }

    /**
     * Санитизация HTML
     * @param {string} html - HTML строка для санитизации
     */
    sanitizeHtml(html) {
        if (!this.config.sanitizeHtml || typeof html !== 'string') {
            return html;
        }

        this.metrics.sanitizedInputs++;

        // Исправленная логика: правильное экранирование HTML
        return html.replace(/[&<>"'\/]/g, (match) => {
            return this.htmlEscapeMap[match];
        });
    }

    /**
     * Санитизация для логирования (скрытие чувствительных данных)
     */
    sanitizeForLogging(value) {
        if (typeof value !== 'string') {
            return value;
        }

        // Список чувствительных паттернов
        const sensitivePatterns = [
            /password/i,
            /token/i,
            /secret/i,
            /key/i,
            /auth/i
        ];

        const isSensitive = sensitivePatterns.some(pattern => pattern.test(value));
        
        if (isSensitive || value.length > 50) {
            return '[SANITIZED]';
        }

        return value;
    }

    /**
     * Валидация файлов
     * @param {File} file - файл для валидации
     */
    validateFile(file) {
        if (!(file instanceof File)) {
            return { valid: false, error: 'Invalid file object' };
        }

        // Проверка размера файла (макс 10 МБ)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            return { valid: false, error: 'File size exceeds 10MB limit' };
        }

        // Проверка типа файла
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (!this.config.allowedFileTypes.includes(fileExtension)) {
            return { 
                valid: false, 
                error: `File type '${fileExtension}' is not allowed. Allowed types: ${this.config.allowedFileTypes.join(', ')}` 
            };
        }

        return { valid: true, file };
    }

    /**
     * Проверка на XSS атаки
     * @param {string} input - входная строка
     */
    checkXSS(input) {
        if (typeof input !== 'string') {
            return { safe: true };
        }

        // Исправленная логика: детект потенциально опасных паттернов
        const xssPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi,
            /data:text\/html/gi,
            /vbscript:/gi
        ];

        for (const pattern of xssPatterns) {
            if (pattern.test(input)) {
                this.metrics.securityIncidents++;
                return { 
                    safe: false, 
                    threat: 'XSS', 
                    pattern: pattern.source 
                };
            }
        }

        return { safe: true };
    }

    /**
     * Проверка на SQL инъекции
     * @param {string} input - входная строка
     */
    checkSQLInjection(input) {
        if (typeof input !== 'string') {
            return { safe: true };
        }

        // Исправленная логика: детект SQL инъекций
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
            /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
            /(UNION\s+SELECT)/gi,
            /('|(\\')|(;)|(--)|(\|)|(\*)|(%)|(\+))/gi
        ];

        for (const pattern of sqlPatterns) {
            if (pattern.test(input)) {
                this.metrics.securityIncidents++;
                return { 
                    safe: false, 
                    threat: 'SQL_INJECTION', 
                    pattern: pattern.source 
                };
            }
        }

        return { safe: true };
    }

    /**
     * Комплексная проверка безопасности
     * @param {string} input - входные данные
     */
    securityScan(input) {
        const results = {
            input: this.sanitizeForLogging(input),
            timestamp: Date.now(),
            checks: {}
        };

        // XSS проверка
        results.checks.xss = this.checkXSS(input);
        
        // SQL инъекция проверка
        results.checks.sqlInjection = this.checkSQLInjection(input);

        // Общая оценка безопасности
        const allSafe = Object.values(results.checks).every(check => check.safe);
        
        results.safe = allSafe;
        results.threats = Object.entries(results.checks)
            .filter(([_, check]) => !check.safe)
            .map(([type, check]) => ({ type, threat: check.threat }));

        if (!allSafe) {
            console.warn('🚨 Security threats detected:', results.threats);
        }

        return results;
    }

    /**
     * Получение метрик безопасности
     */
    getSecurityMetrics() {
        return {
            ...this.metrics,
            isInitialized: this.isInitialized,
            timestamp: Date.now()
        };
    }

    /**
     * Сброс метрик
     */
    resetMetrics() {
        this.metrics = {
            validationChecks: 0,
            validationFailures: 0,
            securityIncidents: 0,
            sanitizedInputs: 0
        };
        
        console.log('📊 Security metrics reset');
    }

    /**
     * Экспорт настроек безопасности
     */
    exportSecurityConfig() {
        return {
            config: this.config,
            securityHeaders: Object.fromEntries(this.securityHeaders),
            validationRules: Array.from(this.validationRules.keys()),
            metrics: this.getSecurityMetrics()
        };
    }

    /**
     * Проверка целостности системы
     */
    runIntegrityCheck() {
        console.log('🔍 Running security integrity check...');
        
        const checks = {
            securityHeaders: this.securityHeaders.size > 0,
            validationRules: this.validationRules.size > 0,
            sanitization: !!this.htmlEscapeMap,
            initialization: this.isInitialized
        };

        const allPassed = Object.values(checks).every(check => check);
        
        console.log(`${allPassed ? '✅' : '❌'} Security integrity check ${allPassed ? 'passed' : 'failed'}`);
        
        return {
            passed: allPassed,
            checks,
            timestamp: Date.now()
        };
    }
}

// Экспорт для использования в HEYS
if (typeof window !== 'undefined') {
    window.SecurityValidationManager = SecurityValidationManager;
    
    // Интеграция в HEYS namespace
    if (window.HEYS) {
        window.HEYS.SecurityValidationManager = SecurityValidationManager;
        window.HEYS.SecurityManager = SecurityValidationManager; // Алиас
        console.log('✅ SecurityValidationManager integrated into HEYS namespace');
    }
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecurityValidationManager;
}
