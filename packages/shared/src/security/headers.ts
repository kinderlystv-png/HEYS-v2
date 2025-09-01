/**
 * HEYS Security Headers Manager v1.4
 * Modern security headers and CSP management
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

/**
 * Content Security Policy builder
 */
export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'frame-src'?: string[];
  'worker-src'?: string[];
  'manifest-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
}

export class CSPBuilder {
  public directives: CSPDirectives = {};

  constructor(initialDirectives: CSPDirectives = {}) {
    this.directives = { ...initialDirectives };
  }

  /**
   * Set directive values
   */
  setDirective(directive: keyof CSPDirectives, values: string[] | boolean): this {
    if (typeof values === 'boolean') {
      (this.directives as any)[directive] = values;
    } else {
      (this.directives as any)[directive] = [...values];
    }
    return this;
  }

  /**
   * Add values to existing directive
   */
  addToDirective(directive: keyof CSPDirectives, values: string[]): this {
    if (!this.directives[directive] || typeof this.directives[directive] === 'boolean') {
      (this.directives as any)[directive] = [];
    }
    const existing = this.directives[directive] as string[];
    (this.directives as any)[directive] = [...existing, ...values];
    return this;
  }

  /**
   * Build CSP header value
   */
  build(): string {
    const policies: string[] = [];

    Object.entries(this.directives).forEach(([directive, values]) => {
      if (typeof values === 'boolean' && values) {
        policies.push(directive);
      } else if (Array.isArray(values) && values.length > 0) {
        policies.push(`${directive} ${values.join(' ')}`);
      }
    });

    return policies.join('; ');
  }

  /**
   * Create strict CSP for production
   */
  static strict(): CSPBuilder {
    return new CSPBuilder({
      'default-src': ["'none'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': true,
      'block-all-mixed-content': true,
    });
  }

  /**
   * Create development-friendly CSP
   */
  static development(): CSPBuilder {
    return new CSPBuilder({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'localhost:*'],
      'style-src': ["'self'", "'unsafe-inline'", 'localhost:*'],
      'img-src': ["'self'", 'data:', 'https:', 'localhost:*'],
      'font-src': ["'self'", 'localhost:*'],
      'connect-src': ["'self'", 'localhost:*', 'ws:', 'wss:'],
      'media-src': ["'self'", 'localhost:*'],
      'object-src': ["'none'"],
      'frame-src': ["'self'", 'localhost:*'],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    });
  }
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  // Content Security Policy
  csp?: CSPDirectives;

  // HTTP Strict Transport Security
  hsts?:
    | {
        maxAge?: number;
        includeSubDomains?: boolean;
        preload?: boolean;
      }
    | false;

  // X-Frame-Options
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;

  // X-Content-Type-Options
  contentTypeOptions?: boolean;

  // X-XSS-Protection (legacy)
  xssProtection?: boolean;

  // Referrer Policy
  referrerPolicy?:
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url';

  // Permissions Policy
  permissionsPolicy?: Record<string, string[]>;

  // Cross-Origin policies
  crossOriginEmbedderPolicy?: 'unsafe-none' | 'require-corp';
  crossOriginOpenerPolicy?: 'unsafe-none' | 'same-origin-allow-popups' | 'same-origin';
  crossOriginResourcePolicy?: 'same-site' | 'same-origin' | 'cross-origin';
}

/**
 * Security Headers Manager
 */
export class SecurityHeadersManager {
  private config: SecurityHeadersConfig;
  private isDevelopment: boolean;

  constructor(config: SecurityHeadersConfig = {}, isDevelopment = false) {
    this.config = config;
    this.isDevelopment = isDevelopment;
  }

  /**
   * Generate all security headers
   */
  generateHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Content Security Policy
    if (this.config.csp) {
      const csp = new CSPBuilder(this.config.csp);
      headers['Content-Security-Policy'] = csp.build();
    } else {
      // Default CSP based on environment
      const defaultCSP = this.isDevelopment ? CSPBuilder.development() : CSPBuilder.strict();
      headers['Content-Security-Policy'] = defaultCSP.build();
    }

    // HTTP Strict Transport Security
    if (this.config.hsts !== false && !this.isDevelopment) {
      const hsts = this.config.hsts || {};
      const maxAge = hsts.maxAge || 31536000; // 1 year
      let hstsValue = `max-age=${maxAge}`;

      if (hsts.includeSubDomains !== false) {
        hstsValue += '; includeSubDomains';
      }

      if (hsts.preload) {
        hstsValue += '; preload';
      }

      headers['Strict-Transport-Security'] = hstsValue;
    }

    // X-Frame-Options
    headers['X-Frame-Options'] = this.config.frameOptions || 'DENY';

    // X-Content-Type-Options
    if (this.config.contentTypeOptions !== false) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    if (this.config.xssProtection !== false) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    // Referrer Policy
    headers['Referrer-Policy'] = this.config.referrerPolicy || 'strict-origin-when-cross-origin';

    // Permissions Policy
    if (this.config.permissionsPolicy) {
      const policies = Object.entries(this.config.permissionsPolicy)
        .map(([feature, allowlist]) => `${feature}=(${allowlist.join(' ')})`)
        .join(', ');
      headers['Permissions-Policy'] = policies;
    } else {
      // Default restrictive permissions
      headers['Permissions-Policy'] = [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'accelerometer=()',
        'gyroscope=()',
      ].join(', ');
    }

