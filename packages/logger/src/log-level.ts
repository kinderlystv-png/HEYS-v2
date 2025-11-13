/**
 * Перечисление уровней логирования HEYS
 * Выделено в отдельный модуль, чтобы избежать циклических зависимостей
 * между конфигурацией и основным логгером.
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  HTTP = 'http',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}
