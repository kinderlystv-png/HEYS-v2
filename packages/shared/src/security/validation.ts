/**
 * HEYS Security Layer v1.4
 * Modern validation and security system
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import { z } from 'zod';

/**
 * Base validation schema definitions
 */
export const ValidationSchemas = {
  // User data validation
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/),
    password: z.string().min(8).max(128),
    role: z.enum(['admin', 'user', 'moderator', 'guest']),
    isActive: z.boolean().default(true),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  }),

  // Content validation
  content: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    content: z.string().max(10000),
    authorId: z.string().uuid(),
    tags: z.array(z.string()).max(10).optional(),
    isPublic: z.boolean().default(false),
    metadata: z.record(z.unknown()).optional(),
  }),

  // File upload validation
  file: z.object({
    name: z.string().min(1).max(255),
    type: z.string().regex(/^[a-zA-Z0-9/.-]+$/),
    size: z
      .number()
      .min(1)
      .max(10 * 1024 * 1024), // 10MB max
    content: z.string().or(z.instanceof(ArrayBuffer)),
  }),

  // API request validation
  apiRequest: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
    query: z.record(z.string()).optional(),
  }),
};

/**
 * Advanced input sanitization
 */
export class InputSanitizer {
  private readonly dompurify: typeof DOMPurify;
  private readonly sanitizeFn?: (input: string, config?: DOMPurifyConfig) => unknown;
  private readonly config: DOMPurifyConfig;

  constructor(purifier: typeof DOMPurify = DOMPurify) {
    this.dompurify = purifier;
    this.sanitizeFn = this.resolveSanitizeFn(purifier);
    this.config = {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href', 'title'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      SANITIZE_DOM: true,
      KEEP_CONTENT: true,
    };
  }

  private resolveSanitizeFn(
    purifier: unknown,
  ): ((input: string, config?: DOMPurifyConfig) => unknown) | undefined {
    const asDirect = purifier as { sanitize?: (input: string, config?: DOMPurifyConfig) => unknown };
    if (typeof asDirect?.sanitize === 'function') {
      return asDirect.sanitize.bind(asDirect);
    }

    const asDefault = purifier as {
      default?: { sanitize?: (input: string, config?: DOMPurifyConfig) => unknown };
    };
    if (typeof asDefault?.default?.sanitize === 'function') {
      return asDefault.default.sanitize.bind(asDefault.default);
    }

    if (typeof purifier === 'function' && typeof globalThis !== 'undefined') {
      try {
        const factoryResult = (purifier as (w: unknown) => unknown)(
          (globalThis as { window?: unknown }).window ?? globalThis,
        ) as { sanitize?: (input: string, config?: DOMPurifyConfig) => unknown };

        if (typeof factoryResult?.sanitize === 'function') {
          return factoryResult.sanitize.bind(factoryResult);
        }
      } catch {
        // noop - fallback sanitizer will be used
      }
    }

    return undefined;
  }

  private fallbackSanitize(input: string, config?: DOMPurifyConfig): string {
    const allowedTags = new Set((config?.ALLOWED_TAGS || []).map((t) => String(t).toLowerCase()));
    const allowedAttrs = new Set((config?.ALLOWED_ATTR || []).map((a) => String(a).toLowerCase()));

    let output = input;

    // Remove highly dangerous blocks first.
    output = output.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');

    // Remove inline event handlers and javascript: URLs.
    output = output
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');

    // If no tags are allowed, strip all tags.
    if (allowedTags.size === 0) {
      return output.replace(/<[^>]+>/g, '');
    }

    // Keep only allowed tags and allowed attributes.
    output = output.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (match, tagName: string, rawAttrs: string) => {
      const tag = String(tagName).toLowerCase();
      if (!allowedTags.has(tag)) return '';

      if (match.startsWith('</')) {
        return `</${tag}>`;
      }

      const safeAttrs: string[] = [];
      rawAttrs.replace(
        /([a-z0-9-:]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
        (_m: string, attrName: string, attrValue: string) => {
          const attr = String(attrName).toLowerCase();
          if (allowedAttrs.has(attr)) {
            safeAttrs.push(`${attr}=${attrValue}`);
          }
          return '';
        },
      );

      return `<${tag}${safeAttrs.length > 0 ? ` ${safeAttrs.join(' ')}` : ''}>`;
    });

    return output;
  }

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    return this.sanitizeToString(input, this.config);
  }

  /**
   * Sanitize plain text (remove all HTML)
   */
  sanitizeText(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    return this.sanitizeToString(input, { ALLOWED_TAGS: [] });
  }

  /**
   * Sanitize SQL input (basic protection)
   */
  sanitizeSQL(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Remove dangerous SQL patterns
    const dangerous = [
      /('|(\\'))/gi,
      /(;|--|\||\|\||&&)/gi,
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/gi,
      /(\*|%|_)/gi,
    ];

    let sanitized = input;
    dangerous.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
  }

  /**
   * Sanitize file name
   */
  sanitizeFileName(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    return input
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }

  private sanitizeToString(input: string, config?: DOMPurifyConfig): string {
    const result = this.sanitizeFn
      ? this.sanitizeFn(input, config)
      : this.fallbackSanitize(input, config);
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof (result as { toString?: () => string }).toString === 'function') {
      return (result as { toString: () => string }).toString();
    }

    return String(result ?? '');
  }
}

