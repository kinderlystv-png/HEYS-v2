import { writable } from 'svelte/store';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// Глобальное состояние приложения
export const appState = writable({
  isLoading: false,
  user: null,
  theme: 'light',
});

// Состояние уведомлений
export const notifications = writable<Notification[]>([]);

// Добавление уведомления
export function addNotification(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
) {
  const id = Date.now();
  const notification: Notification = { id, message, type };

  notifications.update((items) => [...items, notification]);

  // Автоматическое удаление через 5 секунд
  setTimeout(() => {
    notifications.update((items) => items.filter((item) => item.id !== id));
  }, 5000);
}
