// hooks/useTasksTab.ts - Хук для управления вкладкой задач

import { useCallback, useMemo, useState } from 'react';

import { useCuratorContext } from '../context/CuratorContext';
import { CuratorTaskStatus } from '../types/curator.types';

export const useTasksTab = () => {
  const { curatorData, refreshData, updateTaskStatus } = useCuratorContext();
  const { tasks, users, isLoading, error } = curatorData;

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'createdAt' | 'dueDate' | 'priority'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Фильтрация и сортировка задач
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
      const matchesAssignee = assigneeFilter === 'all' || task.assignedTo === assigneeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    });

    // Сортировка
    filtered = filtered.sort((a, b) => {
      let aValue: string | Date | number;
      let bValue: string | Date | number;

      switch (sortBy) {
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'dueDate':
          aValue = a.dueDate || new Date('2099-12-31');
          bValue = b.dueDate || new Date('2099-12-31');
          break;
        case 'priority': {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          aValue = priorityOrder[a.priority];
          bValue = priorityOrder[b.priority];
          break;
        }
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [tasks, searchTerm, statusFilter, priorityFilter, assigneeFilter, sortBy, sortOrder]);

  // Получить выбранную задачу
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((task) => task.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // Статистика задач
  const taskStats = useMemo(() => {
    const total = filteredAndSortedTasks.length;
    const pending = filteredAndSortedTasks.filter((task) => task.status === 'pending').length;
    const inProgress = filteredAndSortedTasks.filter(
      (task) => task.status === 'in-progress',
    ).length;
    const completed = filteredAndSortedTasks.filter((task) => task.status === 'completed').length;
    const overdue = filteredAndSortedTasks.filter(
      (task) => task.dueDate && task.dueDate < new Date() && task.status !== 'completed',
    ).length;

    const byPriority = filteredAndSortedTasks.reduce(
      (acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byStatus = filteredAndSortedTasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      pending,
      inProgress,
      completed,
      overdue,
      byPriority,
      byStatus,
    };
  }, [filteredAndSortedTasks]);

  // Получить имя пользователя по ID
  const getUserName = useCallback(
    (userId: string) => {
      const user = users.find((u) => u.id === userId);
      return user ? user.name : 'Неизвестный пользователь';
    },
    [users],
  );

  // Обработчики
  const handleTaskSelect = useCallback((taskId: string) => {
    setSelectedTaskId((prevId) => (prevId === taskId ? null : taskId));
  }, []);

  const handleStatusUpdate = useCallback(
    async (taskId: string, newStatus: CuratorTaskStatus) => {
      try {
        const result = await updateTaskStatus(taskId, newStatus);
        if (result.success) {
          return { success: true };
        } else {
          return { success: false, error: result.error || 'Неизвестная ошибка' };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Неизвестная ошибка',
        };
      }
    },
    [updateTaskStatus],
  );

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setSortBy('createdAt');
    setSortOrder('desc');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  // Доступные опции для фильтров
  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'Все статусы' },
      { value: 'pending', label: 'Ожидает' },
      { value: 'in-progress', label: 'В работе' },
      { value: 'completed', label: 'Завершена' },
      { value: 'rejected', label: 'Отклонена' },
      { value: 'cancelled', label: 'Отменена' },
    ],
    [],
  );

  const priorityOptions = useMemo(
    () => [
      { value: 'all', label: 'Все приоритеты' },
      { value: 'critical', label: 'Критический' },
      { value: 'high', label: 'Высокий' },
      { value: 'medium', label: 'Средний' },
      { value: 'low', label: 'Низкий' },
    ],
    [],
  );

  const assigneeOptions = useMemo(() => {
    const assignees = Array.from(new Set(tasks.map((task) => task.assignedTo).filter(Boolean)));
    return [
      { value: 'all', label: 'Все исполнители' },
      ...assignees.map((assigneeId) => ({
        value: assigneeId as string,
        label: getUserName(assigneeId as string),
      })),
    ];
  }, [tasks, getUserName]);

  const sortOptions = useMemo(
    () => [
      { value: 'title', label: 'По названию' },
      { value: 'createdAt', label: 'По дате создания' },
      { value: 'dueDate', label: 'По сроку выполнения' },
      { value: 'priority', label: 'По приоритету' },
    ],
    [],
  );

  return {
    // Данные
    tasks: filteredAndSortedTasks,
    selectedTask,
    taskStats,
    isLoading,
    error,

    // Фильтры и сортировка
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    assigneeFilter,
    setAssigneeFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,

    // Опции для фильтров
    statusOptions,
    priorityOptions,
    assigneeOptions,
    sortOptions,

    // Действия
    handleTaskSelect,
    handleStatusUpdate,
    clearFilters,
    clearSelection,
    refreshData,
    getUserName,
  };
};
