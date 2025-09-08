/**
 * HEYS Platform - Log Level Manager
 * Система управления уровнями логирования во время выполнения
 */

import { DEFAULT_CONFIG, LOG_LEVELS, LEVEL_VALUES, LEVEL_ALIASES } from '../../levels.config.js';
import { getEnvironmentConfig } from '../config/environment.config.js';

export type LogLevelName = keyof typeof LOG_LEVELS;
export type LogLevelValue = number;

export interface LevelManagerOptions {
  initialLevel?: LogLevelName | string;
  environment?: string;
  autoAdjust?: boolean;
  persistLevel?: boolean;
}

export interface LevelChangeEvent {
  previousLevel: LogLevelName;
  newLevel: LogLevelName;
  timestamp: Date;
  reason?: string;
}

export class LevelManager {
  private currentLevel: LogLevelName;
  private environment: string;
  private autoAdjust: boolean;
  private persistLevel: boolean;
  private listeners: ((event: LevelChangeEvent) => void)[] = [];
  private levelHistory: LevelChangeEvent[] = [];
  
  constructor(options: LevelManagerOptions = {}) {
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.autoAdjust = options.autoAdjust ?? true;
    this.persistLevel = options.persistLevel ?? false;
    
    // Инициализируем уровень
    const envConfig = getEnvironmentConfig(this.environment);
    const initialLevel = options.initialLevel || envConfig.level || 'info';
    this.currentLevel = this.normalizeLevel(initialLevel) as LogLevelName;
    
    // Загружаем сохранённый уровень если включена персистентность
    if (this.persistLevel) {
      this.loadPersistedLevel();
    }
    
    // Автоматическая настройка по NODE_ENV
    if (this.autoAdjust) {
      this.setupAutoAdjustment();
    }
  }
  
  /**
   * Получить текущий уровень логирования
   */
  getCurrentLevel(): LogLevelName {
    return this.currentLevel;
  }
  
  /**
   * Получить значение текущего уровня
   */
  getCurrentLevelValue(): LogLevelValue {
    return LOG_LEVELS[this.currentLevel].value;
  }
  
  /**
   * Установить новый уровень логирования
   */
  setLevel(level: LogLevelName | string, reason?: string): boolean {
    const normalizedLevel = this.normalizeLevel(level);
    
    if (!this.isValidLevel(normalizedLevel)) {
      throw new Error(`Invalid log level: ${level}. Valid levels: ${Object.keys(LOG_LEVELS).join(', ')}`);
    }
    
    const previousLevel = this.currentLevel;
    const newLevel = normalizedLevel as LogLevelName;
    
    // Проверяем, нужно ли изменять уровень
    if (previousLevel === newLevel) {
      return false;
    }
    
    this.currentLevel = newLevel;
    
    // Создаём событие изменения
    const changeEvent: LevelChangeEvent = {
      previousLevel,
      newLevel,
      timestamp: new Date(),
      reason
    };
    
    // Добавляем в историю
    this.levelHistory.push(changeEvent);
    
    // Ограничиваем историю до 100 записей
    if (this.levelHistory.length > 100) {
      this.levelHistory = this.levelHistory.slice(-100);
    }
    
    // Сохраняем если включена персистентность
    if (this.persistLevel) {
      this.savePersistedLevel();
    }
    
    // Уведомляем слушателей
    this.notifyListeners(changeEvent);
    
    return true;
  }
  
  /**
   * Проверить, включен ли определённый уровень
   */
  isEnabled(level: LogLevelName | string): boolean {
    const normalizedLevel = this.normalizeLevel(level);
    
    if (!this.isValidLevel(normalizedLevel)) {
      return false;
    }
    
    const levelValue = LOG_LEVELS[normalizedLevel as LogLevelName].value;
    const currentValue = this.getCurrentLevelValue();
    
    return levelValue >= currentValue;
  }
  
