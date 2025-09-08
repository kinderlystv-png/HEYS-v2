// Утилиты для HEYS платформы

/**
 * Форматирует дату в читаемый формат
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Генерирует уникальный ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Безопасное получение значения из объекта
 */
export function safeGet<T>(obj: Record<string, unknown>, path: string, defaultValue: T): T {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    current = current[key] as Record<string, unknown>;
  }
  
  return current as T ?? defaultValue;
}

/**
 * Дебаунс функция
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}
