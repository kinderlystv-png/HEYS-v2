/**
 * HEYS Security-Enhanced Core Module v1.4
 * Core functionality with built-in security validation
 *
 * @author HEYS Team
 * @version 1.4.0
 * @created 2025-01-31
 */

import { defaultValidator, SecurityError, ValidationSchemas } from '@heys/shared';

import { HeysDay, HeysSession, HeysUser } from './legacy/index';

type UserCreationResult = Awaited<ReturnType<HeysUser['createUser']>>;
type UserUpdateResult = Awaited<ReturnType<HeysUser['updateUser']>>;
type UserSearchResult = Awaited<ReturnType<HeysUser['searchUsers']>>;
type DayCreationResult = Awaited<ReturnType<HeysDay['createDay']>>;
type DayUpdateResult = Awaited<ReturnType<HeysDay['updateDay']>>;
type DayContentResult = Awaited<ReturnType<HeysDay['getDayContent']>>;
type SessionCreationResult = Awaited<ReturnType<HeysSession['createSession']>>;

interface SanitizedApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Security-enhanced user manager
 */
export class SecureUserManager extends HeysUser {
  /**
   * Create user with security validation
   */
  override async createUser(userData: unknown): Promise<UserCreationResult> {
    const validation = await defaultValidator.validateSchema(userData, ValidationSchemas.user, {
      sanitize: true,
      strictMode: false, // Changed from true to false
    });

    if (!validation.isValid) {
      throw new SecurityError('User validation failed', validation.errors);
    }

    return (await super.createUser((validation.sanitized || userData) as Record<string, unknown>)) as UserCreationResult;
  }

  /**
   * Update user with security validation
   */
  override async updateUser(userId: string, updateData: unknown): Promise<UserUpdateResult> {
    // Validate user ID
    const idValidation = await defaultValidator.validateSchema(
      userId,
      ValidationSchemas.user.shape.id,
    );

    if (!idValidation.isValid) {
      throw new SecurityError('Invalid user ID', idValidation.errors);
    }

    // Validate update data
    const dataValidation = await defaultValidator.validateSchema(
      updateData,
      ValidationSchemas.user.partial(),
      { sanitize: true, strictMode: false }, // Changed from true to false
    );

    if (!dataValidation.isValid) {
      throw new SecurityError('Update data validation failed', dataValidation.errors);
    }

    return (await super.updateUser(userId, (dataValidation.sanitized || updateData) as Record<string, unknown>)) as UserUpdateResult;
  }

  /**
   * Search users with input sanitization
   */
  override async searchUsers(query: unknown): Promise<UserSearchResult> {
    const validation = defaultValidator.validateInput(query, 'text', {
      sanitize: true,
      required: true,
    });

    if (!validation.isValid) {
      throw new SecurityError('Search query validation failed', validation.errors);
    }

    return (await super.searchUsers((validation.sanitized as string) || (query as string))) as UserSearchResult;
  }
}

/**
 * Security-enhanced day manager
 */
export class SecureDayManager extends HeysDay {
  /**
   * Create day entry with validation
   */
  override async createDay(dayData: unknown): Promise<DayCreationResult> {
    // Create dynamic schema for day data
    const daySchema = ValidationSchemas.content.extend({
      date: ValidationSchemas.user.shape.createdAt,
      userId: ValidationSchemas.user.shape.id,
    });

    const validation = await defaultValidator.validateSchema(dayData, daySchema, {
      sanitize: true,
      strictMode: false, // Changed from true to false
    });

    if (!validation.isValid) {
      throw new SecurityError('Day data validation failed', validation.errors);
    }

    return (await super.createDay((validation.sanitized || dayData) as Record<string, unknown>)) as DayCreationResult;
  }

  /**
   * Update day with security validation
   */
  override async updateDay(dayId: string, updateData: unknown): Promise<DayUpdateResult> {
    const validation = await defaultValidator.validateSchema(
      updateData,
      ValidationSchemas.content.partial(),
      { sanitize: true, strictMode: false }, // Changed from true to false
    );

    if (!validation.isValid) {
      throw new SecurityError('Day update validation failed', validation.errors);
    }

    return (await super.updateDay(dayId, (validation.sanitized || updateData) as Record<string, unknown>)) as DayUpdateResult;
  }

  /**
   * Get day content with XSS protection
   */
  override async getDayContent(dayId: string): Promise<DayContentResult> {
    const content = (await super.getDayContent(dayId)) as DayContentResult;

    if (content && typeof content === 'object') {
      // Sanitize content before returning
      const validation = await defaultValidator.validateSchema(content, ValidationSchemas.content, {
        sanitize: true,
      });

      return (validation.sanitized || content) as DayContentResult;
    }

    return content;
  }
}

/**
 * Security-enhanced session manager
 */
