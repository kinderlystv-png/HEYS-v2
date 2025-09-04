// filepath: apps/web/src/lib/supabase/profile-service.ts
/**
 * Сервис для работы с профилями пользователей через RLS политики
 * Обеспечивает безопасный доступ к пользовательским данным
 * 
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  UserProfile,
  CreateUserProfile,
  UpdateUserProfile,
  UserPreference,
  CreateUserPreference,
  ProfileFilter,
  DatabaseResponse,
  DatabaseListResponse,
  UserRole,
  Permission,
  RLSError,
  PermissionError
} from './rls-policies';

export class ProfileService {
  private supabase = createClientComponentClient();

  // ==================== ПРОФИЛИ ====================

  /**
   * Получить текущий профиль пользователя
   * Автоматически использует auth.uid() через RLS
   */
  async getCurrentProfile(): Promise<DatabaseResponse<UserProfile>> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .single();

      if (error) {
        throw new RLSError('Ошибка получения профиля', 'PROFILE_FETCH_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Получить профиль по ID (только для администраторов)
   */
  async getProfileById(id: string): Promise<DatabaseResponse<UserProfile>> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_ALL_PROFILES);
        }
        throw new RLSError('Ошибка получения профиля', 'PROFILE_FETCH_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Получить список профилей с фильтрацией (только для администраторов)
   */
  async getProfiles(filter?: ProfileFilter): Promise<DatabaseListResponse<UserProfile>> {
    try {
      let query = this.supabase
        .from('user_profiles')
        .select('*', { count: 'exact' });

      // Применяем фильтры
      if (filter) {
        if (filter.role) {
          query = query.eq('role', filter.role);
        }
        if (filter.is_active !== undefined) {
          query = query.eq('is_active', filter.is_active);
        }
        if (filter.is_verified !== undefined) {
          query = query.eq('is_verified', filter.is_verified);
        }
        if (filter.is_suspended !== undefined) {
          query = query.eq('is_suspended', filter.is_suspended);
        }
        if (filter.created_after) {
          query = query.gte('created_at', filter.created_after);
        }
        if (filter.created_before) {
          query = query.lte('created_at', filter.created_before);
        }
        if (filter.last_activity_after) {
          query = query.gte('last_activity_at', filter.last_activity_after);
        }
        if (filter.search) {
          query = query.or(`display_name.ilike.%${filter.search}%,first_name.ilike.%${filter.search}%,last_name.ilike.%${filter.search}%`);
        }
      }

      const { data, error, count } = await query;

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_ALL_PROFILES);
        }
        throw new RLSError('Ошибка получения списка профилей', 'PROFILES_FETCH_ERROR', { error });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0
      };
    }
  }

  /**
   * Создать новый профиль
   */
  async createProfile(profile: CreateUserProfile): Promise<DatabaseResponse<UserProfile>> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .insert(profile)
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка создания профиля', 'PROFILE_CREATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Обновить текущий профиль
   */
  async updateProfile(updates: UpdateUserProfile): Promise<DatabaseResponse<UserProfile>> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update(updates)
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка обновления профиля', 'PROFILE_UPDATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Обновить профиль по ID (только для администраторов)
   */
  async updateProfileById(id: string, updates: UpdateUserProfile): Promise<DatabaseResponse<UserProfile>> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.MANAGE_PROFILES);
        }
        throw new RLSError('Ошибка обновления профиля', 'PROFILE_UPDATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  // ==================== НАСТРОЙКИ ====================

  /**
   * Получить все настройки текущего пользователя
   */
  async getUserPreferences(): Promise<DatabaseListResponse<UserPreference>> {
    try {
      const { data, error, count } = await this.supabase
        .from('user_preferences')
        .select('*', { count: 'exact' })
        .order('category', { ascending: true })
        .order('key', { ascending: true });

      if (error) {
        throw new RLSError('Ошибка получения настроек', 'PREFERENCES_FETCH_ERROR', { error });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0
      };
    }
  }

  /**
   * Получить настройки по категории
   */
  async getPreferencesByCategory(category: string): Promise<DatabaseListResponse<UserPreference>> {
    try {
      const { data, error, count } = await this.supabase
        .from('user_preferences')
        .select('*', { count: 'exact' })
        .eq('category', category)
        .order('key', { ascending: true });

      if (error) {
        throw new RLSError('Ошибка получения настроек категории', 'PREFERENCES_FETCH_ERROR', { error });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0
      };
    }
  }

  /**
   * Получить конкретную настройку
   */
  async getPreference(category: string, key: string): Promise<DatabaseResponse<UserPreference>> {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .select('*')
        .eq('category', category)
        .eq('key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: null }; // Настройка не найдена - это нормально
        }
        throw new RLSError('Ошибка получения настройки', 'PREFERENCE_FETCH_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Установить значение настройки
   */
  async setPreference(preference: CreateUserPreference): Promise<DatabaseResponse<UserPreference>> {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .upsert(preference, {
          onConflict: 'user_id,category,key'
        })
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка установки настройки', 'PREFERENCE_SET_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Удалить настройку
   */
  async deletePreference(category: string, key: string): Promise<DatabaseResponse<boolean>> {
    try {
      const { error } = await this.supabase
        .from('user_preferences')
        .delete()
        .eq('category', category)
        .eq('key', key);

      if (error) {
        throw new RLSError('Ошибка удаления настройки', 'PREFERENCE_DELETE_ERROR', { error });
      }

      return { data: true, error: null };
    } catch (error) {
      return { 
        data: false, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  // ==================== БЕЗОПАСНОСТЬ ====================

  /**
   * Проверить текущую роль пользователя
   */
  async getCurrentUserRole(): Promise<UserRole | null> {
    try {
      const { data } = await this.getCurrentProfile();
      return (data?.role as UserRole) || null;
    } catch {
      return null;
    }
  }

  /**
   * Проверить наличие разрешения у текущего пользователя
   */
  async hasPermission(permission: Permission): Promise<boolean> {
    try {
      const { data } = await this.getCurrentProfile();
      if (!data) return false;
      
      return data.permissions.includes(permission);
    } catch {
      return false;
    }
  }

  /**
   * Установить 2FA для текущего пользователя
   */
  async enableTwoFactor(secret: string, backupCodes: string[]): Promise<DatabaseResponse<UserProfile>> {
    return this.updateProfile({
      two_factor_enabled: true,
      two_factor_secret: secret,
      backup_codes: backupCodes
    });
  }

  /**
   * Отключить 2FA для текущего пользователя
   */
  async disableTwoFactor(): Promise<DatabaseResponse<UserProfile>> {
    return this.updateProfile({
      two_factor_enabled: false,
      two_factor_secret: null,
      backup_codes: null
    });
  }

  /**
   * Обновить последнюю активность
   */
  async updateLastActivity(): Promise<void> {
    try {
      await this.updateProfile({
        last_activity_at: new Date().toISOString()
      });
    } catch {
      // Игнорируем ошибки обновления активности
    }
  }

  /**
   * Заблокировать пользователя (только для администраторов)
   */
  async suspendUser(userId: string, reason: string, until?: string): Promise<DatabaseResponse<UserProfile>> {
    const updates: UpdateUserProfile = {
      is_suspended: true,
      suspension_reason: reason
    };
    if (until) {
      updates.suspension_until = until;
    }
    return this.updateProfileById(userId, updates);
  }

  /**
   * Разблокировать пользователя (только для администраторов)
   */
  async unsuspendUser(userId: string): Promise<DatabaseResponse<UserProfile>> {
    return this.updateProfileById(userId, {
      is_suspended: false,
      suspension_reason: null,
      suspension_until: null
    });
  }
}
