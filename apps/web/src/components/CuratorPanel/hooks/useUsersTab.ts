// hooks/useUsersTab.ts - Хук для управления вкладкой пользователей

import { useState, useMemo, useCallback } from 'react';

import { useCuratorContext } from '../context/CuratorContext';
import { CuratorUserRole } from '../types/curator.types';

export const useUsersTab = () => {
  const { curatorData, refreshData, updateUserRole } = useCuratorContext();
  const { users, isLoading, error } = curatorData;
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'createdAt' | 'lastActivity'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Фильтрация и сортировка пользователей
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const matchesSearch = 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      
      return matchesSearch && matchesRole && matchesStatus;
    });

    // Сортировка
    filtered = filtered.sort((a, b) => {
      let aValue: string | Date | number;
      let bValue: string | Date | number;

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'email':
          aValue = a.email.toLowerCase();
          bValue = b.email.toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'lastActivity':
          aValue = a.lastActivity || new Date(0);
          bValue = b.lastActivity || new Date(0);
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [users, searchTerm, roleFilter, statusFilter, sortBy, sortOrder]);
  
  // Получить выбранного пользователя
  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find(user => user.id === selectedUserId) || null;
  }, [users, selectedUserId]);
  
  // Статистика пользователей
  const userStats = useMemo(() => {
    const total = filteredAndSortedUsers.length;
    const active = filteredAndSortedUsers.filter(user => user.status === 'active').length;
    const inactive = filteredAndSortedUsers.filter(user => user.status === 'inactive').length;
    const suspended = filteredAndSortedUsers.filter(user => user.status === 'suspended').length;
    
    const byRole = filteredAndSortedUsers.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      active,
      inactive,
      suspended,
      byRole,
    };
  }, [filteredAndSortedUsers]);
  
  // Обработчики
  const handleUserSelect = useCallback((userId: string) => {
    setSelectedUserId(prevId => prevId === userId ? null : userId);
  }, []);
  
  const handleRoleUpdate = useCallback(async (userId: string, newRole: CuratorUserRole) => {
    try {
      const result = await updateUserRole(userId, newRole);
      if (result.success) {
        // Обновление прошло успешно, данные уже обновлены через refreshData
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Неизвестная ошибка' };
      }
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Неизвестная ошибка' 
      };
    }
  }, [updateUserRole]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
    setSortBy('name');
    setSortOrder('asc');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  // Обертки для setter'ов с правильной типизацией
  const handleSortByChange = useCallback((newSortBy: string) => {
    setSortBy(newSortBy as 'name' | 'email' | 'createdAt' | 'lastActivity');
  }, []);

  const handleSortOrderChange = useCallback((newSortOrder: string) => {
    setSortOrder(newSortOrder as 'asc' | 'desc');
  }, []);

  // Доступные опции для фильтров
  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set(users.map(user => user.role)));
    return [
      { value: 'all', label: 'Все роли' },
      ...roles.map(role => ({ value: role, label: role }))
    ];
  }, [users]);

  const statusOptions = useMemo(() => [
    { value: 'all', label: 'Все статусы' },
    { value: 'active', label: 'Активные' },
    { value: 'inactive', label: 'Неактивные' },
    { value: 'suspended', label: 'Заблокированные' }
  ], []);

  const sortOptions = useMemo(() => [
    { value: 'name', label: 'По имени' },
    { value: 'email', label: 'По email' },
    { value: 'createdAt', label: 'По дате создания' },
    { value: 'lastActivity', label: 'По последней активности' }
  ], []);

  return {
    // Данные
    users: filteredAndSortedUsers,
    selectedUser,
    userStats,
    isLoading,
    error,
    
    // Фильтры и сортировка
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy: handleSortByChange,
    sortOrder,
    setSortOrder: handleSortOrderChange,
    
    // Опции для фильтров
    roleOptions,
    statusOptions,
    sortOptions,
    
    // Действия
    handleUserSelect,
    handleRoleUpdate,
    clearFilters,
    clearSelection,
    refreshData,
  };
};
