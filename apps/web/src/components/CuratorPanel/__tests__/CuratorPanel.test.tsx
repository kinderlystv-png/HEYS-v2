// __tests__/CuratorPanel.test.tsx - Тесты для панели куратора

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CuratorPanel from '../index';

// Мокаем API запросы
jest.mock('../hooks/useCuratorData', () => ({
  useCuratorData: () => ({
    data: {
      users: [
        {
          id: '1',
          name: 'Тестовый пользователь',
          email: 'test@example.com',
          role: 'user',
          permissions: ['read'],
          status: 'active',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
      ],
      tasks: [],
      stats: {
        totalUsers: 1,
        activeUsers: 1,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        pendingReview: 0,
        averageCompletionTime: 0,
        usersByRole: { user: 1 },
        tasksByStatus: {},
        tasksByPriority: {},
        recentActivity: [],
      },
      settings: {
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
      },
    },
    isLoading: false,
    error: null,
    refreshData: jest.fn(),
    updateUserRole: jest.fn().mockResolvedValue({ success: true }),
    updateTaskStatus: jest.fn().mockResolvedValue({ success: true }),
  }),
}));

describe('CuratorPanel', () => {
  it('должен рендериться без ошибок', () => {
    render(<CuratorPanel />);
    expect(screen.getByText('Панель куратора')).toBeInTheDocument();
  });

  it('должен показывать навигацию по вкладкам', () => {
    render(<CuratorPanel />);

    expect(screen.getByRole('tab', { name: /пользователи/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /задачи/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /статистика/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /настройки/i })).toBeInTheDocument();
  });

  it('должен переключаться между вкладками', async () => {
    const user = userEvent.setup();
    render(<CuratorPanel />);

    // По умолчанию активна вкладка пользователей
    expect(screen.getByRole('tabpanel', { name: /пользователи/i })).toBeInTheDocument();

    // Переключаемся на вкладку задач
    await user.click(screen.getByRole('tab', { name: /задачи/i }));

    await waitFor(() => {
      expect(screen.getByText('Задачи')).toBeInTheDocument();
    });
  });

  it('должен показывать статистику пользователей', async () => {
    render(<CuratorPanel />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument(); // totalUsers
      expect(screen.getByText('Всего пользователей')).toBeInTheDocument();
    });
  });

  it('должен показывать список пользователей', async () => {
    render(<CuratorPanel />);

    await waitFor(() => {
      expect(screen.getByText('Тестовый пользователь')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('должен позволять выбирать пользователя', async () => {
    const user = userEvent.setup();
    render(<CuratorPanel />);

    await waitFor(() => {
      expect(screen.getByText('Тестовый пользователь')).toBeInTheDocument();
    });

    // Кликаем на пользователя
    await user.click(screen.getByText('Тестовый пользователь'));

    // Должна появиться панель деталей
    await waitFor(() => {
      expect(screen.getByText('Детали пользователя')).toBeInTheDocument();
    });
  });

  it('должен показывать фильтры для пользователей', () => {
    render(<CuratorPanel />);

    expect(screen.getByLabelText(/поиск/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/роль/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/статус/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/сортировка/i)).toBeInTheDocument();
  });

  it('должен фильтровать пользователей по поисковому запросу', async () => {
    const user = userEvent.setup();
    render(<CuratorPanel />);

    const searchInput = screen.getByLabelText(/поиск/i);

    // Вводим поисковый запрос
    await user.type(searchInput, 'тестовый');

    await waitFor(() => {
      expect(screen.getByText('Тестовый пользователь')).toBeInTheDocument();
    });

    // Очищаем поиск
    await user.clear(searchInput);
    await user.type(searchInput, 'несуществующий');

    await waitFor(() => {
      expect(screen.getByText('Пользователи не найдены')).toBeInTheDocument();
    });
  });
});
