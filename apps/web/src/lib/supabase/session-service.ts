// filepath: apps/web/src/lib/supabase/session-service.ts
/**
 * Сервис для работы с пользовательскими сессиями через RLS политики
 * Обеспечивает безопасный мониторинг и управление активными сессиями
 *
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import {
  CreateUserSession,
  DatabaseListResponse,
  DatabaseResponse,
  Permission,
  PermissionError,
  RLSError,
  SessionFilter,
  UpdateUserSession,
  UserSession,
} from './rls-policies';

export class SessionService {
  private supabase = createClientComponentClient();

  // ==================== УПРАВЛЕНИЕ СЕССИЯМИ ====================

  /**
   * Получить все активные сессии текущего пользователя
   */
  async getCurrentUserSessions(): Promise<DatabaseListResponse<UserSession>> {
    try {
      const { data, error, count } = await this.supabase
        .from('user_sessions')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false });

      if (error) {
        throw new RLSError('Ошибка получения сессий', 'SESSIONS_FETCH_ERROR', { error });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0,
      };
    }
  }

  /**
   * Получить сессии с фильтрацией (только для администраторов)
   */
  async getSessions(filter?: SessionFilter): Promise<DatabaseListResponse<UserSession>> {
    try {
      let query = this.supabase.from('user_sessions').select('*', { count: 'exact' });

      // Применяем фильтры
      if (filter) {
        if (filter.user_id) {
          query = query.eq('user_id', filter.user_id);
        }
        if (filter.is_active !== undefined) {
          query = query.eq('is_active', filter.is_active);
        }
        if (filter.is_suspicious !== undefined) {
          query = query.eq('is_suspicious', filter.is_suspicious);
        }
        if (filter.device_type) {
          query = query.eq('device_type', filter.device_type);
        }
        if (filter.created_after) {
          query = query.gte('created_at', filter.created_after);
        }
        if (filter.expires_before) {
          query = query.lte('expires_at', filter.expires_before);
        }
      }

      // Сортировка по последней активности
      query = query.order('last_activity_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_ALL_SESSIONS);
        }
        throw new RLSError('Ошибка получения сессий', 'SESSIONS_FETCH_ERROR', { error });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0,
      };
    }
  }

  /**
   * Получить конкретную сессию по ID
   */
  async getSessionById(id: string): Promise<DatabaseResponse<UserSession>> {
    try {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_ALL_SESSIONS);
        }
        throw new RLSError('Ошибка получения сессии', 'SESSION_FETCH_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Создать новую сессию
   */
  async createSession(sessionData: CreateUserSession): Promise<DatabaseResponse<UserSession>> {
    try {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .insert({
          ...sessionData,
          created_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка создания сессии', 'SESSION_CREATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Обновить текущую сессию
   */
  async updateCurrentSession(
    updates: Partial<UpdateUserSession>,
  ): Promise<DatabaseResponse<UserSession>> {
    try {
      // Обновляем время последней активности
      const updatesWithActivity = {
        ...updates,
        last_activity_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from('user_sessions')
        .update(updatesWithActivity)
        .eq('is_active', true)
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка обновления сессии', 'SESSION_UPDATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Обновить сессию по ID (только для администраторов)
   */
  async updateSessionById(
    id: string,
    updates: UpdateUserSession,
  ): Promise<DatabaseResponse<UserSession>> {
    try {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.MANAGE_SESSIONS);
        }
        throw new RLSError('Ошибка обновления сессии', 'SESSION_UPDATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  // ==================== БЕЗОПАСНОСТЬ СЕССИЙ ====================

  /**
   * Завершить текущую сессию
   */
  async terminateCurrentSession(): Promise<DatabaseResponse<boolean>> {
    try {
      const { error } = await this.supabase
        .from('user_sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .eq('is_active', true);

      if (error) {
        throw new RLSError('Ошибка завершения сессии', 'SESSION_TERMINATE_ERROR', { error });
      }

      return { data: true, error: null };
    } catch (error) {
      return {
        data: false,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Завершить сессию по ID (только для администраторов)
   */
  async terminateSessionById(id: string): Promise<DatabaseResponse<boolean>> {
    try {
      const { error } = await this.supabase
        .from('user_sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.MANAGE_SESSIONS);
        }
        throw new RLSError('Ошибка завершения сессии', 'SESSION_TERMINATE_ERROR', { error });
      }

      return { data: true, error: null };
    } catch (error) {
      return {
        data: false,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Завершить все другие сессии (кроме текущей)
   */
  async terminateOtherSessions(currentSessionId: string): Promise<DatabaseResponse<number>> {
    try {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .neq('id', currentSessionId)
        .eq('is_active', true)
        .select('id');

      if (error) {
        throw new RLSError('Ошибка завершения сессий', 'SESSIONS_TERMINATE_ERROR', { error });
      }

      return { data: data?.length || 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Отметить сессию как подозрительную
   */
  async markSessionSuspicious(id: string, flags: string[]): Promise<DatabaseResponse<UserSession>> {
    return this.updateSessionById(id, {
      is_suspicious: true,
      security_flags: flags,
    });
  }

  /**
   * Очистить флаги безопасности сессии
   */
  async clearSessionFlags(id: string): Promise<DatabaseResponse<UserSession>> {
    return this.updateSessionById(id, {
      is_suspicious: false,
      security_flags: [],
    });
  }

  // ==================== АНАЛИТИКА И МОНИТОРИНГ ====================

  /**
   * Получить статистику активных сессий
   */
  async getActiveSessionsStats(): Promise<
    DatabaseResponse<{
      total: number;
      by_device: Record<string, number>;
      by_country: Record<string, number>;
      suspicious: number;
    }>
  > {
    try {
      const { data: sessions, error } = await this.supabase
        .from('user_sessions')
        .select('device_type, country, is_suspicious')
        .eq('is_active', true);

      if (error) {
        throw new RLSError('Ошибка получения статистики', 'STATS_FETCH_ERROR', { error });
      }

      const stats = {
        total: sessions?.length || 0,
        by_device: {} as Record<string, number>,
        by_country: {} as Record<string, number>,
        suspicious: 0,
      };

      sessions?.forEach((session) => {
        // Статистика по устройствам
        if (session.device_type) {
          stats.by_device[session.device_type] = (stats.by_device[session.device_type] || 0) + 1;
        }

        // Статистика по странам
        if (session.country) {
          stats.by_country[session.country] = (stats.by_country[session.country] || 0) + 1;
        }

        // Подозрительные сессии
        if (session.is_suspicious) {
          stats.suspicious++;
        }
      });

      return { data: stats, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  /**
   * Получить сессии, которые скоро истекут
   */
  async getExpiringSessions(
    hoursBeforeExpiry: number = 24,
  ): Promise<DatabaseListResponse<UserSession>> {
    try {
      const expiryThreshold = new Date();
      expiryThreshold.setHours(expiryThreshold.getHours() + hoursBeforeExpiry);

      const { data, error, count } = await this.supabase
        .from('user_sessions')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .not('expires_at', 'is', null)
        .lte('expires_at', expiryThreshold.toISOString())
        .order('expires_at', { ascending: true });

      if (error) {
        throw new RLSError('Ошибка получения истекающих сессий', 'EXPIRING_SESSIONS_ERROR', {
          error,
        });
      }

      return { data, error: null, count: count || 0 };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
        count: 0,
      };
    }
  }

  /**
   * Автоматическая очистка неактивных сессий
   */
  async cleanupInactiveSessions(inactivityDays: number = 30): Promise<DatabaseResponse<number>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);

      const { data, error } = await this.supabase
        .from('user_sessions')
        .delete()
        .or(`is_active.eq.false,last_activity_at.lte.${cutoffDate.toISOString()}`)
        .select('id');

      if (error) {
        throw new RLSError('Ошибка очистки сессий', 'SESSIONS_CLEANUP_ERROR', { error });
      }

      return { data: data?.length || 0, error: null };
    } catch (error) {
      return {
        data: 0,
        error: error instanceof Error ? error : new Error('Неизвестная ошибка'),
      };
    }
  }

  // ==================== UTILITY МЕТОДЫ ====================

  /**
   * Обновить активность текущей сессии
   */
  async updateActivity(): Promise<void> {
    try {
      await this.updateCurrentSession({});
    } catch {
      // Игнорируем ошибки обновления активности
    }
  }

  /**
   * Проверить является ли сессия текущей
   */
  async isCurrentSession(sessionId: string): Promise<boolean> {
    try {
      const { data } = await this.supabase
        .from('user_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('is_active', true)
        .single();

      return !!data;
    } catch {
      return false;
    }
  }
}
