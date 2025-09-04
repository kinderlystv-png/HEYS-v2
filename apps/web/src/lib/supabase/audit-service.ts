// filepath: apps/web/src/lib/supabase/audit-service.ts
/**
 * Сервис для работы с логами аудита через RLS политики
 * Обеспечивает безопасное логирование и просмотр действий пользователей
 * 
 * @created КТ3 - Supabase Security
 * @author HEYS Security Team
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  AuditLog,
  AuditLogFilter,
  DatabaseResponse,
  DatabaseListResponse,
  Permission,
  RLSError,
  PermissionError
} from './rls-policies';

export class AuditService {
  private supabase = createClientComponentClient();

  // ==================== СОЗДАНИЕ ЛОГОВ ====================

  /**
   * Записать действие в лог аудита
   */
  async logAction(
    action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout',
    resourceType: string,
    resourceId?: string,
    metadata: Record<string, any> = {},
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>
  ): Promise<DatabaseResponse<AuditLog>> {
    try {
      const logEntry: Omit<AuditLog, 'id' | 'created_at'> = {
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        metadata,
        old_values: oldValues || null,
        new_values: newValues || null,
        success: true,
        ip_address: await this.getCurrentIP(),
        user_agent: navigator.userAgent,
        request_id: this.generateRequestId()
      };

      const { data, error } = await this.supabase
        .from('audit_logs')
        .insert(logEntry)
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка записи в аудит лог', 'AUDIT_LOG_CREATE_ERROR', { error });
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
   * Записать неудачное действие в лог аудита
   */
  async logFailedAction(
    action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout',
    resourceType: string,
    errorMessage: string,
    metadata: Record<string, any> = {},
    responseTimeMs?: number
  ): Promise<DatabaseResponse<AuditLog>> {
    try {
      const logEntry: Omit<AuditLog, 'id' | 'created_at'> = {
        action,
        resource_type: resourceType,
        metadata,
        success: false,
        error_message: errorMessage,
        response_time_ms: responseTimeMs || null,
        ip_address: await this.getCurrentIP(),
        user_agent: navigator.userAgent,
        request_id: this.generateRequestId()
      };

      const { data, error } = await this.supabase
        .from('audit_logs')
        .insert(logEntry)
        .select()
        .single();

      if (error) {
        throw new RLSError('Ошибка записи в аудит лог', 'AUDIT_LOG_CREATE_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  // ==================== ПРОСМОТР ЛОГОВ ====================

  /**
   * Получить логи аудита текущего пользователя
   */
  async getCurrentUserLogs(limit: number = 50): Promise<DatabaseListResponse<AuditLog>> {
    try {
      const { data, error, count } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new RLSError('Ошибка получения логов аудита', 'AUDIT_LOGS_FETCH_ERROR', { error });
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
   * Получить логи аудита с фильтрацией (только для администраторов)
   */
  async getAuditLogs(filter?: AuditLogFilter, limit: number = 100): Promise<DatabaseListResponse<AuditLog>> {
    try {
      let query = this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact' });

      // Применяем фильтры
      if (filter) {
        if (filter.user_id) {
          query = query.eq('user_id', filter.user_id);
        }
        if (filter.action) {
          query = query.eq('action', filter.action);
        }
        if (filter.resource_type) {
          query = query.eq('resource_type', filter.resource_type);
        }
        if (filter.success !== undefined) {
          query = query.eq('success', filter.success);
        }
        if (filter.created_after) {
          query = query.gte('created_at', filter.created_after);
        }
        if (filter.created_before) {
          query = query.lte('created_at', filter.created_before);
        }
      }

      // Сортировка по времени создания (новые сначала)
      query = query.order('created_at', { ascending: false }).limit(limit);

      const { data, error, count } = await query;

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_AUDIT_LOGS);
        }
        throw new RLSError('Ошибка получения логов аудита', 'AUDIT_LOGS_FETCH_ERROR', { error });
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
   * Получить конкретный лог аудита по ID
   */
  async getAuditLogById(id: string): Promise<DatabaseResponse<AuditLog>> {
    try {
      const { data, error } = await this.supabase
        .from('audit_logs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_AUDIT_LOGS);
        }
        throw new RLSError('Ошибка получения лога аудита', 'AUDIT_LOG_FETCH_ERROR', { error });
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  // ==================== АНАЛИТИКА И ОТЧЕТЫ ====================

  /**
   * Получить статистику активности пользователей
   */
  async getActivityStats(days: number = 30): Promise<DatabaseResponse<{
    total_actions: number;
    successful_actions: number;
    failed_actions: number;
    by_action: Record<string, number>;
    by_resource: Record<string, number>;
    by_day: Array<{ date: string; count: number }>;
  }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: logs, error } = await this.supabase
        .from('audit_logs')
        .select('action, resource_type, success, created_at')
        .gte('created_at', startDate.toISOString());

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_AUDIT_LOGS);
        }
        throw new RLSError('Ошибка получения статистики', 'AUDIT_STATS_ERROR', { error });
      }

      const stats = {
        total_actions: logs?.length || 0,
        successful_actions: 0,
        failed_actions: 0,
        by_action: {} as Record<string, number>,
        by_resource: {} as Record<string, number>,
        by_day: [] as Array<{ date: string; count: number }>
      };

      // Подготовка статистики по дням
      const dayStats: Record<string, number> = {};
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dayStats[dateStr] = 0;
      }

      logs?.forEach((log: any) => {
        // Статистика успешности
        if (log.success) {
          stats.successful_actions++;
        } else {
          stats.failed_actions++;
        }

        // Статистика по действиям
        stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;

        // Статистика по ресурсам
        stats.by_resource[log.resource_type] = (stats.by_resource[log.resource_type] || 0) + 1;

        // Статистика по дням
        const logDate = new Date(log.created_at).toISOString().split('T')[0];
        if (logDate && dayStats.hasOwnProperty(logDate)) {
          const currentCount = dayStats[logDate];
          if (currentCount !== undefined) {
            dayStats[logDate] = currentCount + 1;
          }
        }
      });

      // Конвертация статистики по дням в массив
      stats.by_day = Object.entries(dayStats)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return { data: stats, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Получить подозрительную активность
   */
  async getSuspiciousActivity(hours: number = 24): Promise<DatabaseListResponse<AuditLog>> {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const { data, error, count } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', startTime.toISOString())
        .or('success.eq.false,response_time_ms.gt.5000')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.VIEW_SECURITY_EVENTS);
        }
        throw new RLSError('Ошибка получения подозрительной активности', 'SUSPICIOUS_ACTIVITY_ERROR', { error });
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

  // ==================== СПЕЦИАЛИЗИРОВАННЫЕ ЛОГИ ====================

  /**
   * Записать лог входа пользователя
   */
  async logLogin(sessionId?: string, deviceInfo?: Record<string, any>): Promise<DatabaseResponse<AuditLog>> {
    return this.logAction('login', 'user_session', sessionId, {
      ...deviceInfo,
      login_time: new Date().toISOString()
    });
  }

  /**
   * Записать лог выхода пользователя
   */
  async logLogout(sessionId?: string, reason?: string): Promise<DatabaseResponse<AuditLog>> {
    return this.logAction('logout', 'user_session', sessionId, {
      logout_time: new Date().toISOString(),
      reason: reason || 'user_logout'
    });
  }

  /**
   * Записать лог изменения профиля
   */
  async logProfileUpdate(
    profileId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>
  ): Promise<DatabaseResponse<AuditLog>> {
    return this.logAction('update', 'user_profile', profileId, {
      fields_changed: Object.keys(newValues),
      update_time: new Date().toISOString()
    }, oldValues, newValues);
  }

  /**
   * Записать лог безопасности
   */
  async logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>
  ): Promise<DatabaseResponse<AuditLog>> {
    return this.logAction('create', 'security_event', undefined, {
      event_type: eventType,
      severity,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // ==================== UTILITY МЕТОДЫ ====================

  /**
   * Генерировать уникальный ID запроса
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получить текущий IP адрес (заглушка для клиентской части)
   */
  private async getCurrentIP(): Promise<string | null> {
    try {
      // В реальном приложении IP должен передаваться с сервера
      // Здесь возвращаем null для клиентской части
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Очистка старых логов (только для администраторов)
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<DatabaseResponse<number>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { data, error } = await this.supabase
        .from('audit_logs')
        .delete()
        .lte('created_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        if (error.code === 'PGRST116') {
          throw new PermissionError(Permission.MANAGE_SECURITY_EVENTS);
        }
        throw new RLSError('Ошибка очистки логов', 'AUDIT_CLEANUP_ERROR', { error });
      }

      return { data: data?.length || 0, error: null };
    } catch (error) {
      return { 
        data: 0, 
        error: error instanceof Error ? error : new Error('Неизвестная ошибка') 
      };
    }
  }

  /**
   * Экспорт логов в CSV формат (только для администраторов)
   */
  async exportLogs(filter?: AuditLogFilter): Promise<DatabaseResponse<string>> {
    try {
      const { data: logs } = await this.getAuditLogs(filter, 10000);
      
      if (!logs || logs.length === 0) {
        return { data: '', error: null };
      }

      // Создание CSV заголовков
      const headers = [
        'id', 'user_id', 'session_id', 'action', 'resource_type', 'resource_id',
        'success', 'error_message', 'ip_address', 'user_agent', 'created_at'
      ];

      // Создание CSV строк
      const csvRows = [
        headers.join(','),
        ...logs.map(log => [
          log.id,
          log.user_id || '',
          log.session_id || '',
          log.action,
          log.resource_type,
          log.resource_id || '',
          log.success,
          log.error_message || '',
          log.ip_address || '',
          (log.user_agent || '').replace(/,/g, ';'),
          log.created_at
        ].join(','))
      ];

      return { data: csvRows.join('\n'), error: null };
    } catch (error) {
      return { 
        data: '', 
        error: error instanceof Error ? error : new Error('Ошибка экспорта логов') 
      };
    }
  }
}
