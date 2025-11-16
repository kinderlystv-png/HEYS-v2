/**
 * Visual Debug Logger для Telegram Mini App
 * Показывает логи прямо в UI, как в браузере
 */

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: unknown;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 50;
  private subscribers = new Set<(logs: LogEntry[]) => void>();

  log(level: LogEntry['level'], message: string, data?: unknown) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      level,
      message,
      data
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.notify();
  }

  info(message: string, data?: unknown) {
    this.log('info', message, data);
  }

  success(message: string, data?: unknown) {
    this.log('success', message, data);
  }

  warn(message: string, data?: unknown) {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.log('error', message, data);
  }

  getLogs() {
    return this.logs;
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(callback: (logs: LogEntry[]) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((callback) => callback([...this.logs]));
  }
}

export const debugLogger = new DebugLogger();
export type { LogEntry };