  /**
   * Временно изменить уровень на указанное время
   */
  temporaryLevel(level: LogLevelName | string, durationMs: number, reason?: string): Promise<void> {
    const previousLevel = this.getCurrentLevel();
    this.setLevel(level, reason || `Temporary level change for ${durationMs}ms`);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.setLevel(previousLevel, 'Reverting from temporary level change');
        resolve();
      }, durationMs);
    });
  }
  
  /**
   * Поднять уровень логирования (уменьшить детализацию)
   */
  raiseLevel(steps: number = 1): boolean {
    const levels = Object.keys(LOG_LEVELS);
    const currentIndex = levels.indexOf(this.currentLevel);
    const newIndex = Math.max(0, currentIndex - steps);
    
    if (newIndex !== currentIndex) {
      return this.setLevel(levels[newIndex] as LogLevelName, `Raised level by ${steps} steps`);
    }
    
    return false;
  }
  
  /**
   * Понизить уровень логирования (увеличить детализацию)
   */
  lowerLevel(steps: number = 1): boolean {
    const levels = Object.keys(LOG_LEVELS);
    const currentIndex = levels.indexOf(this.currentLevel);
    const newIndex = Math.min(levels.length - 1, currentIndex + steps);
    
    if (newIndex !== currentIndex) {
      return this.setLevel(levels[newIndex] as LogLevelName, `Lowered level by ${steps} steps`);
    }
    
    return false;
  }
  
  /**
   * Получить все доступные уровни
   */
  getAvailableLevels(): Array<{ name: LogLevelName; value: LogLevelValue; description: string }> {
    return Object.entries(LOG_LEVELS).map(([name, config]) => ({
      name: name as LogLevelName,
      value: config.value,
      description: config.description
    }));
  }
  
  /**
   * Получить конфигурацию для текущего окружения
   */
  getEnvironmentConfig() {
    return getEnvironmentConfig(this.environment);
  }
  
  /**
   * Подписаться на изменения уровня
   */
  onLevelChange(listener: (event: LevelChangeEvent) => void): () => void {
    this.listeners.push(listener);
    
    // Возвращаем функцию отписки
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Получить историю изменений уровней
   */
  getLevelHistory(): LevelChangeEvent[] {
    return [...this.levelHistory];
  }
  
  /**
   * Очистить историю изменений
   */
  clearHistory(): void {
    this.levelHistory = [];
  }
  
  /**
   * Получить статистику по уровням
   */
  getStatistics() {
    const levelCounts = this.levelHistory.reduce((acc, event) => {
      acc[event.newLevel] = (acc[event.newLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      currentLevel: this.currentLevel,
      currentLevelValue: this.getCurrentLevelValue(),
      totalChanges: this.levelHistory.length,
      levelCounts,
      environment: this.environment,
      autoAdjust: this.autoAdjust,
      persistLevel: this.persistLevel
    };
  }
  
  /**
   * Сбросить уровень к значению по умолчанию для окружения
   */
  resetToDefault(): boolean {
    const envConfig = getEnvironmentConfig(this.environment);
    return this.setLevel(envConfig.level, 'Reset to environment default');
  }
  
  // Приватные методы
  
  private normalizeLevel(level: string): string {
    const normalized = level.toLowerCase().trim();
    return LEVEL_ALIASES[normalized] || normalized;
  }
  
  private isValidLevel(level: string): boolean {
    return level in LOG_LEVELS;
  }
  
  private notifyListeners(event: LevelChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        // Не логируем ошибки в слушателях, чтобы избежать циклических зависимостей
        console.error('Error in level change listener:', error);
      }
    });
  }
  
  private setupAutoAdjustment(): void {
    // Автоматическая настройка уровня при изменении NODE_ENV
    const originalEnv = process.env.NODE_ENV;
    
    // Проверяем изменения каждые 30 секунд в development
    if (this.environment === 'development') {
      setInterval(() => {
        if (process.env.NODE_ENV !== originalEnv) {
          const newConfig = getEnvironmentConfig(process.env.NODE_ENV);
          this.setLevel(newConfig.level, 'Auto-adjusted for environment change');
        }
      }, 30000);
    }
  }
  
  private savePersistedLevel(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Browser environment
      localStorage.setItem('heys-log-level', this.currentLevel);
    } else if (typeof process !== 'undefined') {
      // Node.js environment
      try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), '.heys-log-level');
        fs.writeFileSync(configPath, this.currentLevel);
      } catch {
        // Игнорируем ошибки записи
      }
    }
  }
  
  private loadPersistedLevel(): void {
    let persistedLevel: string | null = null;
    
    if (typeof window !== 'undefined' && window.localStorage) {
      // Browser environment
      persistedLevel = localStorage.getItem('heys-log-level');
    } else if (typeof process !== 'undefined') {
      // Node.js environment
      try {
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(process.cwd(), '.heys-log-level');
        if (fs.existsSync(configPath)) {
          persistedLevel = fs.readFileSync(configPath, 'utf8').trim();
        }
      } catch {
        // Игнорируем ошибки чтения
      }
    }
    
    if (persistedLevel && this.isValidLevel(this.normalizeLevel(persistedLevel))) {
      this.currentLevel = this.normalizeLevel(persistedLevel) as LogLevelName;
    }
  }
}

// Синглтон для глобального использования
export const globalLevelManager = new LevelManager({
  environment: process.env.NODE_ENV,
  autoAdjust: true,
  persistLevel: false
});

// Удобные экспорты
export default LevelManager;
