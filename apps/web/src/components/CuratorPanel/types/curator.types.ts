// types/curator.types.ts - Типы для панели куратора

export interface CuratorUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'curator' | 'moderator' | 'user';
  permissions: string[];
  avatar?: string;
  status: 'active' | 'inactive' | 'suspended';
  lastActivity?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CuratorTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'rejected' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  assignedBy?: string;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  attachments?: string[];
  comments?: CuratorTaskComment[];
}

export interface CuratorTaskComment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CuratorStats {
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  pendingReview: number;
  averageCompletionTime: number; // в часах
  usersByRole: Record<string, number>;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  recentActivity: CuratorActivity[];
}

export interface CuratorActivity {
  id: string;
  type: 'user_created' | 'user_updated' | 'task_created' | 'task_completed' | 'role_changed';
  userId?: string;
  taskId?: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CuratorSettings {
  notifications: {
    email: boolean;
    push: boolean;
    taskUpdates: boolean;
    userUpdates: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string;
    itemsPerPage: number;
  };
  permissions: {
    canCreateUsers: boolean;
    canDeleteUsers: boolean;
    canModifyRoles: boolean;
    canViewAnalytics: boolean;
    canExportData: boolean;
  };
}

export interface CuratorData {
  users: CuratorUser[];
  tasks: CuratorTask[];
  stats: CuratorStats;
  settings: CuratorSettings;
  isLoading: boolean;
  error: Error | null;
}

export type TabId = 'users' | 'tasks' | 'statistics' | 'settings';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CuratorFilters {
  users: {
    role?: string;
    status?: string;
    search?: string;
    sortBy?: 'name' | 'email' | 'createdAt' | 'lastActivity';
    sortOrder?: 'asc' | 'desc';
  };
  tasks: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    search?: string;
    sortBy?: 'title' | 'createdAt' | 'dueDate' | 'priority';
    sortOrder?: 'asc' | 'desc';
  };
}

// Утилитарные типы
export type CuratorUserRole = CuratorUser['role'];
export type CuratorTaskStatus = CuratorTask['status'];
export type CuratorTaskPriority = CuratorTask['priority'];