    // Cross-Origin policies
    headers['Cross-Origin-Embedder-Policy'] =
      this.config.crossOriginEmbedderPolicy || 'unsafe-none';
    headers['Cross-Origin-Opener-Policy'] =
      this.config.crossOriginOpenerPolicy || 'same-origin-allow-popups';
    headers['Cross-Origin-Resource-Policy'] =
      this.config.crossOriginResourcePolicy || 'same-origin';

    return headers;
  }

  /**
   * Apply headers to Express response
   */
  applyToResponse(res: any): void {
    const headers = this.generateHeaders();
    Object.entries(headers).forEach(([name, value]) => {
      res.setHeader(name, value);
    });
  }

  /**
   * Get headers for Fetch API
   */
  getFetchHeaders(): Headers {
    const headers = new Headers();
    const securityHeaders = this.generateHeaders();

    Object.entries(securityHeaders).forEach(([name, value]) => {
      headers.set(name, value);
    });

    return headers;
  }

  /**
   * Validate CSP against common mistakes
   */
  validateCSP(): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const csp = this.config.csp || {};

    // Check for unsafe directives
    Object.entries(csp).forEach(([directive, values]) => {
      if (Array.isArray(values)) {
        if (values.includes("'unsafe-inline'")) {
          warnings.push(`${directive} allows 'unsafe-inline' which can enable XSS attacks`);
        }

        if (values.includes("'unsafe-eval'")) {
          warnings.push(`${directive} allows 'unsafe-eval' which can enable code injection`);
        }

        if (values.includes('*')) {
          warnings.push(`${directive} allows wildcard (*) which is overly permissive`);
        }
      }
    });

    // Check for missing important directives
    if (!csp['default-src'] && !csp['script-src']) {
      errors.push('Missing script-src directive - scripts can be loaded from anywhere');
    }

    if (!csp['object-src']) {
      warnings.push('Consider setting object-src to prevent plugin injection');
    }

    if (!csp['base-uri']) {
      warnings.push('Consider setting base-uri to prevent base tag injection');
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Create security headers for different environments
   */
  static forEnvironment(
    env: 'development' | 'staging' | 'production',
    customConfig: SecurityHeadersConfig = {},
  ): SecurityHeadersManager {
    const baseConfigs: Record<string, SecurityHeadersConfig> = {
      development: {
        csp: CSPBuilder.development().directives,
        hsts: false,
        frameOptions: 'SAMEORIGIN',
      },
      staging: {
        csp: CSPBuilder.strict().addToDirective('script-src', ['staging.example.com']).directives,
        frameOptions: 'DENY',
      },
      production: {
        csp: CSPBuilder.strict().directives,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        frameOptions: 'DENY',
      },
    };

    const config = { ...baseConfigs[env], ...customConfig };
    return new SecurityHeadersManager(config, env === 'development');
  }
}

/**
 * CORS configuration
 */
export interface CORSConfig {
  origin?: string | string[] | boolean | ((origin: string | undefined) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * CORS manager for secure cross-origin requests
 */
export class CORSManager {
  private config: CORSConfig;

  constructor(config: CORSConfig = {}) {
    this.config = {
      origin: false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: [],
      credentials: false,
      maxAge: 86400, // 24 hours
      optionsSuccessStatus: 204,
      ...config,
    };
  }

  /**
   * Check if origin is allowed
   */
  isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true; // Same-origin requests

    if (typeof this.config.origin === 'boolean') {
      return this.config.origin;
    }

    if (typeof this.config.origin === 'string') {
      return this.config.origin === origin;
    }

    if (Array.isArray(this.config.origin)) {
      return this.config.origin.includes(origin);
    }

    if (typeof this.config.origin === 'function') {
      return this.config.origin(origin);
    }

    return false;
  }

  /**
   * Generate CORS headers
   */
  generateHeaders(origin?: string): Record<string, string> {
    const headers: Record<string, string> = {};

    // Access-Control-Allow-Origin
    if (this.isOriginAllowed(origin)) {
      if (this.config.credentials) {
        headers['Access-Control-Allow-Origin'] = origin || '*';
      } else {
        headers['Access-Control-Allow-Origin'] = '*';
      }
    }

    // Access-Control-Allow-Methods
    if (this.config.methods && this.config.methods.length > 0) {
      headers['Access-Control-Allow-Methods'] = this.config.methods.join(', ');
    }

    // Access-Control-Allow-Headers
    if (this.config.allowedHeaders && this.config.allowedHeaders.length > 0) {
      headers['Access-Control-Allow-Headers'] = this.config.allowedHeaders.join(', ');
    }

    // Access-Control-Expose-Headers
    if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
      headers['Access-Control-Expose-Headers'] = this.config.exposedHeaders.join(', ');
    }

    // Access-Control-Allow-Credentials
    if (this.config.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    // Access-Control-Max-Age
    if (this.config.maxAge !== undefined) {
      headers['Access-Control-Max-Age'] = this.config.maxAge.toString();
    }

    return headers;
  }

  /**
   * Create secure CORS configuration
   */
  static secure(allowedOrigins: string[]): CORSManager {
    return new CORSManager({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400,
    });
  }

  /**
   * Create development CORS configuration
   */
  static development(): CORSManager {
    return new CORSManager({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['*'],
      credentials: true,
    });
  }
}

/**
 * Default security headers manager instance
 */
export const defaultSecurityHeaders = SecurityHeadersManager.forEnvironment(
  process.env.NODE_ENV === 'production' ? 'production' : 'development',
);

/**
 * Default CORS manager instance
 */
export const defaultCORS =
  process.env.NODE_ENV === 'production' ? CORSManager.secure([]) : CORSManager.development();
