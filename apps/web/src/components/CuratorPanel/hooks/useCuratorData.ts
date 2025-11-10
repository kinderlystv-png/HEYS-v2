// hooks/useCuratorData.ts - Основной хук для работы с данными куратора

import { useCallback, useEffect, useState } from 'react';

import {
  ApiResponse,
  CuratorSettings,
  CuratorStats,
  CuratorTask,
  CuratorUser,
} from '../types/curator.types';
import { logger } from '../utils/logger';

interface CuratorDataResponse {
  users: CuratorUser[];
  tasks: CuratorTask[];
  stats: CuratorStats;
  settings: CuratorSettings;
}

// Мок API - в реальном проекте будет заменен на реальные API вызовы
const mockApi = {
  async get<T>(url: string): Promise<ApiResponse<T>> {
    // Симуляция API задержки
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Мок данные
    const mockData: Record<string, unknown> = {
      '/curator/users': [
        {
          id: '1',
          name: 'Иван Петров',
          email: 'ivan@example.com',
          role: 'admin',
          permissions: ['read', 'write', 'delete'],
          status: 'active',
          createdAt: new Date('2023-01-15'),
          updatedAt: new Date('2024-09-01'),
          lastActivity: new Date('2024-09-04'),
        },
        {
          id: '2',
          name: 'Мария Сидорова',
          email: 'maria@example.com',
          role: 'curator',
          permissions: ['read', 'write'],
          status: 'active',
          createdAt: new Date('2023-03-20'),
          updatedAt: new Date('2024-08-30'),
          lastActivity: new Date('2024-09-03'),
        },
        {
          id: '3',
          name: 'Алексей Смирнов',
          email: 'alexey@example.com',
          role: 'moderator',
          permissions: ['read'],
          status: 'inactive',
          createdAt: new Date('2023-06-10'),
          updatedAt: new Date('2024-08-25'),
          lastActivity: new Date('2024-08-25'),
        },
      ] as CuratorUser[],

      '/curator/tasks': [
        {
          id: '1',
          title: 'Проверить новых пользователей',
          description: 'Необходимо проверить документы и подтвердить регистрацию',
          status: 'pending',
          priority: 'high',
          assignedTo: '2',
          assignedBy: '1',
          dueDate: new Date('2024-09-10'),
          createdAt: new Date('2024-09-01'),
          updatedAt: new Date('2024-09-02'),
          tags: ['verification', 'users'],
        },
        {
          id: '2',
          title: 'Обновить политику безопасности',
          description: 'Пересмотреть и обновить документы по безопасности',
          status: 'in-progress',
          priority: 'medium',
          assignedTo: '1',
          assignedBy: '1',
          dueDate: new Date('2024-09-15'),
          createdAt: new Date('2024-08-25'),
          updatedAt: new Date('2024-09-03'),
          tags: ['security', 'policy'],
        },
        {
          id: '3',
          title: 'Анализ отчетов за август',
          description: 'Подготовить сводный отчет по активности пользователей',
          status: 'completed',
          priority: 'low',
          assignedTo: '3',
          assignedBy: '2',
          completedAt: new Date('2024-09-01'),
          createdAt: new Date('2024-08-20'),
          updatedAt: new Date('2024-09-01'),
          tags: ['reports', 'analytics'],
        },
      ] as CuratorTask[],

      '/curator/stats': {
        totalUsers: 150,
        activeUsers: 127,
        totalTasks: 45,
        completedTasks: 32,
        pendingTasks: 8,
        inProgressTasks: 5,
        pendingReview: 3,
        averageCompletionTime: 48.5,
        usersByRole: {
          admin: 2,
          curator: 8,
          moderator: 15,
          user: 125,
        },
        tasksByStatus: {
          pending: 8,
          'in-progress': 5,
          completed: 32,
          rejected: 0,
          cancelled: 0,
        },
        tasksByPriority: {
          low: 12,
          medium: 18,
          high: 13,
          critical: 2,
        },
        recentActivity: [
          {
            id: '1',
            type: 'task_completed',
            taskId: '3',
            description: 'Задача "Анализ отчетов за август" выполнена',
            timestamp: new Date('2024-09-01T14:30:00'),
          },
          {
            id: '2',
            type: 'user_created',
            userId: '4',
            description: 'Создан новый пользователь "Елена Новикова"',
            timestamp: new Date('2024-09-03T09:15:00'),
          },
        ],
      } as CuratorStats,

      '/curator/settings': {
        notifications: {
          email: true,
          push: false,
          taskUpdates: true,
          userUpdates: true,
        },
        display: {
          theme: 'light',
          language: 'ru',
          timezone: 'Europe/Moscow',
          itemsPerPage: 20,
        },
        permissions: {
          canCreateUsers: true,
          canDeleteUsers: false,
          canModifyRoles: true,
          canViewAnalytics: true,
          canExportData: true,
        },
      } as CuratorSettings,
    };

    const data = mockData[url];
    if (!data) {
      throw new Error(`API endpoint ${url} not found`);
    }

    return {
      data: data as T,
      success: true,
      message: 'Data fetched successfully',
    };
  },

  async put<T>(_url: string, _body: unknown): Promise<ApiResponse<T>> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Logger будет добавлен в utils для production logging
    return {
      data: {} as T,
      success: true,
      message: 'Data updated successfully',
    };
  },
};

export const useCuratorData = () => {
  const [data, setData] = useState<CuratorDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      logger.info('🔄 Загрузка данных куратора...');

      // Объединяем запросы для оптимизации
      const [usersResponse, tasksResponse, statsResponse, settingsResponse] = await Promise.all([
        mockApi.get<CuratorUser[]>('/curator/users'),
        mockApi.get<CuratorTask[]>('/curator/tasks'),
        mockApi.get<CuratorStats>('/curator/stats'),
        mockApi.get<CuratorSettings>('/curator/settings'),
      ]);

      const fetchedData: CuratorDataResponse = {
        users: usersResponse.data,
        tasks: tasksResponse.data,
        stats: statsResponse.data,
        settings: settingsResponse.data,
      };

      setData(fetchedData);
      logger.info('✅ Данные куратора загружены:', fetchedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err : new Error('Unknown error occurred');
      setError(errorMessage);
      logger.error('❌ Ошибка загрузки данных куратора:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshData = useCallback(async () => {
    logger.info('🔄 Обновление данных куратора...');
    return fetchData();
  }, [fetchData]);

  const updateUserRole = useCallback(
    async (userId: string, newRole: string) => {
      try {
        await mockApi.put(`/curator/users/${userId}`, { role: newRole });
        await refreshData();
        return { success: true };
      } catch (err) {
        logger.error('Ошибка обновления роли пользователя:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
    [refreshData],
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await mockApi.put(`/curator/tasks/${taskId}`, { status: newStatus });
        await refreshData();
        return { success: true };
      } catch (err) {
        logger.error('Ошибка обновления статуса задачи:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
    [refreshData],
  );

  return {
    data,
    isLoading,
    error,
    refreshData,
    updateUserRole,
    updateTaskStatus,
  };
};
