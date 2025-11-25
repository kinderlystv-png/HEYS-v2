// filepath: apps/web/src/lib/supabase/__tests__/rls-policies.test.ts
/**
 * Тесты для RLS политик и TypeScript интеграции
 * Проверяет корректность доступа к данным через Supabase RLS
 *
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuditService } from '../audit-service';
import { EncryptedProfileService, encryptedPreferencesService } from '../field-encryption';
import { ProfileService } from '../profile-service';
import {
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  PermissionError,
  RLSError,
  UserRole,
} from '../rls-policies';
import { SessionService } from '../session-service';

// Мокаем Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  or: vi.fn(),
  single: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};

// Мокаем createClientComponentClient
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createClientComponentClient: () => mockSupabaseClient,
}));

describe('RLS Policies - TypeScript Types', () => {
  test('DEFAULT_ROLE_PERMISSIONS содержит все необходимые роли', () => {
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty(UserRole.USER);
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty(UserRole.CURATOR);
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty(UserRole.ADMIN);
    expect(DEFAULT_ROLE_PERMISSIONS).toHaveProperty(UserRole.SUPER_ADMIN);
  });

  test('SUPER_ADMIN имеет все разрешения', () => {
    const superAdminPermissions = DEFAULT_ROLE_PERMISSIONS[UserRole.SUPER_ADMIN];
    const allPermissions = Object.values(Permission);

    expect(superAdminPermissions).toEqual(allPermissions);
  });

  test('USER имеет минимальные разрешения', () => {
    const userPermissions = DEFAULT_ROLE_PERMISSIONS[UserRole.USER];
    expect(userPermissions).toEqual([]);
  });

  test('ADMIN имеет больше разрешений чем CURATOR', () => {
    const adminPermissions = DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN];
    const curatorPermissions = DEFAULT_ROLE_PERMISSIONS[UserRole.CURATOR];

    expect(adminPermissions.length).toBeGreaterThan(curatorPermissions.length);
  });
});

describe('ProfileService - RLS Integration', () => {
  let profileService: ProfileService;

  beforeEach(() => {
    profileService = new ProfileService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getCurrentProfile', () => {
    test('должен получить профиль текущего пользователя', async () => {
      const mockProfile = {
        id: 'profile-1',
        user_id: 'user-1',
        display_name: 'Test User',
        role: 'user',
        permissions: [],
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      // Настраиваем цепочку моков
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await profileService.getCurrentProfile();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.single).toHaveBeenCalled();
      expect(result.data).toEqual(mockProfile);
      expect(result.error).toBeNull();
    });

    test('должен обработать ошибку доступа', async () => {
      const mockError = { code: 'PGRST116', message: 'No rows found' };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await profileService.getCurrentProfile();

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(RLSError);
    });
  });

  describe('getProfileById', () => {
    test('должен вернуть PermissionError для обычного пользователя', async () => {
      const mockError = { code: 'PGRST116', message: 'No rows found' };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await profileService.getProfileById('other-user-id');

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(PermissionError);
    });
  });

  describe('updateProfile', () => {
    test('должен обновить профиль текущего пользователя', async () => {
      const updates = { display_name: 'Updated Name' };
      const mockUpdatedProfile = { id: 'profile-1', ...updates };

      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockUpdatedProfile, error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await profileService.updateProfile(updates);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_profiles');
      expect(mockQuery.update).toHaveBeenCalledWith(updates);
      expect(result.data).toEqual(mockUpdatedProfile);
      expect(result.error).toBeNull();
    });
  });
});

describe('SessionService - RLS Integration', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService();
    vi.clearAllMocks();
  });

  describe('getCurrentUserSessions', () => {
    test('должен получить активные сессии текущего пользователя', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          user_id: 'user-1',
          is_active: true,
          device_type: 'desktop',
          created_at: '2025-01-01',
          last_activity_at: '2025-01-01',
        },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };
      // Настраиваем возврат данных на последнем методе в цепочке
      mockQuery.order.mockResolvedValue({ data: mockSessions, error: null, count: 1 });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await sessionService.getCurrentUserSessions();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_sessions');
      expect(mockQuery.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true);
      expect(mockQuery.order).toHaveBeenCalledWith('last_activity_at', { ascending: false });
      expect(result.data).toEqual(mockSessions);
      expect(result.count).toBe(1);
    });
  });

  describe('terminateCurrentSession', () => {
    test('должен завершить текущую сессию', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      mockQuery.eq.mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await sessionService.terminateCurrentSession();

      expect(mockQuery.update).toHaveBeenCalledWith({
        is_active: false,
        last_activity_at: expect.any(String),
      });
      expect(result.data).toBe(true);
      expect(result.error).toBeNull();
    });
  });
});

describe('AuditService - Logging Integration', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
    vi.clearAllMocks();

    // Мокаем navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Test User Agent',
      configurable: true,
    });
  });

  describe('logAction', () => {
    test('должен записать успешное действие в аудит лог', async () => {
      const mockLogEntry = {
        id: 'log-1',
        action: 'create',
        resource_type: 'user_profile',
        success: true,
        created_at: '2025-01-01',
      };

      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockLogEntry, error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await auditService.logAction('create', 'user_profile', 'profile-1', {
        test: 'metadata',
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('audit_logs');
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resource_type: 'user_profile',
          resource_id: 'profile-1',
          metadata: { test: 'metadata' },
          success: true,
        }),
      );
      expect(result.data).toEqual(mockLogEntry);
    });

    test('должен записать неудачное действие в аудит лог', async () => {
      const mockLogEntry = {
        id: 'log-2',
        action: 'update',
        resource_type: 'user_profile',
        success: false,
        error_message: 'Access denied',
        created_at: '2025-01-01',
      };

      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockLogEntry, error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await auditService.logFailedAction('update', 'user_profile', 'Access denied', {
        attempted_field: 'role',
      });

      expect(result.data).toEqual(mockLogEntry);
      expect(result.error).toBeNull();
    });
  });

  describe('getCurrentUserLogs', () => {
    test('должен получить логи текущего пользователя', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'login',
          resource_type: 'user_session',
          success: true,
          created_at: '2025-01-01',
        },
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      mockQuery.limit.mockResolvedValue({ data: mockLogs, error: null, count: 1 });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await auditService.getCurrentUserLogs(50);

      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(result.data).toEqual(mockLogs);
    });
  });
});

describe('EncryptedProfileService - Field Encryption', () => {
  let encryptedProfileService: EncryptedProfileService;

  beforeEach(() => {
    encryptedProfileService = new EncryptedProfileService();
  });

  describe('encryptProfileData', () => {
    test('должен зашифровать чувствительные поля', async () => {
      const profileData = {
        display_name: 'John Doe',
        phone: '+1234567890',
        first_name: 'John',
        last_name: 'Doe',
        address: {
          street: '123 Main St',
          city: 'New York',
          country: 'USA',
        },
      };

      const result = await encryptedProfileService.encryptProfileData(profileData);

      expect(result.display_name).toBe('John Doe'); // Не зашифрован
      expect(result.phone).toBeUndefined(); // Удален после шифрования
      expect(result.encrypted_phone).toBeDefined(); // Зашифрованная версия
      expect(result.encrypted_phone).toMatch(/^enc:/); // Префикс шифрования
      expect(result.encrypted_first_name).toBeDefined();
      expect(result.encrypted_last_name).toBeDefined();
      expect(result.encrypted_address).toBeDefined();
    });

    test('должен корректно обработать отсутствующие поля', async () => {
      const profileData = {
        display_name: 'Jane Doe',
        // Нет чувствительных полей
      };

      const result = await encryptedProfileService.encryptProfileData(profileData);

      expect(result.display_name).toBe('Jane Doe');
      expect(result.encrypted_phone).toBeUndefined();
      expect(result.encrypted_first_name).toBeUndefined();
    });
  });

  describe('decryptProfileData', () => {
    test('должен расшифровать зашифрованные поля', async () => {
      // Сначала зашифруем данные
      const originalData = {
        phone: '+1234567890',
        first_name: 'John',
      };

      const encrypted = await encryptedProfileService.encryptProfileData(originalData);

      const encryptedProfile = {
        id: 'profile-1',
        user_id: 'user-1',
        display_name: 'John Doe',
        encrypted_phone: encrypted.encrypted_phone,
        encrypted_first_name: encrypted.encrypted_first_name,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      } as any;

      const decrypted = await encryptedProfileService.decryptProfileData(encryptedProfile);

      expect(decrypted.phone).toBe('+1234567890');
      expect(decrypted.first_name).toBe('John');
    });

    test('должен корректно обработать профиль без зашифрованных полей', async () => {
      const encryptedProfile = {
        id: 'profile-1',
        user_id: 'user-1',
        display_name: 'Jane Doe',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      } as any;

      const decrypted = await encryptedProfileService.decryptProfileData(encryptedProfile);

      expect(decrypted.phone).toBeUndefined();
      expect(decrypted.first_name).toBeUndefined();
      expect(Object.keys(decrypted)).toHaveLength(0);
    });
  });
});

describe('EncryptedPreferencesService - Settings Encryption', () => {
  describe('shouldEncryptPreference', () => {
    test('должен определить необходимость шифрования для чувствительных настроек', () => {
      expect(encryptedPreferencesService.shouldEncryptPreference('security', 'backup_email')).toBe(
        true,
      );
      expect(encryptedPreferencesService.shouldEncryptPreference('personal', 'ssn')).toBe(true);
      expect(encryptedPreferencesService.shouldEncryptPreference('payment', 'card_number')).toBe(
        true,
      );
      expect(encryptedPreferencesService.shouldEncryptPreference('medical', 'allergies')).toBe(
        true,
      );
    });

    test('должен определить отсутствие необходимости шифрования для обычных настроек', () => {
      expect(encryptedPreferencesService.shouldEncryptPreference('ui', 'theme')).toBe(false);
      expect(encryptedPreferencesService.shouldEncryptPreference('display', 'language')).toBe(
        false,
      );
      expect(
        encryptedPreferencesService.shouldEncryptPreference('notifications', 'email_enabled'),
      ).toBe(false);
    });
  });

  describe('encryptPreferenceValue', () => {
    test('должен зашифровать значение при необходимости', async () => {
      const value = 'sensitive-data';
      const result = await encryptedPreferencesService.encryptPreferenceValue(value, true);

      expect(result.is_encrypted).toBe(true);
      expect(result.value).toMatch(/^enc:/);
      expect(result.value).not.toBe(value);
    });

    test('должен вернуть незашифрованное значение если шифрование не требуется', async () => {
      const value = 'normal-setting';
      const result = await encryptedPreferencesService.encryptPreferenceValue(value, false);

      expect(result.is_encrypted).toBe(false);
      expect(result.value).toBe(value);
    });

    test('должен зашифровать объекты как JSON', async () => {
      const value = { sensitive: true, data: 'secret' };
      const result = await encryptedPreferencesService.encryptPreferenceValue(value, true);

      expect(result.is_encrypted).toBe(true);
      expect(result.value).toMatch(/^enc:/);
    });
  });

  describe('decryptPreferenceValue', () => {
    test('должен расшифровать зашифрованное значение', async () => {
      const originalValue = 'sensitive-data';

      // Зашифруем
      const encrypted = await encryptedPreferencesService.encryptPreferenceValue(
        originalValue,
        true,
      );

      // Расшифруем
      const decrypted = await encryptedPreferencesService.decryptPreferenceValue(
        encrypted.value,
        encrypted.is_encrypted,
      );

      expect(decrypted).toBe(originalValue);
    });

    test('должен вернуть незашифрованное значение как есть', async () => {
      const value = 'normal-setting';
      const result = await encryptedPreferencesService.decryptPreferenceValue(value, false);

      expect(result).toBe(value);
    });
  });
});

describe('Error Handling', () => {
  test('RLSError должен правильно инициализироваться', () => {
    const error = new RLSError('Test message', 'TEST_CODE', { detail: 'test' });

    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.name).toBe('RLSError');
  });

  test('PermissionError должен правильно инициализироваться', () => {
    const error = new PermissionError(Permission.MANAGE_PROFILES, UserRole.USER);

    expect(error.message).toContain('Недостаточно прав доступа');
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.details?.required_permission).toBe(Permission.MANAGE_PROFILES);
    expect(error.details?.current_role).toBe(UserRole.USER);
    expect(error.name).toBe('PermissionError');
  });
});

describe('Integration Tests', () => {
  test('полный жизненный цикл профиля с шифрованием', async () => {
    const encryptedService = new EncryptedProfileService();

    // 1. Подготавливаем данные с шифрованием
    const profileData = {
      display_name: 'Test User',
      phone: '+1234567890',
      first_name: 'Test',
      theme: 'dark',
    };

    const encryptedData = await encryptedService.encryptProfileData(profileData);

    // 2. Проверяем, что чувствительные данные зашифрованы
    expect(encryptedData.encrypted_phone).toBeDefined();
    expect(encryptedData.encrypted_first_name).toBeDefined();
    expect(encryptedData.phone).toBeUndefined();
    expect(encryptedData.display_name).toBe('Test User'); // Остается как есть

    // 3. Симулируем сохранение и получение из БД
    const mockProfile = {
      id: 'profile-1',
      user_id: 'user-1',
      ...encryptedData,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };

    // 4. Расшифровываем полученные данные
    const decryptedData = await encryptedService.decryptProfileData(mockProfile as any);

    // 5. Проверяем, что данные корректно расшифрованы
    expect(decryptedData.phone).toBe('+1234567890');
    expect(decryptedData.first_name).toBe('Test');
  });
});
