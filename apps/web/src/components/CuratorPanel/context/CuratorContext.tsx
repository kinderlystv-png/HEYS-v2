// context/CuratorContext.tsx - Контекст для общих данных панели куратора

import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import { useCuratorData } from '../hooks/useCuratorData';
import { CuratorData, TabId } from '../types/curator.types';

interface CuratorContextValue {
  curatorData: CuratorData;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  refreshData: () => Promise<void>;
  updateUserRole: (
    userId: string,
    newRole: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateTaskStatus: (
    taskId: string,
    newStatus: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const CuratorContext = createContext<CuratorContextValue | undefined>(undefined);

interface CuratorProviderProps {
  children: ReactNode;
  initialTab?: TabId;
}

export const CuratorProvider: React.FC<CuratorProviderProps> = ({
  children,
  initialTab = 'users',
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const { data, isLoading, error, refreshData, updateUserRole, updateTaskStatus } =
    useCuratorData();

  const curatorData: CuratorData = useMemo(
    () => ({
      users: data?.users || [],
      tasks: data?.tasks || [],
      stats: data?.stats || {
        totalUsers: 0,
        activeUsers: 0,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        pendingReview: 0,
        averageCompletionTime: 0,
        usersByRole: {},
        tasksByStatus: {},
        tasksByPriority: {},
        recentActivity: [],
      },
      settings: data?.settings || {
        notifications: {
          email: false,
          push: false,
          taskUpdates: false,
          userUpdates: false,
        },
        display: {
          theme: 'light',
          language: 'ru',
          timezone: 'Europe/Moscow',
          itemsPerPage: 20,
        },
        permissions: {
          canCreateUsers: false,
          canDeleteUsers: false,
          canModifyRoles: false,
          canViewAnalytics: false,
          canExportData: false,
        },
      },
      isLoading,
      error,
    }),
    [data, isLoading, error],
  );

  const value = useMemo(
    () => ({
      curatorData,
      activeTab,
      setActiveTab,
      refreshData,
      updateUserRole,
      updateTaskStatus,
    }),
    [curatorData, activeTab, refreshData, updateUserRole, updateTaskStatus],
  );

  return <CuratorContext.Provider value={value}>{children}</CuratorContext.Provider>;
};

export const useCuratorContext = (): CuratorContextValue => {
  const context = useContext(CuratorContext);
  if (context === undefined) {
    throw new Error('useCuratorContext must be used within a CuratorProvider');
  }
  return context;
};