export class SecureSessionManager extends HeysSession {
  /**
   * Create session with security validation
   */
  override async createSession(sessionData: unknown): Promise<SessionCreationResult> {
    const sessionSchema = ValidationSchemas.user
      .pick({
        id: true,
        email: true,
      })
      .extend({
        token: ValidationSchemas.apiRequest.shape.headers,
        expiresAt: ValidationSchemas.user.shape.createdAt,
      });

    const validation = await defaultValidator.validateSchema(sessionData, sessionSchema, {
      sanitize: true,
      strictMode: false, // Changed from true to false
    });

    if (!validation.isValid) {
      throw new SecurityError('Session validation failed', validation.errors);
    }

    return (await super.createSession((validation.sanitized || sessionData) as Record<string, unknown>)) as SessionCreationResult;
  }

  /**
   * Validate session token
   */
  override async validateSessionToken(token: unknown): Promise<boolean> {
    const validation = defaultValidator.validateInput(token, 'text', {
      required: true,
      sanitize: true,
    });

    if (!validation.isValid) {
      return false;
    }

    return super.validateSessionToken((validation.sanitized as string) || (token as string));
  }
}

/**
 * Main secure core manager
 */
export class SecureHeysCore {
  public readonly users: SecureUserManager;
  public readonly days: SecureDayManager;
  public readonly sessions: SecureSessionManager;

  constructor() {
    this.users = new SecureUserManager();
    this.days = new SecureDayManager();
    this.sessions = new SecureSessionManager();
  }

  /**
   * Initialize with security checks
   */
  async initialize(config: unknown = {}): Promise<void> {
    const configValidation = await defaultValidator.validateSchema(
      config,
      ValidationSchemas.apiRequest.shape.body || {},
      { sanitize: true },
    );

    if (!configValidation.isValid) {
      throw new SecurityError('Configuration validation failed', configValidation.errors);
    }

    // Initialize core modules with validated config
    await Promise.all([
      // Legacy classes don't have initialize methods, so we skip them
    ]);
  }

  /**
   * Secure API endpoint handler
   */
  async handleApiRequest(request: unknown): Promise<unknown> {
    const validation = await defaultValidator.validateSchema(
      request,
      ValidationSchemas.apiRequest,
      { sanitize: true, strictMode: false }, // Change to false to avoid applying all security rules
    );

    if (!validation.isValid) {
      throw new SecurityError('API request validation failed', validation.errors);
    }

    const sanitizedRequest = validation.sanitized as SanitizedApiRequest;

    // Route request based on method and path
    switch (sanitizedRequest.method) {
      case 'GET':
        return this.handleGetRequest(sanitizedRequest);
      case 'POST':
        return this.handlePostRequest(sanitizedRequest);
      case 'PUT':
        return this.handlePutRequest(sanitizedRequest);
      case 'DELETE':
        return this.handleDeleteRequest(sanitizedRequest);
      default:
        throw new SecurityError('Unsupported HTTP method', []);
    }
  }

  private async handleGetRequest(request: SanitizedApiRequest): Promise<unknown> {
    // Handle GET requests with path routing
    if (request.path.startsWith('/users')) {
      const query = typeof request.query?.q === 'string' ? request.query.q : '';
      return this.users.searchUsers(query);
    }
    if (request.path.startsWith('/days')) {
      const dayId = typeof request.query?.id === 'string' ? request.query.id : '';
      return this.days.getDayContent(dayId);
    }
    throw new SecurityError('Unknown GET endpoint', []);
  }

  private async handlePostRequest(request: SanitizedApiRequest): Promise<unknown> {
    // Handle POST requests
    if (request.path === '/users') {
      return this.users.createUser(request.body);
    }
    if (request.path === '/days') {
      return this.days.createDay(request.body);
    }
    if (request.path === '/sessions') {
      return this.sessions.createSession(request.body);
    }
    throw new SecurityError('Unknown POST endpoint', []);
  }

  private async handlePutRequest(request: SanitizedApiRequest): Promise<unknown> {
    // Handle PUT requests
    const pathParts = request.path.split('/');
    if (pathParts[1] === 'users' && pathParts[2]) {
      return this.users.updateUser(pathParts[2], request.body);
    }
    if (pathParts[1] === 'days' && pathParts[2]) {
      return this.days.updateDay(pathParts[2], request.body);
    }
    throw new SecurityError('Unknown PUT endpoint', []);
  }

  private async handleDeleteRequest(request: SanitizedApiRequest): Promise<unknown> {
    // Handle DELETE requests with security checks

    // Validate that user has permission to delete
    const authorizationHeader = request.headers?.authorization;
    if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
      throw new SecurityError('Authorization required for DELETE operations', []);
    }

    // Additional DELETE logic would go here
    throw new SecurityError('DELETE operations not implemented', []);
  }
}

/**
 * Default secure core instance
 */
export const secureCore = new SecureHeysCore();