/**
 * Security rule definitions
 */
export interface SecurityRule {
  name: string;
  validator: (value: unknown, context?: unknown) => boolean;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const SecurityRules: Record<string, SecurityRule> = {
  noXSS: {
    name: 'XSS Protection',
    validator: (value: unknown) => {
      if (typeof value !== 'string') return true;
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
      ];
      return !xssPatterns.some((pattern) => pattern.test(value));
    },
    message: 'Potential XSS attack detected',
    severity: 'critical',
  },

  noSQLInjection: {
    name: 'SQL Injection Protection',
    validator: (value: unknown) => {
      if (typeof value !== 'string') return true;
      const sqlPatterns = [
        /('|(\\'))/gi,
        /(;|--|\||\|\||&&)/gi,
        /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/gi,
      ];
      return !sqlPatterns.some((pattern) => pattern.test(value));
    },
    message: 'Potential SQL injection detected',
    severity: 'critical',
  },

  validEmail: {
    name: 'Email Validation',
    validator: (value: unknown) => {
      if (typeof value !== 'string') return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    },
    message: 'Invalid email format',
    severity: 'medium',
  },

  strongPassword: {
    name: 'Strong Password',
    validator: (value: unknown) => {
      if (typeof value !== 'string') return false;
      return (
        value.length >= 8 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /[0-9]/.test(value) &&
        /[^A-Za-z0-9]/.test(value)
      );
    },
    message:
      'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
    severity: 'high',
  },

  noPathTraversal: {
    name: 'Path Traversal Protection',
    validator: (value: unknown) => {
      if (typeof value !== 'string') return true;
      return !/(\.\.\/|\.\.\\)/g.test(value);
    },
    message: 'Path traversal attempt detected',
    severity: 'high',
  },
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitized?: unknown;
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  value?: unknown;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

/**
 * Main Security Validator
 */
export class SecurityValidator {
  private readonly sanitizer: InputSanitizer;
  private readonly customRules: Map<string, SecurityRule>;

  constructor() {
    this.sanitizer = new InputSanitizer();
    this.customRules = new Map();
  }

  /**
   * Add custom validation rule
   */
  addRule(name: string, rule: SecurityRule): void {
    this.customRules.set(name, rule);
  }

  /**
   * Remove custom rule
   */
  removeRule(name: string): void {
    this.customRules.delete(name);
  }

  /**
   * Validate data against schema
   */
  async validateSchema<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    options: {
      sanitize?: boolean;
      strictMode?: boolean;
      customRules?: string[];
    } = {},
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Apply sanitization if requested
      let processedData = data;
      if (options.sanitize && typeof data === 'object' && data !== null) {
        processedData = this.sanitizeObject(data);
        result.sanitized = processedData;
      }

      // Validate against Zod schema
      const parseResult = schema.safeParse(processedData);
      if (!parseResult.success) {
        parseResult.error.errors.forEach((error) => {
          result.errors.push({
            field: error.path.join('.'),
            rule: 'schema',
            message: error.message,
            severity: 'medium',
            value: error.code,
          });
        });
        result.isValid = false;
      }

      // Apply security rules
      if (options.customRules) {
        const securityErrors = this.applySecurityRules(processedData, options.customRules);
        result.errors.push(...securityErrors);
        if (securityErrors.length > 0) {
          result.isValid = false;
        }
      }

      // Apply default security rules in strict mode
      if (options.strictMode) {
        const defaultRules = Object.keys(SecurityRules);
        const strictErrors = this.applySecurityRules(processedData, defaultRules);
        result.errors.push(...strictErrors);
        if (strictErrors.length > 0) {
          result.isValid = false;
        }
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        field: 'root',
        rule: 'validation',
        message: error instanceof Error ? error.message : 'Validation failed',
        severity: 'critical',
      });
    }

    return result;
  }

  /**
   * Quick validation for common use cases
   */
  validateInput(
    value: unknown,
    type: 'email' | 'password' | 'text' | 'html' | 'filename',
    options: { required?: boolean; sanitize?: boolean } = {},
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Check required
    if (options.required && (value === null || value === undefined || value === '')) {
      result.isValid = false;
      result.errors.push({
        field: 'value',
        rule: 'required',
        message: 'Value is required',
        severity: 'medium',
      });
      return result;
    }

    if (value === null || value === undefined) {
      return result;
    }

    // Type-specific validation
    switch (type) {
      case 'email':
        if (SecurityRules.validEmail && !SecurityRules.validEmail.validator(value)) {
          result.isValid = false;
          result.errors.push({
            field: 'value',
            rule: 'validEmail',
            message: SecurityRules.validEmail.message,
            severity: SecurityRules.validEmail.severity,
          });
        }
        break;

      case 'password':
        if (SecurityRules.strongPassword && !SecurityRules.strongPassword.validator(value)) {
          result.isValid = false;
          result.errors.push({
            field: 'value',
            rule: 'strongPassword',
            message: SecurityRules.strongPassword.message,
            severity: SecurityRules.strongPassword.severity,
          });
        }
        break;

      case 'text':
        if (typeof value === 'string') {
          if (options.sanitize) {
            result.sanitized = this.sanitizer.sanitizeText(value);
          }
          // Check for XSS
          if (SecurityRules.noXSS && !SecurityRules.noXSS.validator(value)) {
            result.isValid = false;
            result.errors.push({
              field: 'value',
              rule: 'noXSS',
              message: SecurityRules.noXSS.message,
              severity: SecurityRules.noXSS.severity,
            });
          }
        }
        break;

      case 'html':
        if (typeof value === 'string') {
          if (options.sanitize) {
            result.sanitized = this.sanitizer.sanitizeHTML(value);
          }
        }
        break;

      case 'filename':
        if (typeof value === 'string') {
          if (options.sanitize) {
            result.sanitized = this.sanitizer.sanitizeFileName(value);
          }
          // Check for path traversal
          if (SecurityRules.noPathTraversal && !SecurityRules.noPathTraversal.validator(value)) {
            result.isValid = false;
            result.errors.push({
              field: 'value',
              rule: 'noPathTraversal',
              message: SecurityRules.noPathTraversal.message,
              severity: SecurityRules.noPathTraversal.severity,
            });
          }
        }
        break;
    }

    return result;
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.sanitizer.sanitizeText(obj);
    }

    if (obj instanceof Date) {
      return obj; // Don't sanitize Date objects
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Apply security rules to data
   */
  private applySecurityRules(data: unknown, ruleNames: string[]): ValidationError[] {
    const errors: ValidationError[] = [];

    ruleNames.forEach((ruleName) => {
      const rule = SecurityRules[ruleName] || this.customRules.get(ruleName);
      if (rule && !rule.validator(data)) {
        errors.push({
          field: 'data',
          rule: ruleName,
          message: rule.message,
          severity: rule.severity,
          value: data,
        });
      }
    });

    return errors;
  }
}

/**
 * Security boundary decorator
 */
export function SecurityBoundary(rules: string[] = []) {
  return function (_target: unknown, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const validator = new SecurityValidator();

    descriptor.value = async function (...args: unknown[]) {
      // Validate all arguments
      for (let i = 0; i < args.length; i++) {
        const validation = await validator.validateSchema(args[i], z.unknown(), {
          strictMode: true,
          customRules: rules,
        });

        if (!validation.isValid) {
          throw new SecurityError(
            `Security validation failed for argument ${i}`,
            validation.errors,
          );
        }
      }

      return method.apply(this, args);
    };
  };
}

/**
 * Custom security error
 */
export class SecurityError extends Error {
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[] = []) {
    super(message);
    this.name = 'SecurityError';
    this.errors = errors;
  }
}

/**
 * Default security validator instance
 */
export const defaultValidator = new SecurityValidator();

/**
 * Quick validation functions
 */
export const validate = {
  email: (value: unknown) => defaultValidator.validateInput(value, 'email', { required: true }),
  password: (value: unknown) =>
    defaultValidator.validateInput(value, 'password', { required: true }),
  text: (value: unknown, sanitize = true) =>
    defaultValidator.validateInput(value, 'text', { sanitize }),
  html: (value: unknown, sanitize = true) =>
    defaultValidator.validateInput(value, 'html', { sanitize }),
  filename: (value: unknown, sanitize = true) =>
    defaultValidator.validateInput(value, 'filename', { sanitize }),
};
